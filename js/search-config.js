// AI Commerce Search (Vertex AI Search for Commerce) 接続設定
//
// search-api/ を Cloud Run にデプロイして得られた URL を設定してください。
//   cd search-api
//   gcloud run deploy harvest-search-api --source . --region asia-northeast1 \
//     --allow-unauthenticated --set-env-vars PROJECT_NUMBER=<プロジェクト番号>
//
// "YOUR_" で始まるデフォルト値のままの場合、ヘッダー検索は Commerce Search を
// 呼ばず、js/app.js のクライアント側キーワード一致検索にフォールバックします。

window.COMMERCE_SEARCH_API_URL = "https://harvest-search-api-800053188430.asia-northeast1.run.app";
