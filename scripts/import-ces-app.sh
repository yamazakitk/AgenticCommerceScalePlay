#!/usr/bin/env bash
#
# agent/ces-app/ のアプリ定義を CX Agent Studio (CES) にインポートする。
#
#   ./scripts/import-ces-app.sh <PROJECT_ID> [APP_ID] [LOCATION]
#
#   APP_ID を省略  … 新しいアプリとして作成される (IDは自動採番)
#   APP_ID を指定  … そのIDのアプリを「置き換える」。既存アプリがあれば
#                     中身は丸ごと上書きされるので注意 (差分マージではない)
#
# importApp はアプリのフォルダ構成を zip 圧縮したものを base64 で受け取る。
# zip のルート直下にアプリのフォルダが 1 つある構成にする必要がある。
#
set -euo pipefail

PROJECT_ID="${1:?usage: $0 <PROJECT_ID> [APP_ID] [LOCATION]}"
APP_ID="${2:-}"
LOCATION="${3:-us}"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_DIR/agent/ces-app"
[ -d "$SRC_DIR" ] || { echo "$SRC_DIR がありません" >&2; exit 1; }

APP_FOLDER="$(cd "$SRC_DIR" && ls -1)"
[ "$(printf '%s\n' "$APP_FOLDER" | wc -l)" -eq 1 ] \
  || { echo "agent/ces-app/ 直下はアプリのフォルダ 1 つだけにしてください" >&2; exit 1; }

TMP_ZIP="$(mktemp -t ces-app-XXXXXX.zip)"
trap 'rm -f "$TMP_ZIP" "$TMP_ZIP.json"' EXIT
(cd "$SRC_DIR" && rm -f "$TMP_ZIP" && zip -qr "$TMP_ZIP" "$APP_FOLDER")

python3 -c '
import sys, json, base64
req = {"appContent": base64.b64encode(open(sys.argv[1], "rb").read()).decode()}
if sys.argv[2]:
    req["appId"] = sys.argv[2]
else:
    # displayName は新規作成時のみ指定できる (再インポート時に渡すと INVALID_ARGUMENT)
    req["displayName"] = sys.argv[3]
json.dump(req, open(sys.argv[1] + ".json", "w"))
' "$TMP_ZIP" "$APP_ID" "$APP_FOLDER"

echo "インポート中: projects/$PROJECT_ID/locations/$LOCATION (appId=${APP_ID:-<自動採番>})"
TOKEN="$(gcloud auth print-access-token)"
OP=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  "https://ces.googleapis.com/v1beta/projects/$PROJECT_ID/locations/$LOCATION/apps:importApp" \
  -d @"$TMP_ZIP.json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["name"])')

for _ in $(seq 1 60); do
  RESP=$(curl -sf -H "Authorization: Bearer $TOKEN" "https://ces.googleapis.com/v1beta/$OP")
  if [ "$(printf '%s' "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("done", False))')" = "True" ]; then
    break
  fi
  sleep 2
done

# warnings には「取り込めなかったリソース」が入るので必ず確認する
printf '%s' "$RESP" | python3 -c '
import sys, json
d = json.load(sys.stdin)
if d.get("error"):
    sys.exit("インポートに失敗しました: %s" % json.dumps(d["error"], ensure_ascii=False))
r = d.get("response", {})
print("インポートしました:", r.get("name"))
for w in r.get("warnings", []):
    print("  警告:", w)
'
