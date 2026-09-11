#!/usr/bin/env bash
#
# Harvest & Co. デモ環境のセットアップ。
#
#   cp config.example.env config.env    # PROJECT_ID を書く
#   ./setup.sh                          # 全ステップを実行
#   ./setup.sh site agent               # 一部のステップだけ実行
#   ./setup.sh --list                   # ステップ一覧
#
# 何度実行しても同じ結果になるように書いてあります (作成済みのものはスキップ)。
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-$REPO_DIR/config.env}"

ALL_STEPS=(apis iam firestore catalog search-api mcp agent webconfig site)

STEP_DESC_apis="必要な Google Cloud API を有効化する"
STEP_DESC_iam="サービスアカウントに権限を付与する"
STEP_DESC_firestore="Firestore を作成し商品データ 28 件を登録する"
STEP_DESC_catalog="products.jsonl を生成し AI Commerce Search に取り込む"
STEP_DESC_searchapi="検索 API (search-api) を Cloud Run にデプロイする"
STEP_DESC_mcp="MCP サーバー (mcp-server) を Cloud Run にデプロイする"
STEP_DESC_agent="CES アプリを取り込み、ツールセット・バージョン・公開デプロイメントを構成する"
STEP_DESC_webconfig="js/config.js を生成する"
STEP_DESC_site="EC サイトを Cloud Run にデプロイする"

# =============================================================================
# ログ
# =============================================================================
if [ -t 2 ]; then C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_0=$'\033[0m'
else C_B=''; C_G=''; C_Y=''; C_R=''; C_0=''; fi

# 人間向けの出力はすべて stderr へ。stdout は関数の戻り値専用にしておく
# (resolve_site_url などを $(...) で呼んでもメッセージが混入しないようにするため)
log()  { printf '%s\n' "${C_G}▸${C_0} $*" >&2; }
warn() { printf '%s\n' "${C_Y}警告:${C_0} $*" >&2; }
die()  { printf '%s\n' "${C_R}エラー:${C_0} $*" >&2; exit 1; }
head1() { printf '\n%s\n' "${C_B}=== $* ===${C_0}" >&2; }

# =============================================================================
# 設定の読み込み
# =============================================================================
load_config() {
  [ -f "$CONFIG_FILE" ] || die "$CONFIG_FILE がありません。cp config.example.env config.env してから編集してください。"

  # 実行時に渡された環境変数 (FORCE_AGENT_IMPORT=true ./setup.sh agent など) を
  # config.env より優先する。素直に source すると config.env の値で上書きされてしまい、
  # 指定したつもりの一時的な上書きが黙って無視されるため。
  local overrides key names=()
  overrides="$(mktemp)"
  while IFS= read -r key; do
    if [ -n "${!key+x}" ]; then
      printf '%s=%q\n' "$key" "${!key}" >> "$overrides"
      names+=("$key")
    fi
  done < <(sed -n 's/^[[:space:]]*\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$CONFIG_FILE" | sort -u)

  set -a
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
  # shellcheck disable=SC1090
  . "$overrides"
  set +a
  rm -f "$overrides"
  [ ${#names[@]} -eq 0 ] || log "環境変数で上書き: ${names[*]}"

  [ -n "${PROJECT_ID:-}" ] || die "config.env の PROJECT_ID を設定してください。"

  : "${REGION:=asia-northeast1}"
  : "${MCP_REGION:=us-central1}"
  : "${CES_LOCATION:=us}"
  : "${SITE_SERVICE:=agentic-commerce}"
  : "${SEARCH_API_SERVICE:=harvest-search-api}"
  : "${MCP_SERVICE:=harvest-commerce-mcp}"
  : "${CATALOG_LOCATION:=global}"
  : "${CATALOG_ID:=default_catalog}"
  : "${BRANCH_ID:=default_branch}"
  : "${SERVING_CONFIG_ID:=default_search}"
  : "${QUERY_EXPANSION:=AUTO}"
  : "${FIRESTORE_COLLECTION:=products}"
  : "${CES_APP_ID:=harvest-commerce}"
  : "${CES_DEPLOYMENT_ID:=web-widget}"
  : "${FORCE_AGENT_IMPORT:=false}"
  : "${SITE_URL:=}"
  : "${EXTRA_ALLOWED_ORIGINS:=}"
  : "${GCS_BUCKET:=${PROJECT_ID}-harvest-setup}"

  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')" \
    || die "プロジェクト $PROJECT_ID を参照できません。gcloud auth login を確認してください。"
  RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  CES_SA="service-${PROJECT_NUMBER}@gcp-sa-ces.iam.gserviceaccount.com"
  CES_APP="projects/${PROJECT_ID}/locations/${CES_LOCATION}/apps/${CES_APP_ID}"
}

# =============================================================================
# 小道具
# =============================================================================
require() { command -v "$1" >/dev/null 2>&1 || die "$1 が必要です。インストールしてください。"; }

# CES API 呼び出し。トークンは表示しない
ces_api() {
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -sS -X "$method" -H "Authorization: Bearer $(gcloud auth print-access-token)" \
      -H 'Content-Type: application/json' "https://ces.googleapis.com/v1beta/${path}" -d "$data"
  else
    curl -sS -X "$method" -H "Authorization: Bearer $(gcloud auth print-access-token)" \
      "https://ces.googleapis.com/v1beta/${path}"
  fi
}

# レスポンスに error があれば止める
check_api_error() {
  python3 -c '
import sys, json
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except ValueError:
    sys.exit("APIの応答を解析できません: " + raw[:300])
if isinstance(d, dict) and d.get("error"):
    sys.exit("API エラー: " + json.dumps(d["error"], ensure_ascii=False)[:500])
print(raw)
'
}

json_get() { python3 -c 'import sys,json;d=json.load(sys.stdin);
k=sys.argv[1].split(".")
for part in k:
    d = (d or {}).get(part) if isinstance(d, dict) else None
print(d if d is not None else "")' "$1"; }

run_service_url() {
  gcloud run services describe "$1" --project "$PROJECT_ID" --region "$2" \
    --format='value(status.url)' 2>/dev/null || true
}

# サイトの URL を決める。未デプロイならここでブートストラップデプロイする
RESOLVED_SITE_URL=""
resolve_site_url() {
  if [ -n "$RESOLVED_SITE_URL" ]; then printf '%s' "$RESOLVED_SITE_URL"; return; fi
  if [ -n "$SITE_URL" ]; then
    RESOLVED_SITE_URL="${SITE_URL%/}"
  else
    local url; url="$(run_service_url "$SITE_SERVICE" "$REGION")"
    if [ -z "$url" ]; then
      log "サイトが未デプロイのため、URL を確定させるために先にデプロイします。"
      step_site >&2
      url="$(run_service_url "$SITE_SERVICE" "$REGION")"
      [ -n "$url" ] || die "$SITE_SERVICE の URL を取得できませんでした。"
    fi
    RESOLVED_SITE_URL="${url%/}"
  fi
  printf '%s' "$RESOLVED_SITE_URL"
}

# 許可オリジンの一覧 (カンマ区切り)
allowed_origins() {
  local site; site="$(resolve_site_url)"
  # Cloud Run は同じサービスに複数形式の URL を割り当てることがあるので、
  # 決定的な形式 (service-projectnumber.region.run.app) も併せて許可しておく
  local deterministic="https://${SITE_SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
  local list="$site"
  [ "$deterministic" = "$site" ] || list="$list,$deterministic"
  [ -z "$EXTRA_ALLOWED_ORIGINS" ] || list="$list,$EXTRA_ALLOWED_ORIGINS"
  printf '%s' "$list"
}

# =============================================================================
# 1. API 有効化
# =============================================================================
step_apis() {
  head1 "API を有効化"
  gcloud services enable \
    run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    firestore.googleapis.com firebase.googleapis.com retail.googleapis.com \
    ces.googleapis.com storage.googleapis.com iamcredentials.googleapis.com \
    --project "$PROJECT_ID"
  log "有効化しました。"
  warn "AI Commerce Search は初回のみコンソールでの利用規約への同意が必要です:"
  warn "  https://console.cloud.google.com/ai/retail?project=$PROJECT_ID"
}

# =============================================================================
# 2. IAM
# =============================================================================
step_iam() {
  head1 "IAM を設定"
  for role in roles/retail.viewer roles/datastore.user; do
    log "$RUNTIME_SA に $role を付与"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member "serviceAccount:$RUNTIME_SA" --role "$role" --condition=None --quiet >/dev/null
  done

  # CES のサービスエージェントを先に生成しておく (MCP サーバーの呼び出し元になる)
  log "CES サービスエージェントを確認"
  gcloud beta services identity create --service=ces.googleapis.com \
    --project "$PROJECT_ID" >/dev/null 2>&1 \
    || warn "サービスエージェントの生成に失敗しました。agent ステップで再試行します。"
}

# =============================================================================
# 3. Firestore
# =============================================================================
step_firestore() {
  head1 "Firestore に商品データを登録"
  if ! gcloud firestore databases describe --project "$PROJECT_ID" --database='(default)' >/dev/null 2>&1; then
    log "Firestore データベースを作成 ($REGION)"
    gcloud firestore databases create --project "$PROJECT_ID" --location="$REGION" --quiet
  else
    log "Firestore データベースは作成済み"
  fi

  require node
  [ -d "$REPO_DIR/scripts/node_modules" ] || (cd "$REPO_DIR/scripts" && npm install --silent)
  node "$REPO_DIR/scripts/import-products-to-firestore.js" \
    --project "$PROJECT_ID" --collection "$FIRESTORE_COLLECTION"

  warn "商品を公開ページから読むには、Firestore のセキュリティルールで"
  warn "  match /$FIRESTORE_COLLECTION/{id} { allow read: if true; allow write: if false; }"
  warn "を許可してください (詳細は SETUP.md)。"
}

# =============================================================================
# 4. AI Commerce Search のカタログ取り込み
# =============================================================================
step_catalog() {
  head1 "AI Commerce Search にカタログを取り込み"
  local site; site="$(resolve_site_url)"

  log "products.jsonl を生成 (uri のベース: $site)"
  SITE_BASE_URL="$site" python3 "$REPO_DIR/js/convert_products.py"

  if ! gcloud storage buckets describe "gs://$GCS_BUCKET" --project "$PROJECT_ID" >/dev/null 2>&1; then
    log "GCS バケットを作成: gs://$GCS_BUCKET"
    gcloud storage buckets create "gs://$GCS_BUCKET" --project "$PROJECT_ID" --location "$REGION"
  fi
  gcloud storage cp "$REPO_DIR/products.jsonl" "gs://$GCS_BUCKET/products.jsonl" --project "$PROJECT_ID"

  local branch="projects/${PROJECT_NUMBER}/locations/${CATALOG_LOCATION}/catalogs/${CATALOG_ID}/branches/${BRANCH_ID}"
  log "Retail API に取り込みを依頼"
  local op
  op=$(curl -sS -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H 'Content-Type: application/json' \
    "https://retail.googleapis.com/v2/${branch}/products:import" \
    -d "{\"inputConfig\":{\"gcsSource\":{\"inputUris\":[\"gs://${GCS_BUCKET}/products.jsonl\"],\"dataSchema\":\"product\"}},\"reconciliationMode\":\"FULL\"}" \
    | check_api_error | json_get name)
  [ -n "$op" ] || die "取り込みオペレーションを開始できませんでした。"

  log "取り込みの完了を待機中 (数分かかることがあります)"
  local i resp
  for i in $(seq 1 120); do
    resp=$(curl -sS -H "Authorization: Bearer $(gcloud auth print-access-token)" \
      "https://retail.googleapis.com/v2/${op}")
    [ "$(printf '%s' "$resp" | json_get done)" = "True" ] && break
    sleep 5
  done
  printf '%s' "$resp" | python3 -c '
import sys, json
d = json.load(sys.stdin)
if not d.get("done"):
    sys.exit("取り込みが時間内に完了しませんでした。コンソールで進捗を確認してください。")
if d.get("error"):
    sys.exit("取り込みに失敗しました: " + json.dumps(d["error"], ensure_ascii=False)[:500])
meta = d.get("metadata", {})
print("  成功 %s 件 / 失敗 %s 件" % (meta.get("successCount", "?"), meta.get("failureCount", "0")))
for e in (d.get("response", {}) or {}).get("errorSamples", [])[:3]:
    print("  エラー例:", json.dumps(e, ensure_ascii=False)[:200])
'
  log "取り込み完了。"
}

# =============================================================================
# 5. 検索 API
# =============================================================================
step_search-api() {
  head1 "検索 API をデプロイ"
  local origins; origins="$(allowed_origins)"
  (cd "$REPO_DIR/search-api" && gcloud run deploy "$SEARCH_API_SERVICE" \
    --source . --project "$PROJECT_ID" --region "$REGION" \
    --allow-unauthenticated --service-account "$RUNTIME_SA" --quiet \
    --set-env-vars "^@^PROJECT_NUMBER=${PROJECT_NUMBER}@ALLOWED_ORIGINS=${origins}@CATALOG_LOCATION=${CATALOG_LOCATION}@CATALOG_ID=${CATALOG_ID}@BRANCH_ID=${BRANCH_ID}@SERVING_CONFIG_ID=${SERVING_CONFIG_ID}@QUERY_EXPANSION=${QUERY_EXPANSION}")
  log "URL: $(run_service_url "$SEARCH_API_SERVICE" "$REGION")"
}

# =============================================================================
# 6. MCP サーバー
# =============================================================================
step_mcp() {
  head1 "MCP サーバーをデプロイ"
  local site; site="$(resolve_site_url)"
  (cd "$REPO_DIR/mcp-server" && gcloud run deploy "$MCP_SERVICE" \
    --source . --project "$PROJECT_ID" --region "$MCP_REGION" \
    --no-allow-unauthenticated --service-account "$RUNTIME_SA" --quiet \
    --set-env-vars "^@^PROJECT_NUMBER=${PROJECT_NUMBER}@SITE_BASE_URL=${site}@CATALOG_LOCATION=${CATALOG_LOCATION}@CATALOG_ID=${CATALOG_ID}@BRANCH_ID=${BRANCH_ID}@SERVING_CONFIG_ID=${SERVING_CONFIG_ID}@QUERY_EXPANSION=${QUERY_EXPANSION}")
  grant_mcp_invoker
  log "URL: $(run_service_url "$MCP_SERVICE" "$MCP_REGION") (非公開)"
}

# MCP サーバーは公開しない。CES のサービスエージェントだけが呼べるようにする
grant_mcp_invoker() {
  log "CES サービスエージェントに run.invoker を付与"
  gcloud run services add-iam-policy-binding "$MCP_SERVICE" \
    --project "$PROJECT_ID" --region "$MCP_REGION" \
    --member "serviceAccount:$CES_SA" --role roles/run.invoker --quiet >/dev/null \
    || warn "付与に失敗しました。CES アプリ作成後に agent ステップで再試行されます。"
}

# =============================================================================
# 7. CES エージェント
# =============================================================================
step_agent() {
  head1 "CX Agent Studio のエージェントを構成"

  if [ "$FORCE_AGENT_IMPORT" != "true" ] \
     && [ -n "$(ces_api GET "$CES_APP" | json_get name)" ]; then
    log "アプリ $CES_APP_ID は作成済み。定義の取り込みはスキップします (上書きするなら FORCE_AGENT_IMPORT=true)。"
  else
    log "agent/ces-app/ の定義を取り込み"
    "$REPO_DIR/scripts/import-ces-app.sh" "$PROJECT_ID" "$CES_APP_ID" "$CES_LOCATION"
  fi

  # サービスエージェントはアプリ作成後に生成されることがあるので、ここでも権限を付与
  grant_mcp_invoker

  # --- ツールセットを自分の MCP サーバーに向ける ---
  local mcp_url; mcp_url="$(run_service_url "$MCP_SERVICE" "$MCP_REGION")"
  [ -n "$mcp_url" ] || die "$MCP_SERVICE が見つかりません。先に mcp ステップを実行してください。"
  local toolset_id
  toolset_id=$(ces_api GET "$CES_APP/toolsets" | python3 -c '
import sys, json
d = json.load(sys.stdin)
ts = d.get("toolsets", [])
print(ts[0]["name"].split("/")[-1] if ts else "")')
  if [ -n "$toolset_id" ]; then
    log "MCP ツールセットの向き先を $mcp_url/mcp に更新"
    ces_api PATCH "$CES_APP/toolsets/${toolset_id}?updateMask=mcpToolset.serverAddress" \
      "{\"mcpToolset\":{\"serverAddress\":\"${mcp_url}/mcp\"}}" | check_api_error >/dev/null
  else
    warn "ツールセットが見つかりません。エージェントは MCP ツールを呼べません。"
  fi

  # --- バージョンを作る (デプロイメントはイミュータブルなバージョンを指す) ---
  log "アプリのバージョンを作成"
  local version
  version=$(ces_api POST "$CES_APP/versions" "{\"displayName\":\"setup-$(date +%Y%m%d-%H%M%S)\"}" \
    | check_api_error | json_get name)
  [ -n "$version" ] || die "バージョンを作成できませんでした。"
  log "  $version"

  # --- 公開アクセス付き WEB_UI デプロイメント ---
  local origins_json
  origins_json=$(python3 -c 'import sys,json;print(json.dumps([o for o in sys.argv[1].split(",") if o]))' "$(allowed_origins)")
  local profile
  profile=$(cat <<JSON
{
  "channelType": "WEB_UI",
  "webWidgetConfig": {
    "webWidgetTitle": "Harvest & Co. お買い物アシスタント",
    "modality": "CHAT_ONLY",
    "theme": "LIGHT",
    "securitySettings": {
      "enablePublicAccess": true,
      "enableOriginCheck": true,
      "allowedOrigins": ${origins_json}
    }
  }
}
JSON
)
  if [ -n "$(ces_api GET "$CES_APP/deployments/$CES_DEPLOYMENT_ID" | json_get name)" ]; then
    log "デプロイメント $CES_DEPLOYMENT_ID を新しいバージョンに切り替え"
    ces_api PATCH "$CES_APP/deployments/${CES_DEPLOYMENT_ID}?updateMask=appVersion,channelProfile" \
      "{\"appVersion\":\"${version}\",\"channelProfile\":${profile}}" | check_api_error >/dev/null
  else
    log "デプロイメント $CES_DEPLOYMENT_ID を作成"
    ces_api POST "$CES_APP/deployments?deploymentId=${CES_DEPLOYMENT_ID}" \
      "{\"displayName\":\"${CES_DEPLOYMENT_ID}\",\"appVersion\":\"${version}\",\"channelProfile\":${profile}}" \
      | check_api_error >/dev/null
  fi
  log "エージェントの構成完了。"
}

# =============================================================================
# 8. フロントエンドの設定ファイル生成
# =============================================================================
step_webconfig() {
  head1 "js/config.js を生成"
  local search_url; search_url="$(run_service_url "$SEARCH_API_SERVICE" "$REGION")"
  [ -n "$search_url" ] || warn "$SEARCH_API_SERVICE が未デプロイです。検索はローカル検索にフォールバックします。"

  ensure_firebase_config

  python3 "$REPO_DIR/scripts/generate-web-config.py" \
    --output "$REPO_DIR/js/config.js" \
    --project-id "$PROJECT_ID" \
    --ces-location "$CES_LOCATION" \
    --ces-app-id "$CES_APP_ID" \
    --ces-deployment-id "$CES_DEPLOYMENT_ID" \
    --search-api-url "$search_url" \
    --firestore-collection "$FIRESTORE_COLLECTION" \
    --firebase-api-key "${FIREBASE_API_KEY:-}" \
    --firebase-auth-domain "${FIREBASE_AUTH_DOMAIN:-}" \
    --firebase-project-id "${FIREBASE_PROJECT_ID:-}" \
    --firebase-storage-bucket "${FIREBASE_STORAGE_BUCKET:-}" \
    --firebase-messaging-sender-id "${FIREBASE_MESSAGING_SENDER_ID:-}" \
    --firebase-app-id "${FIREBASE_APP_ID:-}"
}

# Firebase の構成が config.env に無ければ、ウェブアプリを作って取得する
ensure_firebase_config() {
  [ -z "${FIREBASE_API_KEY:-}" ] || return 0

  log "Firebase ウェブアプリの構成を取得"
  local token web_app config
  token="$(gcloud auth print-access-token)"

  # プロジェクトがまだ Firebase 対応でなければ有効化する
  if ! curl -sSf -H "Authorization: Bearer $token" \
      "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}" >/dev/null 2>&1; then
    curl -sS -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
      "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}:addFirebase" -d '{}' >/dev/null 2>&1 || true
    sleep 10
  fi

  web_app=$(curl -sS -H "Authorization: Bearer $token" \
    "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps" \
    | python3 -c '
import sys, json
try:
    apps = json.load(sys.stdin).get("apps", [])
except ValueError:
    apps = []
print(apps[0]["name"] if apps else "")')

  if [ -z "$web_app" ]; then
    log "  ウェブアプリを新規作成"
    curl -sS -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
      "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps" \
      -d '{"displayName":"Harvest & Co."}' >/dev/null 2>&1 || true
    sleep 15
    web_app=$(curl -sS -H "Authorization: Bearer $token" \
      "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps" \
      | python3 -c '
import sys, json
try:
    apps = json.load(sys.stdin).get("apps", [])
except ValueError:
    apps = []
print(apps[0]["name"] if apps else "")')
  fi

  if [ -z "$web_app" ]; then
    warn "Firebase ウェブアプリを取得できませんでした。サイトはローカルカタログで動作します。"
    warn "  Firebase コンソールで構成を取得し、config.env の FIREBASE_* に貼り付けて再実行してください。"
    return 0
  fi

  config=$(curl -sS -H "Authorization: Bearer $token" \
    "https://firebase.googleapis.com/v1beta1/${web_app}/config")
  eval "$(printf '%s' "$config" | python3 -c '
import sys, json, shlex
d = json.load(sys.stdin)
pairs = {
    "FIREBASE_API_KEY": d.get("apiKey", ""),
    "FIREBASE_AUTH_DOMAIN": d.get("authDomain", ""),
    "FIREBASE_PROJECT_ID": d.get("projectId", ""),
    "FIREBASE_STORAGE_BUCKET": d.get("storageBucket", ""),
    "FIREBASE_MESSAGING_SENDER_ID": d.get("messagingSenderId", ""),
    "FIREBASE_APP_ID": d.get("appId", ""),
}
for k, v in pairs.items():
    print("%s=%s" % (k, shlex.quote(v)))
')"
  if [ -n "${FIREBASE_API_KEY:-}" ]; then
    log "  取得しました (プロジェクト: ${FIREBASE_PROJECT_ID:-$PROJECT_ID})"
  else
    warn "Firebase の構成が空でした。ローカルカタログで動作します。"
  fi
}

# =============================================================================
# 9. サイトのデプロイ
# =============================================================================
step_site() {
  head1 "EC サイトをデプロイ"
  (cd "$REPO_DIR" && gcloud run deploy "$SITE_SERVICE" \
    --source . --project "$PROJECT_ID" --region "$REGION" \
    --allow-unauthenticated --quiet)
  local url; url="$(run_service_url "$SITE_SERVICE" "$REGION")"
  RESOLVED_SITE_URL="${url%/}"
  log "URL: $RESOLVED_SITE_URL"
}

# =============================================================================
# エントリポイント
# =============================================================================
usage() {
  cat <<EOF
使い方: ./setup.sh [ステップ...]

  ステップを省略すると全ステップを順に実行します。

  apis        $STEP_DESC_apis
  iam         $STEP_DESC_iam
  firestore   $STEP_DESC_firestore
  catalog     $STEP_DESC_catalog
  search-api  $STEP_DESC_searchapi
  mcp         $STEP_DESC_mcp
  agent       $STEP_DESC_agent
  webconfig   $STEP_DESC_webconfig
  site        $STEP_DESC_site

  設定は config.env (CONFIG_FILE 環境変数で変更可) から読み込みます。
EOF
}

main() {
  case "${1:-}" in
    -h|--help|--list) usage; exit 0 ;;
  esac

  require gcloud; require python3; require curl; require zip; require unzip

  load_config
  log "プロジェクト: $PROJECT_ID (番号 $PROJECT_NUMBER) / リージョン: $REGION"

  local steps=("$@")
  [ ${#steps[@]} -gt 0 ] || steps=("${ALL_STEPS[@]}")

  local s
  for s in "${steps[@]}"; do
    case " ${ALL_STEPS[*]} " in
      *" $s "*) ;;
      *) die "不明なステップ: $s (./setup.sh --list で一覧)" ;;
    esac
  done

  for s in "${steps[@]}"; do
    "step_$s"
  done

  head1 "完了"
  printf 'サイト:      %s\n' "$(run_service_url "$SITE_SERVICE" "$REGION")"
  printf '検索API:     %s\n' "$(run_service_url "$SEARCH_API_SERVICE" "$REGION")"
  printf 'MCPサーバー: %s\n' "$(run_service_url "$MCP_SERVICE" "$MCP_REGION")"
  printf 'CESアプリ:   %s\n' "$CES_APP"
  printf '\njs/config.js を更新した場合は site ステップで再デプロイしてください。\n'
}

main "$@"
