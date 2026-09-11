// =============================================================================
// Harvest & Co. フロントエンド設定 (このファイル 1 つにまとまっています)
//
// ★ これは雛形です。実際に読み込まれるのは js/config.js のほうで、
// ★ ./setup.sh webconfig が config.env の内容から生成します (git 管理外)。
// ★ 手動で用意する場合はこのファイルを js/config.js にコピーして書き換えてください。
//
// setup.sh の webconfig ステップが config.env の内容で自動生成します。
// 手で編集しても構いませんが、setup.sh を再実行すると上書きされます。
//
// "YOUR_" で始まる値はその機能が未設定であることを意味し、サイトは
// フォールバック動作 (ローカルカタログ / クライアント側検索 / エージェント非表示)
// になります。
// =============================================================================

// --- Firebase / Firestore ----------------------------------------------------
// 商品データの読み込み元。未設定なら js/products.js のローカルカタログを使います。
window.FIREBASE_CONFIG = {
  "apiKey": "YOUR_FIREBASE_API_KEY",
  "authDomain": "YOUR_PROJECT.firebaseapp.com",
  "projectId": "YOUR_PROJECT_ID",
  "storageBucket": "YOUR_PROJECT.firebasestorage.app",
  "messagingSenderId": "YOUR_SENDER_ID",
  "appId": "YOUR_FIREBASE_APP_ID"
};

// 商品データを格納している Firestore コレクション名
window.FIRESTORE_PRODUCTS_COLLECTION = "products";

// --- AI Commerce Search ------------------------------------------------------
// search-api/ を Cloud Run にデプロイして得られる URL。
// 未設定ならヘッダー検索はクライアント側のキーワード一致検索にフォールバックします。
window.COMMERCE_SEARCH_API_URL = "YOUR_SEARCH_API_URL";

// --- CX Agent Studio (CES) ---------------------------------------------------
// チャットウィジェットの接続先。appId が未設定ならウィジェットは読み込まれません。
window.AGENT_STUDIO_CONFIG = {
  // CES アプリが属する GCP プロジェクトID
  projectId: "YOUR_PROJECT_ID",
  // CES アプリのロケーション (us / eu)
  location: "us",
  // CES アプリID
  appId: "YOUR_CES_APP_ID",
  // 公開アクセス付き WEB_UI デプロイメントのID
  deploymentId: "web-widget"
};
