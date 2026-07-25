// Cart Management System for Harvest & Co.

// Google Cloud Vertex AI Search for Commerce (AI Commerce Search) Configuration
// Replace this with your actual Configuration ID from the Google Cloud Console.
window.VERTEX_AI_SEARCH_CONFIG_ID = "YOUR_VERTEX_AI_SEARCH_CONFIG_ID";

// Initialize Cart state
let cart = [];

// Load cart from localStorage
function loadCart() {
  const savedCart = localStorage.getItem('harvest_cart');
  if (savedCart) {
    try {
      cart = JSON.parse(savedCart);
    } catch (e) {
      console.error('Error parsing cart from localStorage:', e);
      cart = [];
    }
  } else {
    cart = [];
  }
}

// Save cart to localStorage
function saveCart() {
  localStorage.setItem('harvest_cart', JSON.stringify(cart));
  // Dispatch custom event to notify other scripts of cart updates
  window.dispatchEvent(new CustomEvent('cartUpdated'));
}

// Add item to cart
function addToCart(productId, quantity = 1) {
  loadCart();
  
  // Find product details from window.products (loaded in products.js)
  const product = window.products.find(p => p.id === productId);
  if (!product) {
    console.error('Product not found:', productId);
    return;
  }

  if (!product.inStock) {
    showToast('申し訳ありません。この商品は現在売り切れです。', 'error');
    return;
  }

  const existingItemIndex = cart.findIndex(item => item.id === productId);

  if (existingItemIndex > -1) {
    cart[existingItemIndex].quantity += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      image: product.image,
      category: product.category,
      quantity: quantity
    });
  }

  saveCart();
  showToast(`${product.name} をカートに追加しました。`);
  animateCartBadge();
  updateDrawerUI();
}

// Update quantity of an item
function updateCartQuantity(productId, quantity) {
  loadCart();
  const itemIndex = cart.findIndex(item => item.id === productId);

  if (itemIndex > -1) {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      cart[itemIndex].quantity = quantity;
      saveCart();
      updateDrawerUI();
    }
  }
}

// Remove item from cart
function removeFromCart(productId) {
  loadCart();
  const itemIndex = cart.findIndex(item => item.id === productId);

  if (itemIndex > -1) {
    const itemName = cart[itemIndex].name;
    cart.splice(itemIndex, 1);
    saveCart();
    showToast(`${itemName} をカートから削除しました。`);
    updateDrawerUI();
  }
}

// Clear all items in cart
function clearCart() {
  cart = [];
  saveCart();
  updateDrawerUI();
}

// Get total count of items in cart
function getCartCount() {
  loadCart();
  return cart.reduce((total, item) => total + item.quantity, 0);
}

// Get subtotal price
function getCartSubtotal() {
  loadCart();
  return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Remove toast after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3000);
}

// ==========================================================================
// CART BADGE ANIMATION
// ==========================================================================
function animateCartBadge() {
  const badge = document.querySelector('.cart-badge');
  if (badge) {
    badge.classList.remove('pop-animation');
    // Force reflow
    void badge.offsetWidth;
    badge.classList.add('pop-animation');
  }
}

// ==========================================================================
// DRAWER UI SYNCHRONIZATION
// ==========================================================================
function toggleDrawer(open = true) {
  const overlay = document.querySelector('.cart-drawer-overlay');
  if (overlay) {
    if (open) {
      loadCart();
      updateDrawerUI();
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden'; // Stop background scrolling
    } else {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }
}

function updateDrawerUI() {
  const drawerItems = document.querySelector('.drawer-items');
  const drawerTotalVal = document.querySelector('.drawer-total-val');
  const cartBadge = document.querySelector('.cart-badge');
  
  if (cartBadge) {
    const totalCount = getCartCount();
    cartBadge.textContent = totalCount;
    cartBadge.style.display = totalCount > 0 ? 'flex' : 'none';
  }

  if (!drawerItems) return;

  loadCart();

  if (cart.length === 0) {
    drawerItems.innerHTML = `
      <div style="text-align: center; padding: var(--space-3xl) var(--space-md);">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" stroke="var(--text-secondary)" stroke-width="1.5" viewBox="0 0 24 24" style="margin-bottom: var(--space-md);">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <p style="color: var(--text-secondary); font-family: var(--font-header);">カートは空です</p>
      </div>
    `;
    if (drawerTotalVal) drawerTotalVal.textContent = '¥0';
    return;
  }

  let html = '';
  cart.forEach(item => {
    html += `
      <div class="drawer-item" data-id="${item.id}">
        <img class="drawer-item-img" src="${item.image}" alt="${item.name}">
        <div class="drawer-item-info">
          <div class="drawer-item-name">${item.name}</div>
          <div class="drawer-item-unit">${item.unit}</div>
          <div class="drawer-item-price">¥${item.price.toLocaleString()}</div>
          <div class="drawer-item-actions">
            <div class="qty-btn-group" style="padding: 2px;">
              <button class="qty-btn" style="width: 24px; height: 24px; font-size: 0.8rem;" onclick="updateCartQuantity(${item.id}, ${item.quantity - 1})">-</button>
              <span style="padding: 0 var(--space-sm); font-weight: 700; font-size: 0.9rem;">${item.quantity}</span>
              <button class="qty-btn" style="width: 24px; height: 24px; font-size: 0.8rem;" onclick="updateCartQuantity(${item.id}, ${item.quantity + 1})">+</button>
            </div>
            <button class="remove-btn" onclick="removeFromCart(${item.id})">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  drawerItems.innerHTML = html;
  if (drawerTotalVal) {
    drawerTotalVal.textContent = `¥${getCartSubtotal().toLocaleString()}`;
  }
}

// Helper to inject Shared HTML Elements (Header, Side-Drawer, Footer)
function injectLayout(activeTab = 'home') {
  const configId = window.VERTEX_AI_SEARCH_CONFIG_ID || 'YOUR_VERTEX_AI_SEARCH_CONFIG_ID';
  const isConfigured = configId && !configId.startsWith('YOUR_');

  // Load Gen App Builder client script dynamically if Config ID is configured
  if (isConfigured) {
    if (!document.querySelector('script[src*="gen-app-builder/client"]')) {
      const script = document.createElement('script');
      script.src = "https://cloud.google.com/ai/gen-app-builder/client?hl=ja";
      document.head.appendChild(script);
    }
    
    // Inject gen-search-widget element
    if (!document.getElementById('gen-search-widget-el')) {
      const widget = document.createElement('gen-search-widget');
      widget.id = 'gen-search-widget-el';
      widget.setAttribute('configId', configId);
      widget.setAttribute('triggerId', 'search-input');
      document.body.appendChild(widget);
    }
  }

  const searchPlaceholder = isConfigured ? "AI Commerce Search で検索..." : "新鮮な食材を検索...";

  // 1. Inject Header
  const headerPlaceholder = document.getElementById('header-placeholder');
  if (headerPlaceholder) {
    headerPlaceholder.outerHTML = `
      <header class="site-header">
        <div class="container header-container">
          <a href="index.html" class="logo">
            <span class="logo-icon"></span>
            Harvest & Co.
          </a>
          
          <div class="search-bar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input type="text" id="search-input" placeholder="${searchPlaceholder}" onkeyup="handleHeaderSearch(event)">
          </div>

          <div class="header-actions">
            <nav style="display: flex; gap: var(--space-lg);">
              <a href="index.html" class="nav-link ${activeTab === 'home' ? 'active' : ''}">ホーム</a>
              <a href="cart.html" class="nav-link ${activeTab === 'cart' ? 'active' : ''}">お買い物カゴ</a>
            </nav>
            <button class="cart-trigger" onclick="toggleDrawer(true)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span class="cart-badge" style="display: none;">0</span>
            </button>
          </div>
        </div>
      </header>
    `;
  }

  // 2. Inject Cart Drawer
  const drawerPlaceholder = document.getElementById('drawer-placeholder');
  if (drawerPlaceholder) {
    drawerPlaceholder.outerHTML = `
      <div class="cart-drawer-overlay" onclick="if(event.target === this) toggleDrawer(false)">
        <div class="cart-drawer">
          <div class="drawer-header">
            <h3 class="drawer-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              現在のカート
            </h3>
            <button class="close-drawer-btn" onclick="toggleDrawer(false)">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="drawer-items">
            <!-- Items injected here -->
          </div>
          <div class="drawer-footer">
            <div class="drawer-total">
              <span>小計:</span>
              <span class="drawer-total-val">¥0</span>
            </div>
            <div class="drawer-actions">
              <a href="cart.html" class="view-cart-btn">カゴを表示</a>
              <button class="drawer-checkout-btn" onclick="handleCheckout()">レジに進む</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 3. Inject Footer
  const footerPlaceholder = document.getElementById('footer-placeholder');
  if (footerPlaceholder) {
    footerPlaceholder.outerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-brand">
              <div class="logo">
                <span class="logo-icon"></span>
                Harvest & Co.
              </div>
              <p class="footer-desc">自然の恵みを食卓へ。私たちは、厳選されたオーガニック野菜、新鮮な海の幸、こだわりの極上地肉をお届けするスーパーマーケットです。</p>
            </div>
            <div>
              <h4 class="footer-heading">お買い物</h4>
              <ul class="footer-links">
                <li><a href="index.html">すべて見る</a></li>
                <li><a href="index.html?category=vegetables">新鮮野菜</a></li>
                <li><a href="index.html?category=fruits">特選果物</a></li>
                <li><a href="index.html?category=meat">上質精肉</a></li>
              </ul>
            </div>
            <div>
              <h4 class="footer-heading">サービス情報</h4>
              <ul class="footer-links">
                <li><a href="#">Harvest & Co. について</a></li>
                <li><a href="#">店舗一覧</a></li>
                <li><a href="#">よくある質問 (FAQ)</a></li>
                <li><a href="#">お問い合わせ</a></li>
              </ul>
            </div>
            <div>
              <h4 class="footer-heading">規約・ポリシー</h4>
              <ul class="footer-links">
                <li><a href="#">ご利用規約</a></li>
                <li><a href="#">プライバシーポリシー</a></li>
                <li><a href="#">特定商取引法に基づく表記</a></li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <p>&copy; 2026 Harvest & Co. All rights reserved.</p>
            <p>DESIGNED FOR THE ULTIMATE FRESHNESS</p>
          </div>
        </div>
      </footer>
    `;
  }

  // Bind scrolled event to header for visual elevation
  window.addEventListener('scroll', () => {
    const header = document.querySelector('.site-header');
    if (header) {
      if (window.scrollY > 10) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }
  });

  // Load and update state
  loadCart();
  updateDrawerUI();
}

// Handle header search (redirects to home and triggers filtering if on another page)
function handleHeaderSearch(event) {
  const configId = window.VERTEX_AI_SEARCH_CONFIG_ID || 'YOUR_VERTEX_AI_SEARCH_CONFIG_ID';
  const isConfigured = configId && !configId.startsWith('YOUR_');
  if (isConfigured) {
    return; // Let Vertex AI Search widget handle the search
  }

  if (event.key === 'Enter') {
    const query = event.target.value.trim();
    if (window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/AgenticCommerceScalePlay/')) {
      // We are on index.html, trigger filter directly
      if (typeof window.filterAndRenderProducts === 'function') {
        window.filterAndRenderProducts();
      }
    } else {
      // Redirect to index.html with query parameter
      window.location.href = `index.html?search=${encodeURIComponent(query)}`;
    }
  }
}

// Simulation of checkout
function handleCheckout() {
  loadCart();
  if (cart.length === 0) {
    showToast('カートが空です。商品を追加してください。', 'error');
    return;
  }
  toggleDrawer(false);
  
  // Show a beautiful loading/processing checkout toast, then clear cart
  showToast('レジを処理中しています...', 'info');
  
  setTimeout(() => {
    showToast('ご注文ありがとうございます！ご注文の受付が完了いたしました。', 'success');
    clearCart();
    
    // If we are on cart.html, reload the page UI
    if (typeof window.renderCartPage === 'function') {
      window.renderCartPage();
    }
  }, 1500);
}

// Handle cart updates from custom events (when quantity changes on cart page, reflect in drawer/badge)
window.addEventListener('cartUpdated', () => {
  updateDrawerUI();
});

// Expose variables globally
window.loadCart = loadCart;
window.addToCart = addToCart;
window.updateCartQuantity = updateCartQuantity;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.getCartCount = getCartCount;
window.getCartSubtotal = getCartSubtotal;
window.showToast = showToast;
window.toggleDrawer = toggleDrawer;
window.updateDrawerUI = updateDrawerUI;
window.injectLayout = injectLayout;
window.handleCheckout = handleCheckout;
