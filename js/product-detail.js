// Product Detail Page Logic

let currentProduct = null;
let currentQuantity = 1;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inject shared layouts (header, cart drawer, footer)
  if (typeof window.injectLayout === 'function') {
    window.injectLayout('home');
  }

  // Wait until the product catalog is loaded (Firestore or local fallback)
  if (window.productsReady) {
    await window.productsReady;
  }

  // 2. Parse product ID from query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const productId = parseInt(urlParams.get('id'), 10);

  if (!productId || isNaN(productId)) {
    renderError('商品IDが無効です。');
    return;
  }

  // Find product details
  currentProduct = window.products.find(p => p.id === productId);

  if (!currentProduct) {
    renderError('指定された商品が見つかりませんでした。');
    return;
  }

  // 3. Document Title Update
  document.title = `${currentProduct.name} | Harvest & Co.`;

  // 4. Render product information
  renderProductDetails();

  // 5. Render related items
  renderRelatedProducts();
});

// Render Error Screen if product is not found
function renderError(message) {
  const container = document.getElementById('product-detail-container');
  if (container) {
    container.innerHTML = `
      <div class="empty-cart-message">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" stroke="var(--text-secondary)" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <h3 class="empty-cart-title">${message}</h3>
        <p class="empty-cart-desc">恐れ入りますが、他の商品をお探しください。</p>
        <a href="index.html" class="return-shop-btn">ホームに戻る</a>
      </div>
    `;
  }
  
  // Hide related section
  const relatedSection = document.querySelector('.related-section');
  if (relatedSection) relatedSection.style.display = 'none';
}

// Render dynamic product details DOM
function renderProductDetails() {
  const container = document.getElementById('product-detail-container');
  if (!container) return;

  // Build rating stars
  let starsHtml = '';
  const fullStars = Math.floor(currentProduct.rating);
  const hasHalfStar = currentProduct.rating % 1 !== 0;

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
            <linearGradient id="detail-half-star">
              <stop offset="50%" stop-color="var(--accent-color)"/>
              <stop offset="50%" stop-color="#EAEAE3"/>
            </linearGradient>
          </defs>
          <path fill="url(#detail-half-star)" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
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

  // Nutrition Facts Panel HTML
  let nutritionHtml = '';
  if (currentProduct.nutrition) {
    nutritionHtml = `
      <div class="nutrition-card">
        <h3 class="nutrition-title">栄養成分表示</h3>
        <div class="nutrition-grid">
          <div class="nutrition-item">
            <div class="nutrition-val">${currentProduct.nutrition.calories}</div>
            <div class="nutrition-label">エネルギー</div>
          </div>
          <div class="nutrition-item">
            <div class="nutrition-val">${currentProduct.nutrition.protein}</div>
            <div class="nutrition-label">たんぱく質</div>
          </div>
          <div class="nutrition-item">
            <div class="nutrition-val">${currentProduct.nutrition.fat}</div>
            <div class="nutrition-label">脂質</div>
          </div>
          <div class="nutrition-item">
            <div class="nutrition-val">${currentProduct.nutrition.carbs}</div>
            <div class="nutrition-label">炭水化物</div>
          </div>
        </div>
      </div>
    `;
  }

  const inStock = currentProduct.inStock;

  container.innerHTML = `
    <div class="detail-layout">
      <!-- Left side image -->
      <div class="detail-img-box">
        <img src="${currentProduct.image}" alt="${currentProduct.name}">
      </div>

      <!-- Right side details -->
      <div class="detail-info">
        <span class="detail-origin">${currentProduct.origin}</span>
        <h1 class="detail-title">${currentProduct.name}</h1>
        
        <div class="detail-meta-row">
          <div class="product-rating" style="margin-bottom: 0;">
            <div style="display: flex; gap: 2px;">
              ${starsHtml}
            </div>
            <span class="review-count">(${currentProduct.reviewsCount} 件のカスタマーレビュー)</span>
          </div>
          <span style="font-weight: 500; font-size: 0.9rem; color: ${inStock ? 'var(--success)' : 'var(--error)'}">
            ${inStock ? '● 在庫あり' : '● 売り切れ'}
          </span>
        </div>

        <div class="detail-price-box">
          <span class="detail-price">¥${currentProduct.price.toLocaleString()}</span>
          <span class="detail-unit">/ ${currentProduct.unit}</span>
        </div>

        <p class="detail-desc">${currentProduct.description}</p>

        <!-- Cart controls -->
        <div class="purchase-actions">
          <div class="qty-btn-group">
            <button class="qty-btn" onclick="adjustQty(-1)" ${!inStock ? 'disabled' : ''}>-</button>
            <input type="text" id="detail-qty" class="qty-input" value="1" readonly>
            <button class="qty-btn" onclick="adjustQty(1)" ${!inStock ? 'disabled' : ''}>+</button>
          </div>

          <button class="detail-add-btn" 
                  onclick="triggerAddToCart()" 
                  ${!inStock ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            ${inStock ? 'カートに追加する' : '売り切れ'}
          </button>
        </div>

        <!-- Nutrition Facts -->
        ${nutritionHtml}
      </div>
    </div>
  `;
}

// Adjust quantity stepper
function adjustQty(amount) {
  const qtyInput = document.getElementById('detail-qty');
  if (qtyInput) {
    let newQty = currentQuantity + amount;
    if (newQty < 1) newQty = 1;
    currentQuantity = newQty;
    qtyInput.value = currentQuantity;
  }
}

// Trigger Cart Add action
function triggerAddToCart() {
  if (currentProduct && typeof window.addToCart === 'function') {
    window.addToCart(currentProduct.id, currentQuantity);
    
    // Reset quantity back to 1
    currentQuantity = 1;
    const qtyInput = document.getElementById('detail-qty');
    if (qtyInput) qtyInput.value = 1;
  }
}

// Render 4 related items from same category
function renderRelatedProducts() {
  const grid = document.getElementById('related-grid');
  if (!grid || !currentProduct) return;

  // Filter products by same category excluding active product
  const related = window.products
    .filter(p => p.category === currentProduct.category && p.id !== currentProduct.id)
    .slice(0, 4); // Limit to max 4

  if (related.length === 0) {
    // If no related products in same category, show random items
    const fallback = window.products
      .filter(p => p.id !== currentProduct.id)
      .slice(0, 4);
    renderCards(fallback, grid);
  } else {
    renderCards(related, grid);
  }
}

// Draw list cards helper
function renderCards(list, gridEl) {
  let html = '';
  list.forEach(product => {
    let starsHtml = '';
    const fullStars = Math.floor(product.rating);
    for (let i = 0; i < 5; i++) {
      starsHtml += `
        <svg class="star-icon" style="fill: ${i < fullStars ? 'var(--accent-color)' : '#EAEAE3'};" viewBox="0 0 24 24">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
        </svg>
      `;
    }

    const soldoutOverlay = !product.inStock ? '<div class="badge-soldout">売り切れ</div>' : '';

    html += `
      <div class="product-card">
        <a href="product.html?id=${product.id}">
          <div class="product-img-wrapper">
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
                    ${!product.inStock ? 'disabled' : ''}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  gridEl.innerHTML = html;
}
