// Harvest & Co. — CX Agent Studio (Dialogflow CX) Webhook
//
// Firestore の "products" コレクションを検索し、Dialogflow Messenger の
// richContent (カード型カルーセル + カート追加ボタン) を返します。
//
// デプロイ例 (Cloud Run):
//   cd webhook
//   gcloud run deploy harvest-agent-webhook \
//     --source . --region asia-northeast1 --allow-unauthenticated
//
// 環境変数:
//   SITE_BASE_URL : 商品詳細リンクのベースURL (例: https://your-site.run.app)
//                   未設定の場合は相対パスを使用します。

const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const SITE_BASE_URL = (process.env.SITE_BASE_URL || '').replace(/\/$/, '');
const MAX_RESULTS = 5;

// カテゴリの日本語 → カタログ上のカテゴリキー対応表
const CATEGORY_KEYWORDS = {
  '野菜': 'vegetables',
  '果物': 'fruits',
  'フルーツ': 'fruits',
  '肉': 'meat',
  'お肉': 'meat',
  '精肉': 'meat',
  '魚': 'seafood',
  '鮮魚': 'seafood',
  '乳製品': 'dairy',
  '牛乳': 'dairy',
  'パン': 'bakery',
  '飲料': 'beverages',
  '飲み物': 'beverages',
  '調味料': 'pantry',
  'お米': 'pantry'
};

let productCache = null;
let productCacheAt = 0;

async function getProducts() {
  // 60秒間はキャッシュを利用 (カタログは28件と小規模)
  if (productCache && Date.now() - productCacheAt < 60_000) return productCache;
  const snapshot = await db.collection('products').get();
  productCache = snapshot.docs.map((doc) => {
    const data = doc.data();
    return { ...data, id: Number(data.id ?? doc.id) };
  });
  productCacheAt = Date.now();
  return productCache;
}

function searchProducts(products, rawQuery) {
  const query = String(rawQuery || '').trim().toLowerCase();
  if (!query) return [];

  const categoryKey = Object.entries(CATEGORY_KEYWORDS)
    .find(([ja]) => query.includes(ja.toLowerCase()))?.[1];

  const scored = products
    .map((p) => {
      let score = 0;
      const name = (p.name || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const origin = (p.origin || '').toLowerCase();
      const catName = (p.categoryName || '').toLowerCase();

      if (name.includes(query)) score += 10;
      if (categoryKey && p.category === categoryKey) score += 6;
      if (catName && query.includes(catName)) score += 6;
      if (desc.includes(query)) score += 3;
      if (origin.includes(query)) score += 2;

      // クエリを1文字ずつではなく、空白区切りトークンでも照合
      for (const token of query.split(/[\s、,]+/).filter(Boolean)) {
        if (token !== query && name.includes(token)) score += 4;
      }
      return { product: p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (b.product.rating || 0) - (a.product.rating || 0));

  return scored.slice(0, MAX_RESULTS).map((s) => s.product);
}

// 商品1件 → richContent カード (画像 + 情報 + カート追加ボタン)
function productToCard(p) {
  const detailUrl = `${SITE_BASE_URL}/product.html?id=${p.id}`;
  const stars = p.rating ? `★${p.rating}` : '';
  const stock = p.inStock === false ? ' (売り切れ)' : '';
  const card = [
    {
      type: 'image',
      rawUrl: p.image,
      accessibilityText: p.name
    },
    {
      type: 'info',
      title: p.name,
      subtitle: `¥${Number(p.price).toLocaleString()} / ${p.unit || ''} ${stars}${stock}`,
      anchor: { href: detailUrl }
    }
  ];
  if (p.inStock !== false) {
    card.push({
      type: 'button',
      text: 'カートに追加',
      icon: { type: 'add_shopping_cart', color: '#1A3A2B' },
      anchor: { href: `#add-to-cart-${p.id}` }
    });
  }
  return card;
}

function textMessage(text) {
  return { text: { text: [text] } };
}

function payloadMessage(payload) {
  return { payload };
}

function respond(res, messages, sessionParams) {
  const body = { fulfillmentResponse: { messages } };
  if (sessionParams) {
    body.sessionInfo = { parameters: sessionParams };
  }
  res.json(body);
}

functions.http('harvestAgentWebhook', async (req, res) => {
  try {
    const tag = req.body?.fulfillmentInfo?.tag || '';
    const params = req.body?.sessionInfo?.parameters || {};
    const userText = req.body?.text || '';
    const products = await getProducts();

    if (tag === 'search') {
      const query = params.query || userText;
      const results = searchProducts(products, query);

      if (results.length === 0) {
        return respond(res, [
          textMessage(`「${query}」に合う商品が見つかりませんでした。「野菜」「果物」「お肉」などのカテゴリ名でもお探しいただけます。`)
        ]);
      }

      // 各商品を個別のカードとして返す (Dialogflow Messenger のカード表示)
      const richContent = results.map(productToCard);
      return respond(res, [
        textMessage(`「${query}」の検索結果です (${results.length}件)。「カートに追加」ボタンでそのままカートインできます。`),
        payloadMessage({ richContent })
      ]);
    }

    if (tag === 'add-to-cart') {
      const item = params.item || userText;
      const matches = searchProducts(products, item);
      const target = matches[0];

      if (!target) {
        return respond(res, [
          textMessage(`「${item}」に該当する商品が見つかりませんでした。先に「${item}を探して」と検索してみてください。`)
        ]);
      }
      if (target.inStock === false) {
        return respond(res, [
          textMessage(`申し訳ありません。「${target.name}」は現在売り切れです。`)
        ]);
      }

      // サイト側 (js/agent-widget.js) がこの command を検出して addToCart() を実行する
      return respond(res, [
        textMessage(`「${target.name}」(¥${Number(target.price).toLocaleString()}) をカートに追加しました。他にお探しの商品はありますか？`),
        payloadMessage({ command: 'add_to_cart', productId: target.id, productName: target.name })
      ]);
    }

    return respond(res, [textMessage('リクエストを処理できませんでした (不明なタグです)。')]);
  } catch (err) {
    console.error('Webhook error:', err);
    return respond(res, [textMessage('申し訳ありません。商品情報の取得中にエラーが発生しました。')]);
  }
});
