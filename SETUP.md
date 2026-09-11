# 環境セットアップ手順

このリポジトリから **Harvest & Co.**（AI Commerce Search + CX Agent Studio を組み込んだ
サンプル EC サイト）のデモ環境一式を、自分の Google Cloud プロジェクトに構築します。

設定ファイルは **`config.env` の 1 つだけ**、実行するコマンドは **`./setup.sh` の 1 つだけ** です。

```bash
cp config.example.env config.env
$EDITOR config.env          # PROJECT_ID を自分のプロジェクトIDに書き換える
./setup.sh                  # API 有効化から Cloud Run へのデプロイまで一気に実行
```

- 手っ取り早く動かしたい → [1. クイックスタート](#1-クイックスタート)
- 中で何が起きているか知りたい / 一部だけやり直したい → [付録: 手動セットアップ手順](#付録-手動セットアップ手順)
- 各機能の仕組みや設計の詳細 → [README.md](README.md)

---

## 0. 全体像

```
                   ┌──────────────────────────────────────────┐
ブラウザ ──────────▶│ agentic-commerce (Cloud Run / nginx)      │  静的サイト本体
                   └───┬──────────────┬───────────────┬────────┘
                       │              │               │
       商品データ読込   │  ヘッダー検索 │  チャットUI    │
                       ▼              ▼               ▼
              ┌────────────────┐ ┌──────────────┐ ┌───────────────────────┐
              │ Cloud Firestore│ │harvest-search│ │ CES API               │
              │  products      │ │ -api (Run)   │ │ (ces.googleapis.com)  │
              └────────────────┘ └──────┬───────┘ └──────────┬────────────┘
                                        │                    │ MCP + IDトークン
                                        ▼                    ▼
                              ┌──────────────────┐ ┌───────────────────────┐
                              │ Retail API       │◀│ harvest-commerce-mcp  │
                              │ (AI Commerce     │ │ (Cloud Run / 非公開)  │
                              │  Search)         │ └───────────────────────┘
                              └──────────────────┘
```

| コンポーネント | ディレクトリ | デプロイ先 | 公開 |
| --- | --- | --- | --- |
| EC サイト本体 | リポジトリ直下 (`Dockerfile`) | Cloud Run `agentic-commerce` (asia-northeast1) | 公開 |
| 商品検索 API | [search-api/](search-api/) | Cloud Run `harvest-search-api` (asia-northeast1) | 公開 (CORS 制限) |
| エージェント用 MCP | [mcp-server/](mcp-server/) | Cloud Run `harvest-commerce-mcp` (us-central1) | **非公開** |
| 商品カタログ (サイト表示用) | [js/products.js](js/products.js) → Firestore | Firestore `products` | 読み取りのみ |
| 商品カタログ (検索用) | `products.jsonl` ([js/convert_products.py](js/convert_products.py) が生成) | Retail `default_catalog` | — |
| エージェント | [agent/ces-app/](agent/ces-app/) (アプリ定義一式) | CES アプリ (location `us`) | WEB_UI デプロイメント経由で公開 |
| (旧) Dialogflow CX 版 | [agent/harvest-commerce-agent.zip](agent/harvest-commerce-agent.zip), [webhook/](webhook/) | Cloud Run `harvest-agent-webhook` | 任意 (サイトからは未使用) |

### 順序の依存関係

**サイトの URL が先に決まっていないと進められない箇所が 4 つあります。** そのため
「サイトを先にデプロイして URL を確定させる → その URL を使って残りを設定する → サイトを再デプロイ」
という順番になります。`setup.sh` はこの依存関係を自動で解決します
(サイトが未デプロイなら、URL を確定させるために先にサイトをデプロイします)。

| サイト URL を必要とするもの | 使い道 |
| --- | --- |
| `products.jsonl` の `uri` | 商品詳細ページへのリンク |
| `harvest-search-api` の `ALLOWED_ORIGINS` | CORS |
| `harvest-commerce-mcp` の `SITE_BASE_URL` | エージェントが返す商品リンク |
| CES デプロイメントの `allowedOrigins` | ウィジェットのオリジンチェック |

---

## 1. クイックスタート

### 1-1. 用意するもの

| 必要なもの | 備考 |
| --- | --- |
| Google Cloud プロジェクト | 課金が有効になっていること |
| `gcloud` CLI | ログイン済み |
| `node` 18 以上 | Firestore への商品登録に使用 |
| `python3` / `curl` / `zip` / `unzip` | `setup.sh` が使用 |

Docker は不要です (Cloud Run の `--source` ビルドを使います)。

```bash
gcloud auth login
gcloud auth application-default login   # Firestore への書き込みに必要
```

**AI Commerce Search (Retail API) だけは、初回に Console 上での利用規約の同意とデータ利用設定が必要です。**
[Search for commerce のコンソール](https://console.cloud.google.com/ai/retail) を一度開いてセットアップを完了させてください。
ここだけは API で代行できないため、`setup.sh` も警告を出すだけです。

### 1-2. 設定ファイルを書く

```bash
cp config.example.env config.env
$EDITOR config.env
```

**必須なのは `PROJECT_ID` の 1 行だけ**です。残りはすべて既定値のままで動きます。

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `PROJECT_ID` | **(必須)** | デプロイ先の Google Cloud プロジェクトID |
| `REGION` | `asia-northeast1` | EC サイト / 検索 API / Firestore のリージョン |
| `MCP_REGION` | `us-central1` | MCP サーバーのリージョン |
| `CES_LOCATION` | `us` | CES アプリのロケーション (`us` / `eu`) |
| `SITE_SERVICE` | `agentic-commerce` | EC サイトの Cloud Run サービス名 |
| `SEARCH_API_SERVICE` | `harvest-search-api` | 検索 API の Cloud Run サービス名 |
| `MCP_SERVICE` | `harvest-commerce-mcp` | MCP サーバーの Cloud Run サービス名 |
| `CATALOG_LOCATION` / `CATALOG_ID` / `BRANCH_ID` / `SERVING_CONFIG_ID` | `global` / `default_catalog` / `default_branch` / `default_search` | Retail のカタログ構成。既定のままでよい |
| `QUERY_EXPANSION` | `AUTO` | 結果が少ないとき関連商品で補完する。`DISABLED` で完全一致のみ |
| `GCS_BUCKET` | 空 | カタログ取り込みの中継バケット。空なら `<PROJECT_ID>-harvest-setup` を作成 |
| `FIRESTORE_COLLECTION` | `products` | 商品データのコレクション名 |
| `CES_APP_ID` | `harvest-commerce` | 作成する CES アプリのID |
| `CES_DEPLOYMENT_ID` | `web-widget` | 公開アクセス付き WEB_UI デプロイメントのID |
| `FORCE_AGENT_IMPORT` | `false` | `true` にすると毎回 `agent/ces-app/` の定義でアプリを上書き (コンソールでの編集は失われます) |
| `SITE_URL` | 空 | 通常は空のまま。Cloud Run から自動取得します。独自ドメイン利用時のみ指定 |
| `EXTRA_ALLOWED_ORIGINS` | `http://localhost:8099` | CORS / オリジンチェックで追加許可するオリジン (カンマ区切り) |
| `FIREBASE_*` | 空 | 空なら Firebase ウェブアプリを自動作成して構成を取得します |

`config.env` は `.gitignore` 済みなので、フォークして公開しても自分のプロジェクトIDや
API キーが混入しません。

### 1-3. 実行する

```bash
./setup.sh
```

10〜20 分ほどかかります (大半は Cloud Run のビルド待ち)。何度実行しても同じ結果になるよう
書いてあるので、途中で失敗したら原因を直してそのまま再実行して構いません。

実行されるステップは以下の 9 つです。

| ステップ | 内容 |
| --- | --- |
| `apis` | 必要な Google Cloud API を有効化 |
| `iam` | Compute デフォルト SA に `retail.viewer` / `datastore.user` を付与、CES サービスエージェントを作成 |
| `firestore` | Firestore データベースを作成し、商品 28 件を登録 |
| `catalog` | `products.jsonl` を生成し、GCS 経由で Retail カタログに取り込み |
| `search-api` | `search-api/` を Cloud Run にデプロイ (公開 / CORS 制限あり) |
| `mcp` | `mcp-server/` を Cloud Run にデプロイ (**非公開**) し、CES サービスエージェントに `run.invoker` を付与 |
| `agent` | `agent/ces-app/` の定義を CES に取り込み、ツールセットの接続先を実際の MCP URL に更新、バージョンを作成し、公開 WEB_UI デプロイメントを構成 |
| `webconfig` | `js/config.js` を生成 (フロントエンドが読む設定はこの 1 ファイルだけ) |
| `site` | EC サイトを Cloud Run にデプロイ |

一部のステップだけ実行することもできます。

```bash
./setup.sh --list                # ステップ一覧
./setup.sh webconfig site        # 設定を作り直してサイトだけ再デプロイ
./setup.sh catalog               # 商品データを変えたのでカタログだけ取り込み直す
```

### 1-4. 実行後にやること

1. **完了メッセージに出るサイト URL を開く。** 商品一覧が表示され、ヘッダー検索が効き、
   右下にチャットウィジェットが出れば成功です。詳しくは [9. 動作確認チェックリスト](#9-動作確認チェックリスト)。
2. **Firestore のセキュリティルール**を確認する。サイトは Firebase Web SDK で
   クライアントから直接 `products` コレクションを読むため、読み取りを許可する必要があります。
   デモ用途なら以下で十分です (書き込みは禁止)。

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /products/{doc} { allow read: if true; allow write: if false; }
     }
   }
   ```

3. カタログ取り込みが Retail の学習に反映されるまで、検索精度が安定しないことがあります。

### 1-5. `setup.sh` が作るもの

| 種類 | 名前 |
| --- | --- |
| Cloud Run | `agentic-commerce` / `harvest-search-api` / `harvest-commerce-mcp` |
| Firestore | `(default)` データベース、`products` コレクション (28 件) |
| Retail | `default_catalog` の `default_branch` に商品 28 件 |
| CES | アプリ `harvest-commerce`、バージョン `setup-<日時>`、デプロイメント `web-widget` |
| GCS | `<PROJECT_ID>-harvest-setup` (取り込みの中継用) |
| ローカル | `js/config.js`、`products.jsonl`、`products_for_bq.csv` |

`js/config.js` は `setup.sh` が生成するため **git 管理外** です
(雛形は [js/config.example.js](js/config.example.js))。
フロントエンドが参照する環境パラメータはこのファイル 1 つにまとまっています。

---

# 付録: 手動セットアップ手順

ここから先は `setup.sh` が内部で行っていることを 1 ステップずつ手で実行する手順です。
仕組みを理解したいとき、一部だけやり直したいとき、`setup.sh` が失敗した原因を切り分けたい
ときに参照してください。**クイックスタートで完了している場合、以下は不要です。**

## 1. 前提

```bash
# 必要なツール: gcloud, node (18+), python3, docker は不要 (--source ビルドを使う)
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID

# プロジェクト番号を控える (以降 PROJECT_NUMBER として使う。プロジェクトIDとは別物)
gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)'
```

### 1-1. API を有効化する

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  retail.googleapis.com \
  ces.googleapis.com \
  iamcredentials.googleapis.com
```

AI Commerce Search (Retail API) は初回に **Console 上での利用規約の同意とデータ利用設定** が必要です。
[Search for commerce のコンソール](https://console.cloud.google.com/ai/retail) を一度開いてセットアップを完了させてください。

### 1-2. サービスアカウントに権限を付与する

Cloud Run のサービスは既定で Compute のデフォルト SA (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`)
として動きます。このサンプルはそれをそのまま使う前提です。

```bash
SA=PROJECT_NUMBER-compute@developer.gserviceaccount.com

# search-api / mcp-server が Retail API を読むため
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member serviceAccount:$SA --role roles/retail.viewer

# (旧 Dialogflow webhook を使う場合のみ) Firestore 読み取り
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member serviceAccount:$SA --role roles/datastore.user
```

---

## 2. EC サイトを Cloud Run にデプロイする (URL を確定させる)

この時点では Firestore も検索もエージェントも未設定ですが、サイトは
[js/products.js](js/products.js) のローカルカタログにフォールバックして動作します。
まず URL を得ることが目的です。

```bash
gcloud run deploy agentic-commerce \
  --source . --region asia-northeast1 --allow-unauthenticated
```

- `Dockerfile` は nginx:alpine に静的ファイルを載せるだけです。`PORT` は
  [default.conf.template](default.conf.template) 経由で Cloud Run から注入されます。
- HTML/JS/CSS には `Cache-Control: no-cache` が付きます (ファイル名にハッシュが無いため、
  キャッシュされるとデプロイしても古いコードが使われ続けます)。

出力された URL を控えます。以降 `SITE_URL` と表記します。

```bash
SITE_URL=$(gcloud run services describe agentic-commerce --region asia-northeast1 --format='value(status.url)')
echo $SITE_URL
```

> Cloud Run は同じサービスに対して 2 種類の URL を割り当てます
> (`https://agentic-commerce-<番号>.<region>.run.app` と `https://agentic-commerce-<hash>-an.a.run.app`)。
> **どちらからでもアクセスできるため、オリジン許可リストには両方を入れておいてください。**

---

## 3. 商品データを Firestore に登録する

サイトの商品グリッド・商品詳細ページが読むデータです。

```bash
# Firestore データベースを作る (未作成の場合)
gcloud firestore databases create --location=asia-northeast1

cd scripts
npm install
node import-products-to-firestore.js --project YOUR_PROJECT_ID
cd ..
```

- ドキュメント ID は商品 ID (`"1"`〜`"28"`)。再実行は上書きなので何度でも安全です。
- コレクション名を変える場合は `--collection <NAME>`。

### 3-1. フロントエンドを Firestore につなぐ

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトにウェブアプリを追加し、
   構成オブジェクトを取得します。
2. `js/config.js` の `window.FIREBASE_CONFIG` を書き換えます
   (`apiKey` が `YOUR_` で始まったままだと Firestore に接続せずローカルカタログで動きます)。
   コレクション名を変えた場合は `window.FIRESTORE_PRODUCTS_COLLECTION` もそろえます。
   `js/config.js` が無い場合は [js/config.example.js](js/config.example.js) をコピーして作ります。
3. Firestore のセキュリティルールで読み取りを許可します。

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /products/{productId} {
         allow read: if true;
         allow write: if false;
       }
     }
   }
   ```

---

## 4. AI Commerce Search のカタログに商品を取り込む

### 4-1. 取り込みファイルを生成する

`products.jsonl` は [js/products.js](js/products.js) から生成します。
**手順 2 で得た URL を渡してください** (商品詳細ページの `uri` に埋め込まれます)。

```bash
SITE_BASE_URL=$SITE_URL python3 js/convert_products.py
```

生成される 1 行はこの形です。

```json
{"id":"1","title":"新潟県産 有機栽培完熟トマト","languageCode":"ja",
 "categories":["野菜","vegetables"],"description":"…",
 "priceInfo":{"currencyCode":"JPY","price":498.0,"originalPrice":498.0},
 "images":[{"uri":"https://images.unsplash.com/…"}],
 "rating":{"averageRating":4.8,"ratingCount":32},
 "availability":"IN_STOCK",
 "attributes":{"origin":{"text":["新潟県産"]},"unit":{"text":["1パック（3個入）"]}},
 "uri":"https://…/product.html?id=1"}
```

**Retail の Product スキーマで踏みやすい落とし穴** (どれもエラーにならず黙って落ちます):

| 項目 | 正しい形 | やりがちな誤り |
| --- | --- | --- |
| 商品ページ URL | `uri` | `url` — 無視され、カタログ側は空のまま |
| 属性 | `attributes` は `map<string, CustomAttribute>` | `[{key, value}]` の配列 — 丸ごと落ちる |
| 言語 | `languageCode: "ja"` | 未指定 — 日本語のトークナイズが効かず部分語で引けない |
| 画像 | `images: [{"uri": "…"}]` | 商品ページの URL を入れる — カードが壊れる |

### 4-2. 取り込む

**Console から** (推奨): [AI Commerce Search → Data → Import](https://console.cloud.google.com/ai/retail/catalogs)
で `products.jsonl` を `default_catalog` の `default_branch` にインポートします。

**API から** (再現性を重視する場合):

```bash
gsutil mb -l asia-northeast1 gs://YOUR_BUCKET     # 初回のみ
gsutil cp products.jsonl gs://YOUR_BUCKET/

curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H 'Content-Type: application/json' \
  "https://retail.googleapis.com/v2/projects/PROJECT_NUMBER/locations/global/catalogs/default_catalog/branches/default_branch/products:import" \
  -d '{"inputConfig":{"gcsSource":{"inputUris":["gs://YOUR_BUCKET/products.jsonl"],"dataSchema":"product"}},
       "reconciliationMode":"FULL"}'
```

取り込み後、Console の Data ページで **件数が 28 件** になっていることを必ず確認してください
(一部だけ取り込まれると、その商品は検索に出てきません)。

```bash
# 1件だけ抜き出して uri / attributes / images が入っているか確認する
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://retail.googleapis.com/v2/projects/PROJECT_NUMBER/locations/global/catalogs/default_catalog/branches/default_branch/products/1"
```

---

## 5. 検索 API (search-api) をデプロイする

Retail の `servingConfigs:search` は OAuth2 必須でブラウザから直接呼べないため、Cloud Run 経由にします。

```bash
cd search-api
gcloud run deploy harvest-search-api \
  --source . --region asia-northeast1 --allow-unauthenticated \
  --set-env-vars PROJECT_NUMBER=PROJECT_NUMBER,ALLOWED_ORIGINS=$SITE_URL
cd ..
```

`ALLOWED_ORIGINS` はカンマ区切りで複数指定できます。ローカル開発とサイトの別 URL 形式も入れておくと便利です。

```
ALLOWED_ORIGINS=https://agentic-commerce-…run.app,https://agentic-commerce-…a.run.app,http://localhost:8099
```

デプロイ後、URL を **GET** で開くと疎通確認になります (検索本体は POST のみ)。

```bash
curl -s https://harvest-search-api-XXXX.a.run.app
# {"status":"ok","detail":"Retail API に接続できました (テストクエリ「トマト」で 1 件)。", ...}
```

得られた URL を `js/config.js` に設定します。

```javascript
window.COMMERCE_SEARCH_API_URL = "https://harvest-search-api-XXXX.a.run.app";
```

その他の環境変数 (`CATALOG_LOCATION` / `CATALOG_ID` / `SERVING_CONFIG_ID` / `BRANCH_ID` / `QUERY_EXPANSION`)
は README の「[検索APIをデプロイする](README.md#2-検索apiをデプロイする)」を参照してください。

---

## 6. MCP サーバー (mcp-server) をデプロイする

エージェントがこのサイトのカタログを検索できるようにするための MCP サーバーです。

```bash
cd mcp-server
gcloud run deploy harvest-commerce-mcp \
  --source . --region us-central1 \
  --no-allow-unauthenticated \
  --set-env-vars PROJECT_NUMBER=PROJECT_NUMBER,SITE_BASE_URL=$SITE_URL
cd ..
```

**`--no-allow-unauthenticated` を外さないでください。** 呼び出せるのは次に権限を与える
CES のサービスエージェントだけにします。

```bash
gcloud run services add-iam-policy-binding harvest-commerce-mcp \
  --region us-central1 \
  --member serviceAccount:service-PROJECT_NUMBER@gcp-sa-ces.iam.gserviceaccount.com \
  --role roles/run.invoker
```

> `service-PROJECT_NUMBER@gcp-sa-ces.iam.gserviceaccount.com` は CES を初めて使ったときに
> 自動生成されます。存在しないと言われる場合は、先に手順 7 で CES アプリを 1 つ作ってください。

ローカルでの動作確認 (Cloud Run にデプロイする前に試す場合):

```bash
cd mcp-server
pip install -r requirements.txt
PROJECT_NUMBER=PROJECT_NUMBER SITE_BASE_URL=http://localhost:8099 PORT=8091 python3 server.py

curl -s -X POST http://localhost:8091/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## 7. CES エージェントを構成する

エージェント定義一式は [agent/ces-app/](agent/ces-app/) にエクスポート済みです。
**インポートすれば、エージェント・指示文・ウィジェットツール・MCP ツールセット・ガードレールが
まとめて再現されます** (手順 7-A)。コンソールで一から組み立てたい場合は手順 7-B を参照してください。

### リポジトリに入っているアプリ定義

```
agent/ces-app/agentic_commerce_scaleplay/
├── app.json                        アプリ全体 (モデル・言語・ガードレール・ルートエージェント)
├── agents/
│   ├── Root_agent/                 入口。要求に応じて下位エージェントへ委譲
│   ├── Search-Agent/               商品検索・商品詳細。MCP ツールを呼ぶ
│   ├── Product-Comparison-Agent/   商品比較
│   └── Farewall_Agent/             会話の終了
│       └── */instruction.txt       各エージェントの指示文 (本文はここ、JSON からは参照のみ)
├── tools/                          ウィジェットツール (product_list / product-detail /
│                                   compare_products) と Python ツール (update_username)
├── toolsets/product-search-tool/   MCP ツールセット (mcp-server を指す)
├── guardrails/                     既定の安全性・プロンプトガードレール
└── pythonEnvFiles/
```

- `agents/Search-Agent/instruction.txt` は
  [agent/ces-search-agent-instruction.txt](agent/ces-search-agent-instruction.txt) と同一内容です
  (後者は単体で参照しやすいように置いてあるコピーです。指示文を直したら両方を更新してください)。
- ファイルはエクスポートされたバイト列のまま置いています (整形し直すと再エクスポート時の差分が
  読みづらくなるため)。
- **フォルダ名は固定名に正規化しています。** `exportApp` が作る zip 内のフォルダ名はアプリの表示名
  (日付入りなど) になりますが、リポジトリでは `agentic_commerce_scaleplay` に統一しています
  (`scripts/export-ces-app.sh` が自動でリネームします)。アプリの識別情報は `app.json` が持っているため、
  フォルダ名を変えてもインポートには影響しません。表示名を変えたい場合は `app.json` の `displayName`
  を編集するか、インポート時に `displayName` を指定してください。

エクスポートし直す (コンソールで編集した内容をリポジトリに取り込む) には:

```bash
./scripts/export-ces-app.sh YOUR_PROJECT_ID YOUR_APP_ID          # location 既定は us
git diff agent/ces-app                                            # 差分を確認してからコミット
```

### 7-A. アプリ定義をインポートする (推奨)

```bash
# 新しいアプリとして作成する (アプリIDは自動採番)
./scripts/import-ces-app.sh YOUR_PROJECT_ID

# アプリIDを指定する場合 (同じIDのアプリがあると中身が丸ごと置き換わります)
./scripts/import-ces-app.sh YOUR_PROJECT_ID my-harvest-app
```

スクリプトは `agent/ces-app/` を zip に固めて
`POST .../apps:importApp` に `appContent` (base64) として渡し、完了後にアプリ名と警告を表示します。
**`warnings` に出たリソースは取り込まれていません**ので、必ず確認してください。

curl で直接実行する場合:

```bash
cd agent/ces-app && zip -qr /tmp/ces-app.zip agentic_commerce_scaleplay && cd -
python3 -c "import base64,json;print(json.dumps({'appContent':base64.b64encode(open('/tmp/ces-app.zip','rb').read()).decode(),'displayName':'harvest-commerce'}))" > /tmp/req.json

curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H 'Content-Type: application/json' \
  "https://ces.googleapis.com/v1beta/projects/YOUR_PROJECT_ID/locations/us/apps:importApp" \
  -d @/tmp/req.json
# → 長時間実行オペレーションが返るので GET .../operations/<ID> で完了を待つ
```

**インポート後に必ず直すもの:**

1. **MCP ツールセットの向き先** — `toolsets/product-search-tool/product-search-tool.json` の
   `serverAddress` はエクスポート元プロジェクトの Cloud Run URL のままです。手順 6 でデプロイした
   自分の URL に差し替えます。

   ```bash
   APP=projects/YOUR_PROJECT_ID/locations/us/apps/YOUR_APP_ID
   MCP_URL=$(gcloud run services describe harvest-commerce-mcp --region us-central1 --format='value(status.url)')
   TOOLSET_ID=$(curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     "https://ces.googleapis.com/v1beta/$APP/toolsets" \
     | python3 -c 'import sys,json;print(json.load(sys.stdin)["toolsets"][0]["name"].split("/")[-1])')

   curl -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H 'Content-Type: application/json' \
     "https://ces.googleapis.com/v1beta/$APP/toolsets/$TOOLSET_ID?updateMask=mcpToolset.serverAddress" \
     -d '{"mcpToolset":{"serverAddress":"'"$MCP_URL"'/mcp"}}'
   ```

   インポート前に JSON を書き換えておいても構いません (その場合この手順は不要)。
2. **CES サービスエージェントへの `run.invoker`** — 手順 6 の IAM 付与がまだなら実施します
   (アプリを作ると `service-PROJECT_NUMBER@gcp-sa-ces.iam.gserviceaccount.com` が生成されます)。
3. **Search-Agent の指示文中の URL 例** — 例示用にエクスポート元サイトの URL が入っています。
   動作には影響しませんが、気になる場合は自分のサイトの URL に置き換えます。
4. **デプロイメントは含まれません** — `deployments` はエクスポートの対象外です。手順 7-C で作成します。

アプリ ID は次で確認できます。

```bash
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://ces.googleapis.com/v1beta/projects/YOUR_PROJECT_ID/locations/us/apps"
```

### 7-B. コンソールで手作業で構成する場合

[CX Agent Studio コンソール](https://console.cloud.google.com/gen-app-builder/ces) でアプリを新規作成し
(location は `us`)、上の構成表と同じエージェントを用意します。
アプリの `languageSettings.defaultLanguageCode` を **`ja-JP`** にしてください
(指示が日本語でも、ここが `en-US` だと英語で応答します)。

MCP ツールセットを登録します。

```bash
APP=projects/YOUR_PROJECT_ID/locations/us/apps/YOUR_APP_ID
MCP_URL=$(gcloud run services describe harvest-commerce-mcp --region us-central1 --format='value(status.url)')

curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H 'Content-Type: application/json' \
  "https://ces.googleapis.com/v1beta/$APP/toolsets" \
  -d '{
    "displayName": "product-search-tool",
    "mcpToolset": {
      "serverAddress": "'"$MCP_URL"'/mcp",
      "apiAuthentication": { "serviceAgentIdTokenAuthConfig": {} }
    }
  }'
```

- **エンドポイントは `/mcp` まで含めます。**
- 認証は `serviceAgentIdTokenAuthConfig` (手順 6 で `run.invoker` を与えた SA が ID トークンで呼びます)。

そのうえで Search-Agent を開き、

1. **Instruction** に [agent/ces-search-agent-instruction.txt](agent/ces-search-agent-instruction.txt) の内容を貼り付ける
2. **Tools** で `search_products` と `get_product_details` を選択する

指示文の中でツールは `product_search_tool_search_products` のように
**`{ツールセット表示名}_{MCPツール名}`** で参照します。表示名のハイフンはアンダースコアに正規化されるため、
ツールセット名を変えた場合は指示文の参照名もそろえてください。

### 7-C. 公開アクセス付きの WEB_UI デプロイメントを作る

`generateChatToken` をブラウザから認証なしで呼ぶために必要です。
**`allowedOrigins` は必ず自サイトのオリジンだけに絞ってください** (空にすると全オリジンから利用可能になります)。

```bash
# 1. ドラフトからバージョンを作る (レスポンスの name の末尾を控える)
curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H 'Content-Type: application/json' \
  "https://ces.googleapis.com/v1beta/$APP/versions" -d '{"displayName":"v1"}'

# 2. そのバージョンを指す WEB_UI デプロイメントを作る
curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "web-widget",
    "appVersion": "'"$APP"'/versions/YOUR_VERSION_ID",
    "channelProfile": {
      "channelType": "WEB_UI",
      "webWidgetConfig": {
        "webWidgetTitle": "Harvest & Co. お買い物アシスタント",
        "modality": "CHAT_ONLY",
        "theme": "LIGHT",
        "securitySettings": {
          "enablePublicAccess": true,
          "enableOriginCheck": true,
          "allowedOrigins": ["https://YOUR-SITE-URL", "https://YOUR-SITE-ALT-URL"]
        }
      }
    }
  }' \
  "https://ces.googleapis.com/v1beta/$APP/deployments?deploymentId=web-widget"
```

### 7-D. サイト側に接続先を設定する

`js/config.js` の `window.AGENT_STUDIO_CONFIG` を書き換えます。

```javascript
window.AGENT_STUDIO_CONFIG = {
  projectId: "YOUR_PROJECT_ID",
  location: "us",
  appId: "YOUR_APP_ID",        // 表示名ではなく name の末尾のUUID
  deploymentId: "web-widget"
};
```

チャットの見出しや初回あいさつなどの文言は [js/agent-widget.js](js/agent-widget.js) 側に
既定値があり、同じオブジェクトに `chatTitle` / `subtitle` / `greeting` を足せば上書きできます。

> ### ⚠️ 以降、コンソールでエージェントを編集するたびに必要な 2 手順
> デプロイメントは**イミュータブルなバージョン (`AppVersion`) を指している**ため、
> コンソールでの編集はドラフトに入るだけで公開ウィジェットには反映されません。
>
> ```bash
> # 1. 新しいバージョンを作る
> curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
>   -H 'Content-Type: application/json' \
>   "https://ces.googleapis.com/v1beta/$APP/versions" -d '{"displayName":"vN"}'
> # 2. デプロイメントを新バージョンに向ける
> curl -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" \
>   -H 'Content-Type: application/json' \
>   "https://ces.googleapis.com/v1beta/$APP/deployments/web-widget?updateMask=appVersion" \
>   -d '{"appVersion":"'"$APP"'/versions/NEW_VERSION_ID"}'
> ```
>
> ドキュメントにある `versions/-` (ドラフトを直接指す指定) は `PATCH` のバリデーションで弾かれます。

---

## 8. サイトを再デプロイする

手順 3-1 / 5 / 7-D で書き換えた設定ファイルはサイトのコンテナに焼き込まれているため、
最後にもう一度デプロイして反映します。

```bash
gcloud run deploy agentic-commerce \
  --source . --region asia-northeast1 --allow-unauthenticated
```

---

## 9. 動作確認チェックリスト

| # | 確認内容 | 期待結果 |
| --- | --- | --- |
| 1 | サイトを開く | 商品グリッドに 28 件。DevTools のコンソールに `Firestore から 28 件の商品を読み込みました。` |
| 2 | ヘッダーの検索窓 | プレースホルダーが `AI Commerce Search で検索...` になっている |
| 3 | 「トマト」で検索 | 完熟トマトが先頭。0 件なら手順 4 の取り込みか `languageCode` を疑う |
| 4 | 商品カードをクリック | `product.html?id=<ID>` が開く |
| 5 | 右下のランチャー → 「トマトを探して」 | 要約テキスト + 画像付きの商品カード |
| 6 | カードのリンク | サイト内の商品ページへ飛ぶ (外部サイトではない) |
| 7 | 「商品ID 1 の詳細を教えて」 | 単一商品のカードが出る |
| 8 | カタログに無いもの (例:「スキンケア」) | 取り扱いが無い旨を答える。他社商品を作り出さない |

うまくいかない場合の切り分けは README の
[検索がヒットしないときは](README.md#検索がヒットしないときは) と
[つながらないときは](README.md#つながらないときは) にまとめてあります。

**デプロイしたのに画面が変わらないとき** — HTML/JS/CSS は `no-cache` を返すようになっていますが、
`Cache-Control` を付ける前に一度でも読み込んだブラウザは古いレスポンスを保持しています。
一度だけスーパーリロード (Ctrl/Cmd + Shift + R) してください。

---

## 10. 環境変数まとめ

| サービス | 変数 | 必須 | 値 |
| --- | --- | --- | --- |
| harvest-search-api | `PROJECT_NUMBER` | ✔ | プロジェクト**番号** |
| | `ALLOWED_ORIGINS` | ✔ | サイトのオリジン (カンマ区切り) |
| | `CATALOG_LOCATION` / `CATALOG_ID` / `SERVING_CONFIG_ID` / `BRANCH_ID` | | 既定: `global` / `default_catalog` / `default_search` / `default_branch` |
| | `QUERY_EXPANSION` | | 既定 `AUTO`。`DISABLED` で完全一致のみ |
| harvest-commerce-mcp | `PROJECT_NUMBER` | ✔ | プロジェクト**番号** |
| | `SITE_BASE_URL` | ✔ | サイトの URL (商品リンクの組み立てに使用) |
| | `CATALOG_LOCATION` / `CATALOG_ID` / `SERVING_CONFIG_ID` / `BRANCH_ID` / `QUERY_EXPANSION` | | search-api と同じ既定値 |
| agentic-commerce | — | | 静的サイトのため無し (`PORT` は Cloud Run が注入) |
| (生成スクリプト) | `SITE_BASE_URL` | ✔ | `js/convert_products.py` 実行時。商品の `uri` に使用 |

設定ファイル (コンテナに焼き込まれるため、変更したらサイトの再デプロイが必要):

| ファイル | 設定するもの |
| --- | --- |
| `js/config.js` (git 管理外 / `setup.sh webconfig` が生成) | Firebase 構成、Firestore コレクション名、search-api の URL、CES のプロジェクト / アプリID / デプロイメントID |
| [js/config.example.js](js/config.example.js) | 上記の雛形。手動で用意する場合はこれを `js/config.js` にコピーする |

---

## 11. 任意: 旧 Dialogflow CX 版エージェント

[agent/harvest-commerce-agent.zip](agent/harvest-commerce-agent.zip) は Dialogflow CX 形式の
エージェント定義で、[webhook/](webhook/) と組み合わせて動きます。
**本サイトのウィジェット (CES API) からは呼び出せません。** 手順は README の
[(旧) Dialogflow CX 版エージェント定義のインポート](README.md#旧-dialogflow-cx-版エージェント定義のインポート-agentharvest-commerce-agentzip) を参照してください。

## 12. リポジトリ内の生成物

以下はスクリプトが生成するファイルで、いずれも **git 管理外** です
(サイトの URL や自分のプロジェクトの値が入るため)。

| ファイル | 生成元 | 位置づけ |
| --- | --- | --- |
| `config.env` | `config.example.env` を手でコピー | 環境パラメータ。**唯一の設定ファイル** |
| `js/config.js` | `./setup.sh webconfig` | フロントエンドが読む設定。雛形は `js/config.example.js` |
| `products.jsonl` | `js/convert_products.py` | Retail カタログへの取り込みファイル |
| `products_for_bq.csv` | 同上 | 副産物 (BigQuery 経由で取り込みたい場合用) |

商品データの原本は [js/products.js](js/products.js) の `localProducts` 配列です。
商品を追加・変更したらここを直し、`./setup.sh firestore catalog` で
Firestore と Retail カタログの両方に反映させてください。
