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
