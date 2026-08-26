# Harvest & Co. — Premium Supermarket Sample EC Site

**Harvest & Co.** は、厳選された新鮮な有機栽培野菜、特選果物、極上の精肉、鮮魚、こだわりの調味料などを提供するプレミアムスーパーマーケットのサンプルECサイトです。
純粋な HTML、CSS、および JavaScript (Vanilla JS) で記述されており、フレームワークなしで軽快に動作します。

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
  - **AI Commerce Search (Vertex AI Search for Retail) 連携:**
    - Google Cloud の Generative Search Widget (`gen-search-widget`) を統合。
    - 設定が有効化されると、ヘッダーの検索バーが自動的に AI Commerce Search に切り替わります。

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
- コレクション名を変える場合は `--collection <NAME>` を指定してください（フロントエンド側は `js/firebase-config.js` の `FIRESTORE_PRODUCTS_COLLECTION` を同じ値に変更）。

### 2. フロントエンドを Firestore に接続する
1. [Firebase コンソール](https://console.firebase.google.com/) でウェブアプリを追加し、構成オブジェクト（`apiKey`、`projectId` など）を取得します。
2. [js/firebase-config.js](js/firebase-config.js) の `window.FIREBASE_CONFIG` を取得した値に書き換えます。
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
本サイトの検索機能を Google Cloud の AI Commerce Search (Vertex AI Search) に接続するには、以下の設定を行います。

1. **Google Cloud Console** で Vertex AI Agent Builder または Search プリセットを作成し、ウィジェット統合用の **Config ID (構成ID)** を取得します。
2. [js/cart.js](file:///usr/local/google/home/yamazakit/sources/AgenticCommerceScalePlay/js/cart.js) の先頭にある以下の変数を取得した ID に書き換えます：
   ```javascript
   window.VERTEX_AI_SEARCH_CONFIG_ID = "YOUR_VERTEX_AI_SEARCH_CONFIG_ID";
   ```
3. 設定を保存すると、検索窓のプレースホルダーが `AI Commerce Search で検索...` に切り替わり、自動的に Google Cloud の検索ウィジェットが有効になります。
   *(※ ID が `YOUR_` で始まるデフォルト値のままであれば、自動的にローカルカタログ内の簡易検索にフォールバックします)*

## CX Agent Studio エージェント (Agentic Commerce) の埋め込み
CX Agent Studio (Conversational Agents / Dialogflow CX) で構築したエージェントを、トップページに **Dialogflow Messenger** ウィジェット(右下のチャットバブル)として表示できます。

1. [Conversational Agents コンソール](https://conversational-agents.cloud.google.com/) で対象エージェントを開きます。
2. **「Integrations (統合)」→「Dialogflow Messenger」** を選択し、統合を有効化します。
   - ウェブサイトで直接利用する場合は「未認証 API (Unauthenticated API)」を選択します。
   - 表示される埋め込みコードに `project-id` / `agent-id` / `location` が含まれています。
3. [js/agent-widget.js](js/agent-widget.js) の先頭にある設定を、取得した値に書き換えます:
   ```javascript
   window.AGENT_STUDIO_CONFIG = {
     projectId: "yamazakitlab",
     agentId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // ← エージェントID (UUID)
     location: "asia-northeast1",
     languageCode: "ja",
     chatTitle: "Harvest & Co. お買い物アシスタント"
   };
   ```
4. トップページを再読み込みすると、右下にブランドカラー(ディープフォレストグリーン)のチャットバブルが表示されます。

*(※ `agentId` が `YOUR_` で始まるデフォルト値のままの場合、ウィジェットは読み込まれません)*

**本番公開時の注意:** Dialogflow Messenger 統合の設定画面でドメイン制限 (allowed domains) を設定し、自サイトのドメインのみ許可することを推奨します。

### エージェント定義のインポート (agent/harvest-commerce-agent.zip)
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
5. 「Integrations → Dialogflow Messenger」を有効化し、`agent-id` を `js/agent-widget.js` に設定します (前述)。

**カート連携の仕組み:** カートはブラウザの `localStorage` で管理されているため、webhook はカスタムペイロード (`{ command: "add_to_cart", productId }`) やボタンリンク (`#add-to-cart-<id>`) を返し、サイト側の [js/agent-widget.js](js/agent-widget.js) がそれを検出して `addToCart()` を実行します。エージェント単体(コンソールのシミュレータ)でもテキスト応答は確認できますが、実際のカート追加は本サイト上のウィジェット経由でのみ動作します。

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
