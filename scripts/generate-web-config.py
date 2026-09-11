#!/usr/bin/env python3
"""js/config.js を生成する。

フロントエンドが読む環境パラメータは js/config.js の 1 ファイルにまとまっている。
setup.sh の webconfig ステップから呼ばれ、config.env の値と Cloud Run / CES から
実際に取得した値でこのファイルを書き直す。

値が空のときは "YOUR_..." というプレースホルダを書き出す。サイト側はその場合
その機能を無効にしてフォールバック動作する (Firestore -> ローカルカタログ、
Commerce Search -> クライアント側キーワード検索、エージェント -> 非表示)。
"""
import argparse
import json

EXAMPLE_NOTE = '''// ★ これは雛形です。実際に読み込まれるのは js/config.js のほうで、
// ★ ./setup.sh webconfig が config.env の内容から生成します (git 管理外)。
// ★ 手動で用意する場合はこのファイルを js/config.js にコピーして書き換えてください。
//
'''

TEMPLATE = '''// =============================================================================
// Harvest & Co. フロントエンド設定 (このファイル 1 つにまとまっています)
//
%(note)s// setup.sh の webconfig ステップが config.env の内容で自動生成します。
// 手で編集しても構いませんが、setup.sh を再実行すると上書きされます。
//
// "YOUR_" で始まる値はその機能が未設定であることを意味し、サイトは
// フォールバック動作 (ローカルカタログ / クライアント側検索 / エージェント非表示)
// になります。
// =============================================================================

// --- Firebase / Firestore ----------------------------------------------------
// 商品データの読み込み元。未設定なら js/products.js のローカルカタログを使います。
window.FIREBASE_CONFIG = %(firebase)s;

// 商品データを格納している Firestore コレクション名
window.FIRESTORE_PRODUCTS_COLLECTION = %(collection)s;

// --- AI Commerce Search ------------------------------------------------------
// search-api/ を Cloud Run にデプロイして得られる URL。
// 未設定ならヘッダー検索はクライアント側のキーワード一致検索にフォールバックします。
window.COMMERCE_SEARCH_API_URL = %(search_url)s;

// --- CX Agent Studio (CES) ---------------------------------------------------
// チャットウィジェットの接続先。appId が未設定ならウィジェットは読み込まれません。
window.AGENT_STUDIO_CONFIG = {
  // CES アプリが属する GCP プロジェクトID
  projectId: %(project_id)s,
  // CES アプリのロケーション (us / eu)
  location: %(ces_location)s,
  // CES アプリID
  appId: %(ces_app_id)s,
  // 公開アクセス付き WEB_UI デプロイメントのID
  deploymentId: %(deployment_id)s
};
'''


def js(value):
    """JavaScript のリテラルとして安全に埋め込む。"""
    return json.dumps(value, ensure_ascii=False)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--output', required=True)
    p.add_argument('--project-id', default='')
    p.add_argument('--ces-location', default='us')
    p.add_argument('--ces-app-id', default='')
    p.add_argument('--ces-deployment-id', default='web-widget')
    p.add_argument('--search-api-url', default='')
    p.add_argument('--firestore-collection', default='products')
    p.add_argument('--firebase-api-key', default='')
    p.add_argument('--firebase-auth-domain', default='')
    p.add_argument('--firebase-project-id', default='')
    p.add_argument('--firebase-storage-bucket', default='')
    p.add_argument('--firebase-messaging-sender-id', default='')
    p.add_argument('--firebase-app-id', default='')
    p.add_argument('--example', action='store_true',
                   help='雛形 (js/config.example.js) として注意書きを付ける')
    args = p.parse_args()

    firebase = {
        'apiKey': args.firebase_api_key or 'YOUR_FIREBASE_API_KEY',
        'authDomain': args.firebase_auth_domain or 'YOUR_PROJECT.firebaseapp.com',
        'projectId': args.firebase_project_id or args.project_id or 'YOUR_PROJECT_ID',
        'storageBucket': args.firebase_storage_bucket or 'YOUR_PROJECT.firebasestorage.app',
        'messagingSenderId': args.firebase_messaging_sender_id or 'YOUR_SENDER_ID',
        'appId': args.firebase_app_id or 'YOUR_FIREBASE_APP_ID',
    }

    body = TEMPLATE % {
        'note': EXAMPLE_NOTE if args.example else '',
        'firebase': json.dumps(firebase, ensure_ascii=False, indent=2),
        'collection': js(args.firestore_collection or 'products'),
        'search_url': js(args.search_api_url or 'YOUR_SEARCH_API_URL'),
        'project_id': js(args.project_id or 'YOUR_PROJECT_ID'),
        'ces_location': js(args.ces_location or 'us'),
        'ces_app_id': js(args.ces_app_id or 'YOUR_CES_APP_ID'),
        'deployment_id': js(args.ces_deployment_id or 'web-widget'),
    }

    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(body)
    print(f'書き出しました: {args.output}')


if __name__ == '__main__':
    main()
