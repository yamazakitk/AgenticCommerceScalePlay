// Harvest & Co. — AI Commerce Search (Vertex AI Search for Commerce) プロキシ
//
// Retail API の servingConfigs:search は OAuth2 が必須でブラウザから直接呼べないため、
// この Cloud Run サービスが仲介します。フロント (js/commerce-search.js) はここに
// クエリを投げ、ランキング順の商品ID配列を受け取ります。
//
// デプロイ例 (Cloud Run):
//   cd search-api
//   gcloud run deploy harvest-search-api \
//     --source . --region asia-northeast1 --allow-unauthenticated \
//     --set-env-vars PROJECT_NUMBER=800053188430,ALLOWED_ORIGINS=https://your-site.run.app
//
// サービスアカウントには roles/retail.viewer が必要です。
//
// 環境変数:
//   PROJECT_NUMBER    : Google Cloud のプロジェクト番号 (プロジェクトIDではありません)
//   CATALOG_LOCATION  : カタログのロケーション (既定: global)
//   CATALOG_ID        : カタログID (既定: default_catalog)
//   SERVING_CONFIG_ID : サービング構成ID (既定: default_search)
//   BRANCH_ID         : 検索対象ブランチ (既定: default_branch)
//   ALLOWED_ORIGINS   : CORS 許可オリジンのカンマ区切り。未設定なら "*"
//   QUERY_EXPANSION   : AUTO / DISABLED (既定: DISABLED)

const functions = require('@google-cloud/functions-framework');
const { GoogleAuth } = require('google-auth-library');

const PROJECT_NUMBER = process.env.PROJECT_NUMBER || '';
const CATALOG_LOCATION = process.env.CATALOG_LOCATION || 'global';
const CATALOG_ID = process.env.CATALOG_ID || 'default_catalog';
const SERVING_CONFIG_ID = process.env.SERVING_CONFIG_ID || 'default_search';
const BRANCH_ID = process.env.BRANCH_ID || 'default_branch';
// カタログが 28 件と小さく、AUTO だと関連の薄い商品まで補完されるため既定は無効。
// カタログを増やしたら AUTO にすると取りこぼしが減ります。
const QUERY_EXPANSION = process.env.QUERY_EXPANSION === 'AUTO' ? 'AUTO' : 'DISABLED';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const MAX_PAGE_SIZE = 100;

const CATALOG_PATH =
  `projects/${PROJECT_NUMBER}/locations/${CATALOG_LOCATION}/catalogs/${CATALOG_ID}`;
const PLACEMENT = `${CATALOG_PATH}/servingConfigs/${SERVING_CONFIG_ID}`;
const BRANCH = `${CATALOG_PATH}/branches/${BRANCH_ID}`;

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});
let authClient = null;

async function getAuthClient() {
  if (!authClient) authClient = await auth.getClient();
  return authClient;
}

function applyCors(req, res) {
  const origin = req.get('origin');
  if (ALLOWED_ORIGINS.length === 0) {
    res.set('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

// サイト側のカテゴリキー → Retail カタログに登録されている日本語カテゴリ名
const CATEGORY_TO_RETAIL = {
  vegetables: '野菜',
  fruits: '果物',
  meat: '精肉',
  seafood: '鮮魚',
  dairy: '乳製品',
  bakery: 'パン',
  beverages: '飲料',
  pantry: '調味料'
};

// Retail の filter 構文向けにダブルクォートをエスケープする
function quote(value) {
  return `"${String(value).replace(/["\\]/g, '\\$&')}"`;
}

function buildFilter(category, extraFilter) {
  const clauses = [];
  const retailCategory = CATEGORY_TO_RETAIL[category];
  if (retailCategory) {
    clauses.push(`categories: ANY(${quote(retailCategory)})`);
  }
  if (extraFilter) clauses.push(`(${extraFilter})`);
  return clauses.join(' AND ');
}

async function callRetailSearch(body) {
  const client = await getAuthClient();
  const response = await client.request({
    url: `https://retail.googleapis.com/v2/${PLACEMENT}:search`,
    method: 'POST',
    data: body,
    // 個々のクエリでリトライするより、素早く失敗してフロントのフォールバックに任せる
    timeout: 10_000,
    retry: false
  });
  return response.data;
}

// 実際に 1 件検索してみて、認証・IAM・カタログ設定がすべて通っているかを確かめる
async function healthCheck() {
  const config = {
    placement: PLACEMENT,
    branch: BRANCH,
    queryExpansion: QUERY_EXPANSION,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : ['*']
  };
  const usage = 'POST {"query": "トマト", "visitorId": "<任意の固定ID>"} で検索します。';

  if (!PROJECT_NUMBER) {
    return { status: 'error', detail: 'PROJECT_NUMBER が設定されていません。', config, usage };
  }
  try {
    const data = await callRetailSearch({
      branch: BRANCH,
      query: 'トマト',
      visitorId: 'healthcheck',
      pageSize: 1
    });
    return {
      status: 'ok',
      detail: `Retail API に接続できました (テストクエリ「トマト」で ${data.totalSize || 0} 件)。`,
      config,
      usage
    };
  } catch (err) {
    const detail = err?.response?.data?.error?.message || err.message;
    console.error('Health check failed:', detail);
    return { status: 'error', detail, config, usage };
  }
}

functions.http('harvestSearchApi', async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  // ブラウザで URL を直接開いた時に、設定内容と Retail への疎通を確認できるようにする
  if (req.method === 'GET') {
    return res.json(await healthCheck());
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }
  if (!PROJECT_NUMBER) {
    console.error('PROJECT_NUMBER is not configured.');
    return res.status(500).json({ error: 'PROJECT_NUMBER is not configured on the server.' });
  }

  const {
    query = '',
    category = '',
    visitorId = '',
    pageSize,
    offset,
    filter: extraFilter = ''
  } = req.body || {};

  const trimmedQuery = String(query).trim();
  const filter = buildFilter(category, extraFilter);

  // Retail Search は query と filter の少なくとも一方を要求する
  if (!trimmedQuery && !filter) {
    return res.status(400).json({ error: 'query または category のいずれかが必要です。' });
  }
  // visitorId は必須。ランキング学習に使われるため、フロントで安定した値を発行する
  if (!visitorId) {
    return res.status(400).json({ error: 'visitorId is required.' });
  }

  const requestBody = {
    branch: BRANCH,
    query: trimmedQuery,
    visitorId: String(visitorId),
    pageSize: Math.min(Number(pageSize) || 50, MAX_PAGE_SIZE),
    offset: Number(offset) || 0,
    queryExpansionSpec: { condition: QUERY_EXPANSION },
    // 表記ゆれ・打ち間違いを吸収する
    spellCorrectionSpec: { mode: 'AUTO' }
  };
  if (filter) requestBody.filter = filter;

  try {
    const data = await callRetailSearch(requestBody);
    return res.json({
      ids: (data.results || []).map((r) => r.id),
      totalSize: data.totalSize || 0,
      attributionToken: data.attributionToken || '',
      correctedQuery: data.correctedQuery || '',
      query: trimmedQuery
    });
  } catch (err) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.error?.message || err.message;
    console.error('Retail search failed:', status, detail);
    return res.status(502).json({ error: 'Commerce Search の呼び出しに失敗しました。', detail });
  }
});
