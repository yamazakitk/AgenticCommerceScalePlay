// AI Commerce Search クライアント
//
// search-api/ (Cloud Run) 経由で Vertex AI Search for Commerce の
// servingConfigs:search を呼び出し、ランキング順の商品ID配列を返します。
// Retail API は OAuth2 必須のため、ブラウザから直接は呼べません。

const VISITOR_ID_KEY = 'harvest_visitor_id';
const SEARCH_TIMEOUT_MS = 8000;

function isCommerceSearchEnabled() {
  const url = window.COMMERCE_SEARCH_API_URL;
  return !!(url && !url.startsWith('YOUR_'));
}

// Commerce Search はランキング学習に訪問者IDを使うため、ブラウザごとに固定する
function getVisitorId() {
  let id = null;
  try {
    id = localStorage.getItem(VISITOR_ID_KEY);
  } catch (e) {
    // プライベートブラウジング等で localStorage が使えない場合は都度生成する
  }
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
         `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      localStorage.setItem(VISITOR_ID_KEY, id);
    } catch (e) {
      // 保存できなくても検索自体は成立する
    }
  }
  return id;
}

// 成功時: { ids: number[], totalSize, attributionToken, correctedQuery }
// 失敗時: 例外を投げる (呼び出し側でローカル検索へフォールバックすること)
async function commerceSearch({ query = '', category = 'all', pageSize = 50 } = {}) {
  if (!isCommerceSearchEnabled()) {
    throw new Error('Commerce Search is not configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(window.COMMERCE_SEARCH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        category: category === 'all' ? '' : category,
        visitorId: getVisitorId(),
        pageSize
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Search API responded ${response.status}: ${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    return {
      // カタログ側のIDは文字列、サイト側は数値なので正規化する
      ids: (data.ids || []).map(Number).filter((id) => !Number.isNaN(id)),
      totalSize: data.totalSize || 0,
      attributionToken: data.attributionToken || '',
      correctedQuery: data.correctedQuery || '',
      // 先頭 pinnedResultCount 件が完全一致、残りはクエリ拡張で補われた関連商品
      expanded: !!data.expanded,
      pinnedResultCount: Number(data.pinnedResultCount) || 0
    };
  } finally {
    clearTimeout(timer);
  }
}

window.isCommerceSearchEnabled = isCommerceSearchEnabled;
window.commerceSearch = commerceSearch;
