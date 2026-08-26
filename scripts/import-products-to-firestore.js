#!/usr/bin/env node
// Firestore への商品データ一括登録スクリプト
//
// 使い方:
//   cd scripts
//   npm install
//   node import-products-to-firestore.js [--project <PROJECT_ID>] [--collection <NAME>]
//
// 認証は Application Default Credentials (ADC) を使用します。
//   gcloud auth application-default login
// またはサービスアカウントキーを環境変数で指定します。
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

const admin = require('firebase-admin');
const products = require('../js/products.js');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    project: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID,
    collection: 'products',
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) opts.project = args[++i];
    else if (args[i] === '--collection' && args[i + 1]) opts.collection = args[++i];
  }
  return opts;
}

async function main() {
  const { project, collection } = parseArgs();

  if (!project) {
    console.error('エラー: プロジェクトIDが未指定です。--project フラグ、または GOOGLE_CLOUD_PROJECT 環境変数で指定してください。');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: project,
  });

  const db = admin.firestore();
  const batch = db.batch();

  products.forEach((product) => {
    // ドキュメントIDは商品IDの文字列表現。既存ドキュメントは上書き(再実行可能)。
    const ref = db.collection(collection).doc(String(product.id));
    batch.set(ref, product);
  });

  await batch.commit();
  console.log(`完了: ${products.length} 件の商品を Firestore の "${collection}" コレクションに登録しました (project: ${project})`);
}

main().catch((err) => {
  console.error('登録に失敗しました:', err);
  process.exit(1);
});
