#!/usr/bin/env bash
#
# CX Agent Studio (CES) のアプリ定義を agent/ces-app/ にエクスポートする。
#
#   ./scripts/export-ces-app.sh <PROJECT_ID> <APP_ID> [LOCATION]
#
# exportApp は長時間実行オペレーションを返し、完了すると response.appContent に
# アプリのフォルダ構成を zip 圧縮したものが base64 で入る。ここではそれを展開して
# agent/ces-app/ に書き出す (git で差分が読めるように、zip ではなく展開後の
# ファイルツリーをリポジトリに置く方針)。
#
set -euo pipefail

# エクスポートされる zip 内のフォルダ名はアプリの表示名 (日付入りなど) になるため、
# リポジトリ側では固定名に正規化する。アプリの識別は app.json が持っているので、
# フォルダ名を変えてもインポートに影響しない。
APP_FOLDER_NAME="agentic_commerce_scaleplay"

PROJECT_ID="${1:?usage: $0 <PROJECT_ID> <APP_ID> [LOCATION]}"
APP_ID="${2:?usage: $0 <PROJECT_ID> <APP_ID> [LOCATION]}"
LOCATION="${3:-us}"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_DIR/agent/ces-app"
APP="projects/$PROJECT_ID/locations/$LOCATION/apps/$APP_ID"
TOKEN="$(gcloud auth print-access-token)"

echo "エクスポート中: $APP"
OP=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  "https://ces.googleapis.com/v1beta/$APP:exportApp" -d '{"exportFormat":"JSON"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["name"])')

# オペレーションの完了を待つ
for _ in $(seq 1 60); do
  RESP=$(curl -sf -H "Authorization: Bearer $TOKEN" "https://ces.googleapis.com/v1beta/$OP")
  if [ "$(printf '%s' "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("done", False))')" = "True" ]; then
    break
  fi
  sleep 2
done

TMP_ZIP="$(mktemp -t ces-app-XXXXXX.zip)"
trap 'rm -f "$TMP_ZIP"' EXIT
printf '%s' "$RESP" | python3 -c '
import sys, json, base64
d = json.load(sys.stdin)
if d.get("error"):
    sys.exit("エクスポートに失敗しました: %s" % json.dumps(d["error"], ensure_ascii=False))
open(sys.argv[1], "wb").write(base64.b64decode(d["response"]["appContent"]))
' "$TMP_ZIP"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
unzip -q "$TMP_ZIP" -d "$OUT_DIR"

# zip 直下のフォルダを固定名にそろえる
EXPORTED_FOLDER="$(cd "$OUT_DIR" && ls -1)"
if [ "$EXPORTED_FOLDER" != "$APP_FOLDER_NAME" ]; then
  mv "$OUT_DIR/$EXPORTED_FOLDER" "$OUT_DIR/$APP_FOLDER_NAME"
fi

echo "書き出しました: $OUT_DIR"
find "$OUT_DIR" -type f | sort | sed "s|$REPO_DIR/||"
