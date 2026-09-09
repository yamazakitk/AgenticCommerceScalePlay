// Firebase / Firestore 接続設定
//
// Firebase コンソール (https://console.firebase.google.com/) のプロジェクト設定 >
// 「マイアプリ」からウェブアプリの構成オブジェクトを取得し、以下を書き換えてください。
// apiKey が "YOUR_" で始まるデフォルト値のままの場合、Firestore への接続は行わず、
// js/products.js 内のローカル商品カタログに自動でフォールバックします。

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCZxKJX7O8xQt5QpcxROG796j4PvGMuVH8",
  authDomain: "yamazakitlab.firebaseapp.com",
  projectId: "yamazakitlab",
  storageBucket: "yamazakitlab.firebasestorage.app",
  messagingSenderId: "800053188430",
  appId: "1:800053188430:web:e224be8884cca51b8bf01f"
};

// 商品データを格納している Firestore コレクション名
window.FIRESTORE_PRODUCTS_COLLECTION = "products";

// ==========================================
// Vertex AI Search for Commerce (Google Cloud Retail API) 設定
// ==========================================
window.COMMERCE_SEARCH_CONFIG = {
  enabled: true,
  projectId: "yamazakitlab",
  location: "global",
  catalogId: "default_catalog",
  servingConfigId: "default_search",
  // Cloud Run にデプロイされた Retail API プロキシエンドポイント
  apiUrl: "https://harvest-agent-webhook-800053188430.asia-northeast1.run.app/api/search"
};

// 後方互換用
window.COMMERCE_SEARCH_API_URL = window.COMMERCE_SEARCH_CONFIG.apiUrl;
