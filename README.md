# Harvest & Co. — Premium Supermarket Sample EC Site

**Harvest & Co.** は、厳選された新鮮な有機栽培野菜、特選果物、極上の精肉、鮮魚、こだわりの調味料などを提供するプレミアムスーパーマーケットのサンプルECサイトです。
純粋な HTML、CSS、および JavaScript (Vanilla JS) で記述されており、フレームワークなしで軽快に動作します。

## セットアップ

自分の Google Cloud プロジェクトに環境一式を構築するには、**設定ファイル 1 つを書いて
スクリプトを 1 つ実行するだけ**です。

```bash
cp config.example.env config.env
$EDITOR config.env          # PROJECT_ID を自分のプロジェクトIDに書き換える
./setup.sh                  # API 有効化から Cloud Run へのデプロイまで一気に実行
```

Firestore への商品登録、AI Commerce Search のカタログ取り込み、EC サイト・検索 API・
MCP サーバーの Cloud Run デプロイ、CES エージェントの構成までが順に実行されます。
詳細と、1 ステップずつ手で行う手順は **[SETUP.md](SETUP.md)** を参照してください。

本 README は各機能の仕組みと設定項目のリファレンスです。

## 構成ページ
1. **TOPページ (商品一覧・検索・フィルタ)** (`index.html`): 
   - ヒーローセクションからスムーズなスクロールでカタログへ遷移。
   - カゴ内の合計数量を表示するヘッダーバッジ。
   - カテゴリフィルタ（野菜、果物、精肉、鮮魚、乳製品、パン、飲料、調味料）による切り替え。
   - フリーワード検索機能。
   - ソート機能（価格の安い順、価格の高い順、評価の高い順）。
   - クイックカート追加機能（在庫切れ商品は自動で無効化）。

2. **商品詳細ページ** (`product.html`):
   - 商品の拡大画像、詳細説明、価格、レビュー評価、在庫ステータスの表示。
   - 数量選択（ステップカウンター）およびカート追加機能。
   - 栄養成分表示（カロリー、タンパク質、脂質、炭水化物）を掲載。
   - 同じカテゴリから最大4件の類似商品を自動でレコメンドする推薦セクション。

3. **お買い物カゴ (カート一覧・お会計計算)** (`cart.html`):
   - カートに入っている商品のリスト（画像、単価、数量ステップ変更、削除ボタン）。
   - 日本の食料品軽減税率（8%）の内税計算シミュレーション。
   - 送料無料基準（¥5,000以上で送料無料、未満は送料¥550）の動的計算。
   - 送料無料までの残高表示。
   - レジに進む（チェックアウト）シミュレーション。

4. **クイックカート・ドロワー** (全ページ共通):
   - どのページからでもヘッダーのカートアイコンをクリックすると、画面右側からスライドインするカートプレビュー。
   - ドロワー内での数量変更・削除もリアルタイムに全ページで同期。

## 技術スタックとデザイン
- **マークアップ / 構造:** HTML5 セマンティックタグ
- **スタイリング:** Vanilla CSS 3
  - Google Fonts (`Outfit` / `DM Sans`) による洗練されたタイポグラフィ。
  - レスポンシブデザイン（デスクトップ、タブレット、スマートフォンに対応）。
  - マイクロアニメーション（カートバッジのバウンス、ドロワーのスライドイン、ホバー時のカード浮き上がり等）。
- **ロジック:** 拡張性の高い Vanilla JavaScript
  - `localStorage` によるページ間のカート状態の永続化と同期。
  - **AI Commerce Search (Vertex AI Search for Commerce) 連携:**
    - ヘッダーの検索バーが Retail API (`servingConfigs:search`) の結果でサイトの商品グリッドを描き替えます。
    - Retail API は OAuth2 必須でブラウザから直接呼べないため、[search-api/](search-api/) (Cloud Run) が仲介します。
    - 接続先が未設定、または API が落ちている場合はクライアント側のキーワード検索に自動フォールバックします。

## 商品データの Firestore 登録と読み込み
本サイトの商品カタログは **Cloud Firestore** から読み込むことができます。Firebase が未設定の場合は、[js/products.js](js/products.js) 内のローカルカタログに自動でフォールバックします。

### 1. 商品データを Firestore に登録する
[scripts/import-products-to-firestore.js](scripts/import-products-to-firestore.js) を使って、商品データ（28件）を Firestore の `products` コレクションに一括登録します。

```bash
# 認証 (Application Default Credentials)
gcloud auth application-default login

# 依存パッケージのインストールと実行
cd scripts
npm install
node import-products-to-firestore.js --project YOUR_PROJECT_ID
```

- ドキュメントIDには商品ID（`"1"` 〜 `"28"`）が使用されます。再実行すると同じドキュメントが上書きされるため、何度でも安全に実行できます。
- コレクション名を変える場合は `--collection <NAME>` を指定してください（フロントエンド側は `js/config.js` の `FIRESTORE_PRODUCTS_COLLECTION` を同じ値に変更）。

### 2. フロントエンドを Firestore に接続する
1. [Firebase コンソール](https://console.firebase.google.com/) でウェブアプリを追加し、構成オブジェクト（`apiKey`、`projectId` など）を取得します。
2. `js/config.js` の `window.FIREBASE_CONFIG` を取得した値に書き換えます (`./setup.sh webconfig` を使うと自動生成されます)。
3. Firestore のセキュリティルールで `products` コレクションの読み取りを許可します:
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
4. ページを再読み込みすると、Firestore から商品データが読み込まれます（ブラウザのコンソールに `Firestore から 28 件の商品を読み込みました。` と表示されます）。

*(※ `apiKey` が `YOUR_` で始まるデフォルト値のままの場合、Firestore への接続は行われず、ローカルカタログで動作します)*

## AI Commerce Search の有効化と設定方法
ヘッダーの検索バーを Google Cloud の **AI Commerce Search (Vertex AI Search for Commerce / Retail API)** に接続します。

Retail API の `servingConfigs:search` は OAuth2 が必須でブラウザから直接呼べません。そのため
[search-api/](search-api/) を Cloud Run にデプロイし、フロントはそこ経由で検索します。返ってくるのは
ランキング順の商品IDで、商品カード自体は Firestore / ローカルカタログのデータで描画します。

```
ヘッダー検索 → js/commerce-search.js → search-api (Cloud Run) → retail.googleapis.com
                                                                   ↓ ランキング順の商品ID
                              js/app.js が window.products から引いて商品グリッドを描画
```

### 1. カタログに商品を取り込む
`products.jsonl` は [js/products.js](js/products.js) から生成します (git 管理外)。商品詳細ページの
URL (`uri`) を埋め込むため、サイトの URL を渡して実行してください。

```bash
SITE_BASE_URL=https://<サイトのURL> python3 js/convert_products.py
```

Retail の Product スキーマには黙って落ちる罠があります（エラーになりません）。フィールド名は
`url` ではなく **`uri`**、`attributes` は配列ではなく **`map<string, CustomAttribute>`**、
`languageCode: "ja"` が無いと日本語のトークナイズが効きません。上記スクリプトはこれらを満たした
形で出力します。

Google Cloud Console の **AI Commerce Search → Data** から `products.jsonl` を
`default_catalog` の `default_branch` にインポートします。取り込み後、Console の Data ページで
**件数が 28 件になっていること**を必ず確認してください（一部だけ取り込まれると、その商品は検索に出てきません）。

### 2. 検索APIをデプロイする
```bash
cd search-api
gcloud run deploy harvest-search-api \
  --source . --region asia-northeast1 --allow-unauthenticated \
  --set-env-vars PROJECT_NUMBER=<プロジェクト番号>,ALLOWED_ORIGINS=https://<サイトのURL>
```
`PROJECT_NUMBER` は**プロジェクトIDではなくプロジェクト番号**です（`gcloud projects describe <PROJECT_ID> --format='value(projectNumber)'`）。
Cloud Run のサービスアカウントには **`roles/retail.viewer`** を付与してください。

その他の環境変数（すべて任意）:

| 変数 | 既定値 | 用途 |
|---|---|---|
| `CATALOG_LOCATION` | `global` | カタログのロケーション |
| `CATALOG_ID` | `default_catalog` | カタログID |
| `SERVING_CONFIG_ID` | `default_search` | サービング構成ID |
| `BRANCH_ID` | `default_branch` | 検索対象ブランチ |
| `ALLOWED_ORIGINS` | `*` | CORS 許可オリジン（カンマ区切り） |
| `QUERY_EXPANSION` | `AUTO` | 結果不足時に関連商品で補完。`DISABLED` にすると完全一致のみ |

デプロイした URL をブラウザで開く（GET）と、Retail API への疎通と現在の設定を確認できます。
検索本体は POST のみを受け付けます。
```json
{ "status": "ok", "detail": "Retail API に接続できました (テストクエリ「トマト」で 1 件)。", "config": { ... } }
```

### 3. サイト側に接続先を設定する
`js/config.js` に、デプロイで得られた Cloud Run の URL を設定します
(`./setup.sh webconfig` を使うと自動生成されます)。
```javascript
window.COMMERCE_SEARCH_API_URL = "https://harvest-search-api-xxxx.a.run.app";
```
設定すると検索窓のプレースホルダーが `AI Commerce Search で検索...` に切り替わります。

*(※ `YOUR_` で始まるデフォルト値のまま、または API がエラーを返した場合は、ローカルカタログ内の
簡易キーワード検索に自動フォールバックします。ブラウザのコンソールに理由が出力されます)*

### 検索がヒットしないときは
検索結果は Retail 側のインデックス品質に依存します。ヒットしない語がある場合:

- **カタログの取り込み漏れ** — Console の Data ページで件数を確認します。
- **`languageCode` が未設定** — 商品に `languageCode: "ja"` が無いと日本語のトークナイズが効かず、
  商品名の一部（例: 「黒毛和牛A5ランクサーロインステーキ」の「和牛」）でヒットしなくなります。
  Console からのインポートでは自動で付きますが、Retail API で個別に商品を作成した場合は明示指定が必要です。
  ```bash
  curl -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json" \
    "https://retail.googleapis.com/v2/projects/<番号>/locations/global/catalogs/default_catalog/branches/0/products/<ID>?updateMask=languageCode" \
    -d '{"languageCode":"ja"}'
  ```
- **ヒット件数が極端に少ない / 0 件になる** — `QUERY_EXPANSION` が `DISABLED` になっていないか確認します。
  Retail はクエリ拡張なしだと実質タイトルの一致しか返さないため、`title` に含まれない語
  （「野菜」「お米」「オーガニック」など）はカテゴリ名や説明文に書かれていても 0 件になります。
  `AUTO` + `pinUnexpandedResults` なら完全一致を先頭に固定したまま関連商品で補えます。
  レスポンスの `pinnedResultCount` が完全一致の件数、それ以降が拡張分です。
  ```bash
  # 完全一致のみ / 拡張ありの比較
  curl -sX POST "$SEARCH_API" -H 'Content-Type: application/json' \
    -d '{"query":"野菜","visitorId":"debug"}'
  ```
- **同義語** — 拡張でも拾えない語（社内用語や略称など）は、Console の **Controls** で同義語ルールを追加します。
- **ユーザーイベント** — Commerce Search のランキングは検索・閲覧・購入イベントの蓄積で改善します。
  本サンプルはイベント送信を実装していないため、初期状態のランキングで動作します。

## CX Agent Studio エージェント (Agentic Commerce) の埋め込み
CX Agent Studio で構築したエージェントを、全ページの**右端にスライドインするチャットパネル**として表示します。実装は [js/agent-widget.js](js/agent-widget.js) の 1 ファイルのみで、右下のランチャーボタンから開閉します。

CX Agent Studio のエージェント (「アプリ」) は Dialogflow CX ではなく **CES API (`ces.googleapis.com`, Gemini Enterprise for Customer Experience)** 上にあります。Dialogflow Messenger (`df-messenger`) は使えないため、ウィジェットは自前で実装しています。

### 仕組み
ブラウザから CES を直接呼びます (Commerce Search と違い、プロキシは不要です)。

1. `POST {session}:generateChatToken` — **認証なしで呼べます**。セッション専用の短命 JWT (約1時間) が返ります。
2. `POST {session}:streamRunSession` — 1 のトークンを `Authorization: Bearer` に載せて発話を送ります。応答は JSON 配列がチャンク分割でストリーミングされ、逐次描画します。

会話履歴はセッション名でサーバー側に保持されるため、履歴の送り直しは不要です。セッションIDと表示用のログは `sessionStorage` に保存しており、商品ページやカートへ遷移しても会話が続きます。

### 1. 公開アクセス付きの WEB_UI デプロイメントを作る
`generateChatToken` を認証なしで呼ぶには、`channelType: WEB_UI` かつ公開アクセスを有効にしたデプロイメントが必要です。**許可オリジンは必ず自サイトのオリジンだけに絞ってください**(空にすると全オリジンから利用可能になります)。

```bash
APP="projects/YOUR_PROJECT/locations/us/apps/YOUR_APP_ID"

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
          "allowedOrigins": ["https://YOUR-SITE-URL"]
        }
      }
    }
  }' \
  "https://ces.googleapis.com/v1beta/$APP/deployments?deploymentId=web-widget"
```

アプリID・バージョンID は `GET https://ces.googleapis.com/v1beta/projects/YOUR_PROJECT/locations/us/apps` および `.../apps/{app}/versions` で確認できます。

### 2. サイト側に接続先を設定する
`js/config.js` (`./setup.sh webconfig` が生成。雛形は [js/config.example.js](js/config.example.js)) を書き換えます:

```javascript
window.AGENT_STUDIO_CONFIG = {
  projectId: "YOUR_PROJECT_ID",
  location: "us",                                 // CES アプリのリージョン
  appId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // ← アプリID (表示名ではなく name)
  deploymentId: "web-widget"                      // ← 手順1で作ったデプロイメント
};
```

表示まわりの文言 (`chatTitle` / `subtitle` / `greeting`) と `apiHost` は
[js/agent-widget.js](js/agent-widget.js) に既定値があり、同じオブジェクトに書けば上書きできます。

*(※ `appId` が `YOUR_` で始まるデフォルト値のままの場合、ウィジェットは読み込まれません)*

### 商品カードの描画について
CES は商品ウィジェットを**2通りの経路**で返してきます。ウィジェットはどちらも同じ商品カードに変換します。

1. **応答テキスト中の `[widget:product_list]` 記法** — タグの直後に JSON が続きます。ストリーミング中は JSON がまだ閉じていないため、受信完了後にまとめてカードへ置き換えます (途中の壊れた JSON を画面に出さないため)。
2. **構造化 `payload`** — `{"type":"product_detail_carousel","productDetails":[...]}` の形で `SessionOutput.payload` に入ってきます。

カードのリンク先は、商品IDがこのサイトのカタログに存在すればサイト内の `product.html?id=<id>` を使います。無い場合はエージェントが返した `uri` を使いますが、**同一オリジンのURLに限ります** — エージェントの出力で任意の外部サイトへ誘導できてしまうのを防ぐためです。

### つながらないときは
- **`Public access is not enabled for the deployment ...`** — 手順1の `enablePublicAccess` が `true` になっていません。`API` チャネルのデプロイメントでは公開アクセスを使えないため、`WEB_UI` のデプロイメントを別途作成してください。
- **`Origin ... is not allowed for the deployment ...`** — `allowedOrigins` にサイトのオリジンが入っていません。独自ドメインを追加したときやプレビュー URL から開いたときに出ます。デプロイメントを `PATCH` して追加します。
- **エージェントの応答言語** — 応答言語はアプリの `languageSettings.defaultLanguageCode` で決まります (指示が日本語でも、ここが `en-US` だと英語で返ります)。ウィジェット側では制御していません。
- **コンソールで直したのに反映されない** — デプロイメントは**イミュータブルなバージョン (`AppVersion`) を指している**ため、コンソールの編集はドラフトに入るだけで反映されません。編集のたびに以下の 2 手順が必要です。

  ```bash
  APP=projects/yamazakitlab/locations/us/apps/APP_ID
  # 1. ドラフトからバージョンを作る (レスポンスの name を控える)
  curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H 'Content-Type: application/json' \
    "https://ces.googleapis.com/v1beta/$APP/versions" -d '{"displayName":"vN"}'
  # 2. デプロイメントを新バージョンに向ける
  curl -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H 'Content-Type: application/json' \
    "https://ces.googleapis.com/v1beta/$APP/deployments/web-widget?updateMask=appVersion" \
    -d '{"appVersion":"'"$APP"'/versions/NEW_VERSION_ID"}'
  ```

  ※ドキュメントにある `versions/-` (ドラフトを直接指す指定) は `PATCH` のバリデーションで弾かれます。

### アプリ定義のエクスポート / インポート (agent/ces-app/)
CES アプリの定義一式 (エージェント・指示文・ウィジェットツール・MCP ツールセット・ガードレール) を
[agent/ces-app/](agent/ces-app/) にエクスポートしてあります。`exportApp` / `importApp` API を使うと、
アプリまるごとをファイルとして出し入れできます。

```bash
# コンソールでの編集をリポジトリに取り込む
./scripts/export-ces-app.sh YOUR_PROJECT_ID YOUR_APP_ID

# リポジトリの定義からアプリを作る (アプリIDを指定すると既存アプリを丸ごと置き換え)
./scripts/import-ces-app.sh YOUR_PROJECT_ID [APP_ID]
```

- `exportApp` は長時間実行オペレーションを返し、完了時の `response.appContent` に
  アプリのフォルダ構成を zip 圧縮したものが base64 で入ります。スクリプトはそれを展開して
  `agent/ces-app/` に書き出します (差分が読めるよう、zip ではなくファイルツリーで管理しています)。
- **`deployments` はエクスポートに含まれません。** インポート後に WEB_UI デプロイメントを作り直してください。
- **MCP ツールセットの `serverAddress` はエクスポート元の Cloud Run URL のまま**です。インポート後に
  自分の `harvest-commerce-mcp` の URL へ差し替える必要があります。
- 手順の詳細は [SETUP.md の「7. CES エージェントを構成する」](SETUP.md#7-ces-エージェントを構成する) を参照してください。

### (旧) Dialogflow CX 版エージェント定義のインポート (agent/harvest-commerce-agent.zip)
[agent/harvest-commerce-agent.zip](agent/harvest-commerce-agent.zip) は、CX Agent Studio (Conversational Agents / Dialogflow CX) に**リストア(インポート)可能なエージェント定義**です。以下の機能を含みます:

- **商品検索** (`search.products` インテント): 「トマトを探して」→ webhook が Firestore を検索し、商品カード(画像・価格・評価)のカルーセルを表示
- **カート追加**: カード内の「カートに追加」ボタン、または「りんごをカートに入れて」という発話でサイトのカートに商品を追加
- **ウェルカム対応**: あいさつに応答し、検索例のチップ(候補ボタン)を提示

**手順:**

1. **Webhook をデプロイ** (Firestore の商品検索 API):
   ```bash
   cd webhook
   gcloud run deploy harvest-agent-webhook \
     --source . --region asia-northeast1 --allow-unauthenticated \
     --set-env-vars SITE_BASE_URL=https://YOUR-SITE-URL
   ```
   ※事前に `scripts/import-products-to-firestore.js` で商品データを Firestore に登録しておいてください。
2. [Conversational Agents コンソール](https://conversational-agents.cloud.google.com/) で新しい空のエージェントを作成します (リージョン: `asia-northeast1` 推奨)。
3. エージェントの **「⋮」メニュー →「Restore (リストア)」** を選択し、`agent/harvest-commerce-agent.zip` をアップロードします。**リストアは既存のエージェント内容を上書きするため、必ず新規作成したエージェントに対して実行してください。**
4. リストア後、**Manage → Webhooks → `harvest-webhook`** を開き、URI を手順1でデプロイした Cloud Run の URL に書き換えます。
5. 動作確認はコンソールのシミュレータで行えます。**この zip は Dialogflow CX 形式で、本サイトのウィジェット (CES API) からは呼び出せません。** サイトに載せる場合は CX Agent Studio 側でアプリとして作り直し、前述の手順でデプロイメントを作成してください。

**カート連携の仕組み:** カートはブラウザの `localStorage` で管理されているため、エージェントは構造化ペイロード (`{ command: "add_to_cart", productId }`) や応答テキスト中のリンク (`#add-to-cart-<id>`) を返し、サイト側の [js/agent-widget.js](js/agent-widget.js) がそれを検出して `addToCart()` を実行します。エージェント単体(コンソールのシミュレータ)でもテキスト応答は確認できますが、実際のカート追加は本サイト上のウィジェット経由でのみ動作します。

## エージェント用 MCP サーバー (mcp-server/)

エージェントが「このサイトの商品」を答えられるよう、AI Commerce Search (Retail API) を **MCP (Model Context Protocol)** のツールとして公開する Cloud Run サービスです。CX Agent Studio のツールセットからこのサーバーを参照します。

```
CES エージェント ──MCP (streamable HTTP + ID トークン)──> mcp-server ──> Retail API
```

公開ツールは 3 つです。

| ツール | 用途 |
| --- | --- |
| `search_products(query, page_size, category)` | 自然文で商品を検索。`productId` / `title` / `subtitle` / `price` / `imageUris` / `uri` を JSON で返すので、そのまま `product_list` ウィジェットに渡せます |
| `get_product_details(product_id)` | 商品 1 件の詳細 (価格・在庫・評価・産地などの属性) |
| `fetch_recipe_ingredients(url)` | レシピページを開いて材料を読み取る。`Recipe-Agent` が使います |

実装上のポイント:

- **検索結果から商品情報を組み立て直しています。** カタログの `attributesConfig` が全項目 `RETRIEVABLE_DISABLED` のため、`servingConfigs:search` は商品 ID しか返しません。ヒットした ID に対して `products.get` を並列に投げてタイトル・画像・価格を補完しています。カタログ設定側で `retrievableOption` を有効化すれば、この追加取得は不要にできます。
- **クエリ拡張は `AUTO` + `pinUnexpandedResults`** で、サイト検索 ([search-api](search-api/)) と同じ挙動にそろえています。完全一致を先頭に固定したうえで関連商品を補うため、各商品に `exactMatch` を付けて返します。
- **商品ページ URL はサーバー側で組み立てます。** カタログの商品に `uri` が無いため、`SITE_BASE_URL` から `.../product.html?id=<商品ID>` を生成します。
- **CES 互換のためのモンキーパッチ**を入れています (Accept ヘッダー検証の緩和、`title`/`default` を落とした最小のツールスキーマ、`stateless_http` / `json_response`)。参考リポジトリ [shrishmarnad/VertexcommerceMCP](https://github.com/shrishmarnad/VertexcommerceMCP) と同じ対処です。
- レコメンド (`recently_viewed`) はユーザーイベントを投入していないと常に空を返すため、ツールとしては公開していません。
- **`fetch_recipe_ingredients` は SSRF 対策込みで実装しています。** ユーザーが渡した URL をサーバー側から取りに行くツールなので、そのままだとメタデータサーバー (169.254.169.254) や VPC 内部を読み出せてしまいます。scheme を http/https に限定し、名前解決した IP がすべてグローバルであることを確認し、リダイレクトは自前で追って 1 ホップごとに同じ検証をかけ、本文は 2MB / 10 秒で打ち切っています。材料は JSON-LD の `schema.org/Recipe` → microdata の `itemprop="recipeIngredient"` → 本文テキストの抜粋、の順に拾います (最後のケースはモデルに読み取らせます)。なお bot 対策の入ったレシピサイトはブロックされることがあり、その場合は Recipe-Agent が検索にフォールバックします。

### 1. デプロイする

```bash
cd mcp-server
gcloud run deploy harvest-commerce-mcp \
  --source . --region us-central1 \
  --no-allow-unauthenticated \
  --service-account 800053188430-compute@developer.gserviceaccount.com \
  --set-env-vars PROJECT_NUMBER=800053188430,SITE_BASE_URL=https://YOUR-SITE-URL
```

実行サービスアカウントには `roles/retail.viewer` が必要です。**公開してはいけません** (`--no-allow-unauthenticated`)。呼び出せるのは次の手順で権限を与える CES サービスエージェントだけにします。

### 2. CES サービスエージェントに呼び出し権限を与える

CES は `serviceAgentIdTokenAuthConfig` により、サービスエージェントの ID トークンで MCP サーバーを呼びます。そのサービスアカウントにこのサービスへの `run.invoker` を付与します。

```bash
gcloud run services add-iam-policy-binding harvest-commerce-mcp \
  --region us-central1 \
  --member serviceAccount:service-PROJECT_NUMBER@gcp-sa-ces.iam.gserviceaccount.com \
  --role roles/run.invoker
```

### 3. エージェントのツールセットを差し替える

```bash
APP=projects/yamazakitlab/locations/us/apps/APP_ID
curl -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H 'Content-Type: application/json' \
  "https://ces.googleapis.com/v1beta/$APP/toolsets/TOOLSET_ID?updateMask=mcpToolset.serverAddress" \
  -d '{"mcpToolset":{"serverAddress":"https://harvest-commerce-mcp-PROJECT_NUMBER.us-central1.run.app/mcp"}}'
```

### 4. エージェントの指示を新しいツールに合わせる

MCP サーバーを差し替えると**ツール名とレスポンス形式が変わる**ため、`Search-Agent` の指示もそろえる必要があります。コンソールに投入している内容は [agent/ces-search-agent-instruction.txt](agent/ces-search-agent-instruction.txt) に置いてあります。あわせて、そのエージェントが使うツール (`toolIds`) を `search_products` / `get_product_details` に設定します。

差し替え後は前述のとおり**バージョン作成 → デプロイメント切り替え**を行わないと、公開ウィジェットには反映されません。

### ローカルでの動作確認

```bash
cd mcp-server
pip install -r requirements.txt
PROJECT_NUMBER=800053188430 SITE_BASE_URL=http://localhost:8099 PORT=8091 python3 server.py

curl -s -X POST http://localhost:8091/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
curl -s -X POST http://localhost:8091/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"search_products","arguments":{"query":"トマト","page_size":3}}}'
```

## 起動方法

### 1. ローカルサーバーでの実行（推奨）
ブラウザのセキュリティ制限（CORS等）を防ぐため、ローカル開発サーバーでの起動を推奨します。
ターミナルで本プロジェクトのディレクトリに移動し、以下のいずれかのコマンドを実行してください。

**Python を使用する場合:**
```bash
python3 -m http.server 8080
```
起動後、ブラウザで [http://localhost:8080](http://localhost:8080) にアクセスします。

**Node.js (npx) を使用する場合:**
```bash
npx -y http-server -p 8080
```
起動後、ブラウザで [http://localhost:8080](http://localhost:8080) にアクセスします。

### 2. 直接ファイルを開く場合
`index.html` ファイルをダブルクリックしてブラウザで直接開くことも可能です。
*(※一部のブラウザ設定により、URLパラメータの処理でローカルファイルセキュリティ警告が出る場合がありますが、基本動作は問題ありません)*
