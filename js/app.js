// App logic for index.html (Catalog Page)

// Track catalog filters
let activeCategory = 'all';
let searchKeyword = '';
let currentSort = 'default';

// AI Commerce Search の直近の結果。同じ (query, category) の再描画では再検索しない。
// { query, category, ids: number[], correctedQuery } の形。
let commerceSearchResult = null;
// 入力が速いと古いレスポンスが後着することがあるため、最新のリクエストだけ反映する
let commerceSearchSeq = 0;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inject shared layouts (header, cart drawer, footer)
  if (typeof window.injectLayout === 'function') {
    window.injectLayout('home');
  }

  // Wait until the product catalog is loaded (Firestore or local fallback)
  if (window.productsReady) {
    await window.productsReady;
  }

  // 2. Parse URL parameters for direct linking (e.g. index.html?category=meat or index.html?search=tomato)
  const urlParams = new URLSearchParams(window.location.search);
  const categoryParam = urlParams.get('category');
  const searchParam = urlParams.get('search');

  if (categoryParam) {
    activeCategory = categoryParam;
    updatePillsUI(activeCategory);
  }

  if (searchParam) {
    searchKeyword = searchParam;
    const headerSearch = document.getElementById('search-input');
    if (headerSearch) {
      headerSearch.value = searchParam;
    }
  }

  // 3. Render products initial list
  filterAndRenderProducts();
});

// Update pills active styling
function updatePillsUI(category) {
  const pills = document.querySelectorAll('.category-pill');
  pills.forEach(pill => {
    if (pill.getAttribute('data-category') === category) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
}

// Category filter trigger
function filterCategory(category) {
  activeCategory = category;
  updatePillsUI(category);
  
  // Update browser URL query without refreshing the page
  const url = new URL(window.location);
  if (category === 'all') {
    url.searchParams.delete('category');
  } else {
    url.searchParams.set('category', category);
  }
  window.history.pushState({}, '', url);

  filterAndRenderProducts();
}

// Handle sorting changes
function handleSortChange() {
  const select = document.getElementById('sort-select');
  if (select) {
    currentSort = select.value;
    filterAndRenderProducts();
  }
}

// Keep the ?search= parameter in sync so results stay shareable / reloadable
function syncSearchParamToUrl() {
  const url = new URL(window.location);
  if (searchKeyword) {
    if (url.searchParams.get('search') === searchKeyword) return;
    url.searchParams.set('search', searchKeyword);
  } else {
    if (!url.searchParams.has('search')) return;
    url.searchParams.delete('search');
  }
  window.history.replaceState({}, '', url);
}

function setCatalogTitle(text) {
  const catalogTitle = document.getElementById('catalog-title');
  if (catalogTitle) catalogTitle.textContent = text;
}

function categoryTitle() {
  if (activeCategory === 'all') return 'おすすめの商品';
  const activePill = document.querySelector(`.category-pill[data-category="${activeCategory}"]`);
  return activePill ? `${activePill.textContent}の一覧` : '商品一覧';
}

// Client-side fallback used when Commerce Search is unconfigured or unreachable
function applyLocalFilter() {
  const keyword = searchKeyword.toLowerCase();
  return window.products.filter(product => {
    const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
    const matchesSearch = !keyword ||
      product.name.toLowerCase().includes(keyword) ||
      product.description.toLowerCase().includes(keyword) ||
      product.origin.toLowerCase().includes(keyword) ||
      product.categoryName.toLowerCase().includes(keyword);
    return matchesCategory && matchesSearch;
  });
}

// Map Commerce Search's ranked IDs back onto the local catalog, preserving rank order.
// カタログと Firestore の同期ズレで見つからないIDは黙って除外する。
function resolveRankedProducts(ids) {
  const byId = new Map(window.products.map(p => [p.id, p]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

// Main search / filter / sort orchestration
async function filterAndRenderProducts() {
  if (!document.getElementById('product-grid')) return;

  // Retrieve Search Input from Header
  const searchBarInput = document.getElementById('search-input');
  if (searchBarInput) {
    searchKeyword = searchBarInput.value.trim();
  }
  syncSearchParamToUrl();

  const useCommerceSearch = !!searchKeyword &&
    typeof window.isCommerceSearchEnabled === 'function' &&
    window.isCommerceSearchEnabled();

  if (!useCommerceSearch) {
    commerceSearchResult = null;
    commerceSearchSeq++; // 実行中の検索結果が後から上書きしないようにする
    renderCatalog(applyLocalFilter(), searchKeyword ? `「${searchKeyword}」の検索結果` : categoryTitle());
    return;
  }

  // 同じ条件なら再検索せず、キャッシュ済みのランキングを描画し直す
  const cached = commerceSearchResult;
  if (cached && cached.query === searchKeyword && cached.category === activeCategory) {
    renderCatalog(resolveRankedProducts(cached.ids), commerceSearchTitle(cached));
    return;
  }

  const seq = ++commerceSearchSeq;
  setCatalogTitle(`「${searchKeyword}」を検索中…`);

  try {
    const result = await window.commerceSearch({
      query: searchKeyword,
      category: activeCategory,
      pageSize: 100
    });
    if (seq !== commerceSearchSeq) return; // 新しい検索が始まっているので破棄

    commerceSearchResult = {
      query: searchKeyword,
      category: activeCategory,
      ids: result.ids,
      correctedQuery: result.correctedQuery
    };
    renderCatalog(resolveRankedProducts(result.ids), commerceSearchTitle(commerceSearchResult));
  } catch (e) {
    if (seq !== commerceSearchSeq) return;
    console.error('[Harvest & Co.] AI Commerce Search の呼び出しに失敗しました。クライアント側検索にフォールバックします。', e);
    commerceSearchResult = null;
    renderCatalog(applyLocalFilter(), `「${searchKeyword}」の検索結果`);
  }
}

function commerceSearchTitle({ query, correctedQuery }) {
  return correctedQuery && correctedQuery !== query
    ? `「${correctedQuery}」の検索結果（「${query}」を自動補正）`
    : `「${query}」の検索結果`;
}

// Sort and paint the given product list into the catalog grid
function renderCatalog(products, titleText) {
  const productGrid = document.getElementById('product-grid');
  const noResults = document.getElementById('no-results');

  if (!productGrid) return;

  setCatalogTitle(titleText);

  // Commerce Search の関連度順を保つため、"おすすめ順" では並べ替えない
  let filtered = products.slice();

  // 2. Sort products
  if (currentSort === 'price-asc') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (currentSort === 'price-desc') {
    filtered.sort((a, b) => b.price - a.price);
  } else if (currentSort === 'rating') {
    filtered.sort((a, b) => b.rating - a.rating);
  }

  // 3. Render DOM
  if (filtered.length === 0) {
    productGrid.style.display = 'none';
    if (noResults) noResults.style.display = 'block';
    return;
  }

  productGrid.style.display = 'grid';
  if (noResults) noResults.style.display = 'none';

  let html = '';
  filtered.forEach(product => {
    // Build star rating HTML
    let starsHtml = '';
    const fullStars = Math.floor(product.rating);
    const hasHalfStar = product.rating % 1 !== 0;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        starsHtml += `
          <svg class="star-icon" viewBox="0 0 24 24">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
        `;
      } else if (i === fullStars && hasHalfStar) {
        starsHtml += `
          <svg class="star-icon" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="half-star-${product.id}">
                <stop offset="50%" stop-color="var(--accent-color)"/>
                <stop offset="50%" stop-color="#EAEAE3"/>
              </linearGradient>
            </defs>
            <path fill="url(#half-star-${product.id})" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
        `;
      } else {
        starsHtml += `
          <svg class="star-icon" style="fill: #EAEAE3;" viewBox="0 0 24 24">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
        `;
      }
    }

    const badgeTag = product.id === 8 ? '<span class="badge-tag">A5ランク</span>' : 
                     (product.id === 6 ? '<span class="badge-tag">人気No.1</span>' : '');

    const soldoutOverlay = !product.inStock ? '<div class="badge-soldout">売り切れ</div>' : '';

    html += `
      <div class="product-card" id="product-${product.id}">
        <a href="product.html?id=${product.id}" class="product-img-link">
          <div class="product-img-wrapper">
            ${badgeTag}
            ${soldoutOverlay}
            <img src="${product.image}" alt="${product.name}">
          </div>
        </a>
        <div class="product-body">
          <div class="product-origin">${product.origin}</div>
          <a href="product.html?id=${product.id}">
            <h3 class="product-name">${product.name}</h3>
          </a>
          <div class="product-rating">
            <div style="display: flex; gap: 2px;">
              ${starsHtml}
            </div>
            <span class="review-count">(${product.reviewsCount})</span>
          </div>
          <div class="product-footer">
            <div class="product-price-box">
              <span class="product-price">¥${product.price.toLocaleString()}</span>
              <span class="product-unit">${product.unit}</span>
            </div>
            <button class="add-cart-btn" 
                    onclick="addToCart(${product.id})" 
                    ${!product.inStock ? 'disabled' : ''} 
                    aria-label="${product.name}をカートに追加">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  productGrid.innerHTML = html;
}

// Reset search box filters
function resetSearch() {
  const searchBarInput = document.getElementById('search-input');
  if (searchBarInput) {
    searchBarInput.value = '';
  }
  searchKeyword = '';

  // filterAndRenderProducts() が ?search= の除去まで行う
  filterAndRenderProducts();
}

// Expose to window for global header search binding
window.filterAndRenderProducts = filterAndRenderProducts;
