// App logic for index.html (Catalog Page)

// Track catalog filters
let activeCategory = 'all';
let searchKeyword = '';
let currentSort = 'default';

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

// Track async search request id to prevent race conditions
let currentSearchRequestId = 0;

// Main filter & sort calculation and DOM rendering
async function filterAndRenderProducts() {
  const productGrid = document.getElementById('product-grid');
  const noResults = document.getElementById('no-results');
  const catalogTitle = document.getElementById('catalog-title');

  if (!productGrid) return;

  // Retrieve Search Input from Header
  const searchBarInput = document.getElementById('search-input');
  if (searchBarInput) {
    searchKeyword = searchBarInput.value.trim();
  }

  // Set catalog visual title
  let titleText = 'おすすめの商品';
  if (activeCategory !== 'all') {
    const activePill = document.querySelector(`.category-pill[data-category="${activeCategory}"]`);
    titleText = activePill ? `${activePill.textContent}の一覧` : '商品一覧';
  }
  if (searchKeyword) {
    titleText = `「${searchKeyword}」の検索結果`;
  }
  if (catalogTitle) {
    catalogTitle.textContent = titleText;
  }

  const requestId = ++currentSearchRequestId;
  let filtered = null;
  let isCommerceRanked = false;

  // 1. If searchKeyword is specified and COMMERCE_SEARCH_API_URL is configured, query Retail Search
  if (searchKeyword && window.COMMERCE_SEARCH_API_URL) {
    try {
      console.log(`[AI Commerce Search] Querying Retail Search API for: "${searchKeyword}"`);
      const resp = await fetch(`${window.COMMERCE_SEARCH_API_URL}?q=${encodeURIComponent(searchKeyword)}`);
      if (requestId !== currentSearchRequestId) return; // Discard outdated search response
      if (resp.ok) {
        const data = await resp.json();
        console.log(`[AI Commerce Search] API Response:`, data);
        if (data.productIds && data.productIds.length > 0) {
          const idMap = new Map((window.products || []).map(p => [String(p.id), p]));
          const matched = data.productIds.map(id => idMap.get(String(id))).filter(Boolean);
          if (activeCategory === 'all') {
            filtered = matched;
          } else {
            filtered = matched.filter(p => p.category === activeCategory);
          }
          isCommerceRanked = true;
          if (catalogTitle) {
            catalogTitle.innerHTML = `「${searchKeyword}」の検索結果 <span style="font-size: 0.75rem; font-weight: normal; background: #E8F5E9; color: #2E7D32; padding: 3px 10px; border-radius: 12px; margin-left: 8px; vertical-align: middle;">✨ Vertex AI Search for Commerce</span>`;
          }
        }
      }
    } catch (err) {
      console.warn('[AI Commerce Search] API request failed, using local filter fallback:', err);
    }
  }

  // 2. Fallback to local keyword filter if not filtered by Commerce Search
  if (filtered === null) {
    const kw = searchKeyword.toLowerCase();
    filtered = (window.products || []).filter(product => {
      const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
      const matchesSearch = !kw || 
        product.name.toLowerCase().includes(kw) ||
        product.description.toLowerCase().includes(kw) ||
        product.origin.toLowerCase().includes(kw) ||
        product.categoryName.toLowerCase().includes(kw);

      return matchesCategory && matchesSearch;
    });
  }

  // 3. Sort products (if explicit sort selected, or if not already ranked by AI)
  if (currentSort === 'price-asc') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (currentSort === 'price-desc') {
    filtered.sort((a, b) => b.price - a.price);
  } else if (currentSort === 'rating') {
    filtered.sort((a, b) => b.rating - a.rating);
  }

  // 4. Render DOM
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
  
  // Clear search parameter from URL
  const url = new URL(window.location);
  url.searchParams.delete('search');
  window.history.pushState({}, '', url);

  filterAndRenderProducts();
}

// Expose to window for global header search binding
window.filterAndRenderProducts = filterAndRenderProducts;
