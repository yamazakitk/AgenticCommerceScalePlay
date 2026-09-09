// Harvest & Co. — CX Agent Studio (Dialogflow CX) Webhook & AI Commerce Search Proxy
//
// 1. Vertex AI Search for Commerce (Google Cloud Retail API) を用いた商品検索 API
// 2. Dialogflow CX Webhook (search.products / add.to.cart)
//
// デプロイ例 (Cloud Run):
//   cd webhook
//   gcloud run deploy harvest-agent-webhook \
//     --source . --region asia-northeast1 --allow-unauthenticated

const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const { SearchServiceClient } = require('@google-cloud/retail').v2;

admin.initializeApp();
const db = admin.firestore();
const searchClient = new SearchServiceClient();

// Vertex AI Search for Commerce Configuration
const RETAIL_PROJECT_ID = process.env.RETAIL_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'yamazakitlab';
const RETAIL_LOCATION = process.env.RETAIL_LOCATION || 'global';
const RETAIL_CATALOG = process.env.RETAIL_CATALOG || 'default_catalog';
const RETAIL_SERVING_CONFIG = process.env.RETAIL_SERVING_CONFIG || 'default_search';
const PLACEMENT = `projects/${RETAIL_PROJECT_ID}/locations/${RETAIL_LOCATION}/catalogs/${RETAIL_CATALOG}/servingConfigs/${RETAIL_SERVING_CONFIG}`;

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

// Vertex AI Search for Commerce (Retail API) への検索クエリ
async function searchWithRetail(query, visitorId = 'anonymous-visitor') {
  if (!query || !String(query).trim()) return [];
  try {
    console.log(`[Vertex AI Search for Commerce] Querying Retail API: placement="${PLACEMENT}", query="${query}", visitorId="${visitorId}"`);
    const request = {
      placement: PLACEMENT,
      query: String(query).trim(),
      visitorId: visitorId,
      pageSize: 50
    };
    const [response] = await searchClient.search(request, { autoPaginate: false });
    const results = response || [];
    const ids = results.map(r => {
      if (r.id) return String(r.id);
      if (r.product?.id) return String(r.product.id);
      if (r.product?.name) return r.product.name.split('/').pop();
      return null;
    }).filter(Boolean);
    console.log(`[Vertex AI Search for Commerce] Successfully retrieved ${ids.length} products:`, ids);
    return ids;
  } catch (err) {
    console.error('[Vertex AI Search for Commerce] Retail Search API error:', err.message, err.stack);
    return null;
  }
}

// フォールバック用のキーワード検索
function fallbackSearch(products, rawQuery) {
  const query = String(rawQuery || '').trim().toLowerCase();
  if (!query) return [];

  const categoryKey = Object.entries(CATEGORY_KEYWORDS)
    .find(([ja]) => query.includes(ja.toLowerCase()))?.[1];

  return products
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

      for (const token of query.split(/[\s、,]+/).filter(Boolean)) {
        if (token !== query && name.includes(token)) score += 4;
      }
      return { product: p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (b.product.rating || 0) - (a.product.rating || 0))
    .map((s) => s.product);
}

// AI Commerce Search を優先した商品検索
async function searchProducts(products, rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) return [];

  const retailIds = await searchWithRetail(query);
  if (retailIds && retailIds.length > 0) {
    const idMap = new Map(products.map(p => [String(p.id), p]));
    const matched = [];
    for (const id of retailIds) {
      if (idMap.has(id)) {
        matched.push(idMap.get(id));
      }
    }
    if (matched.length > 0) return matched;
  }

  return fallbackSearch(products, query);
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
  // CORS 設定
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  // 1. フロントエンドからの AI Commerce Search (Retail Search) API リクエスト
  if (req.path === '/api/search' || req.query.q !== undefined || (req.body && req.body.query && !req.body.fulfillmentInfo)) {
    try {
      const query = req.query.q || req.body?.query || '';
      const visitorId = req.query.visitorId || req.body?.visitorId || 'web-visitor';
      const allProducts = await getProducts();
      
      if (!String(query).trim()) {
        return res.json({
          success: true,
          query: '',
          engine: 'none',
          productIds: allProducts.map(p => p.id),
          products: allProducts,
          totalSize: allProducts.length
        });
      }

      const retailIds = await searchWithRetail(query, visitorId);
      let results = [];
      let engine = 'vertex_ai_search_for_commerce';

      if (retailIds && retailIds.length > 0) {
        const idMap = new Map(allProducts.map(p => [String(p.id), p]));
        results = retailIds.map(id => idMap.get(id)).filter(Boolean);
      } else {
        results = fallbackSearch(allProducts, query);
        engine = 'local_fallback';
      }

      return res.json({
        success: true,
        engine,
        placement: PLACEMENT,
        query,
        productIds: results.map(p => p.id),
        products: results,
        totalSize: results.length
      });
    } catch (err) {
      console.error('Search API error:', err);
      return res.status(500).json({ error: 'Search failed', details: err.message });
    }
  }

  // 2. Dialogflow CX Webhook リクエスト
  try {
    const tag = req.body?.fulfillmentInfo?.tag || '';
    const params = req.body?.sessionInfo?.parameters || {};
    const userText = req.body?.text || '';
    const products = await getProducts();

    if (tag === 'search') {
      const query = params.query || userText;
      const results = (await searchProducts(products, query)).slice(0, MAX_RESULTS);

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
      const matches = await searchProducts(products, item);
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
