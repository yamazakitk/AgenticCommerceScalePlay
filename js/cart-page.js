// Shopping Cart Page Controller

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inject shared layouts (header, cart drawer, footer)
  if (typeof window.injectLayout === 'function') {
    window.injectLayout('cart');
  }

  // 2. Render cart page contents
  renderCartPage();

  // 3. Bind to cart updates to refresh page content when drawer modifies it
  window.addEventListener('cartUpdated', () => {
    renderCartPage();
  });
});

// Render the cart items list and order totals summary
function renderCartPage() {
  const container = document.getElementById('cart-content-wrapper');
  if (!container) return;

  // Retrieve current cart state
  window.loadCart();
  const cartItems = window.cart || [];

  // 1. Empty Cart UI Render
  if (cartItems.length === 0) {
    container.innerHTML = `
      <div class="empty-cart-message">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <h2 class="empty-cart-title">お買い物カゴは空です</h2>
        <p class="empty-cart-desc">カートに商品が入っていません。美味しい食材を見つけに行きましょう！</p>
        <a href="index.html" class="return-shop-btn">
          買い物に戻る
        </a>
      </div>
    `;
    return;
  }

  // 2. Build list of items HTML
  let itemsHtml = '';
  cartItems.forEach(item => {
    itemsHtml += `
      <div class="cart-item-row" data-id="${item.id}">
        <a href="product.html?id=${item.id}">
          <img class="cart-item-img" src="${item.image}" alt="${item.name}">
        </a>
        <div class="cart-item-details">
          <a href="product.html?id=${item.id}">
            <h3 class="cart-item-name">${item.name}</h3>
          </a>
          <span class="cart-item-unit">${item.unit}</span>
          <div class="cart-item-price">¥${item.price.toLocaleString()}</div>
        </div>
        <div class="cart-item-action">
          <!-- Quantity Stepper -->
          <div class="qty-btn-group">
            <button class="qty-btn" onclick="updateItemQuantity(${item.id}, ${item.quantity - 1})">-</button>
            <input type="text" class="qty-input" value="${item.quantity}" readonly>
            <button class="qty-btn" onclick="updateItemQuantity(${item.id}, ${item.quantity + 1})">+</button>
          </div>
          <!-- Remove button -->
          <button class="remove-btn" onclick="removeItem(${item.id})" aria-label="商品を削除">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    `;
  });

  // Calculate order metrics
  const subtotal = window.getCartSubtotal();
  // Food Tax is 8% in Japan (reduced tax rate)
  const tax = Math.floor(subtotal * 0.08);
  // Free shipping over ¥5,000, otherwise ¥550
  const shipping = subtotal >= 5000 ? 0 : 550;
  const total = subtotal + shipping; // Price in JP is usually displayed inclusive of tax or separate, let's treat subtotal/item prices as tax-included, and show the breakdown tax amount. Or let's make total = subtotal + shipping.

  // 3. Render complete cart layout
  container.innerHTML = `
    <h1 class="cart-title">ショッピングカート (${cartItems.length} 点)</h1>
    
    <div class="cart-layout">
      <!-- Left side items panel -->
      <div class="cart-items-panel">
        ${itemsHtml}
      </div>

      <!-- Right side order summary -->
      <div class="summary-panel">
        <h2 class="summary-title">注文内容</h2>
        
        <div class="summary-row">
          <span>商品小計 (税込)</span>
          <span>¥${subtotal.toLocaleString()}</span>
        </div>
        
        <div class="summary-row">
          <span>消費税 (8% 内税分)</span>
          <span>¥${tax.toLocaleString()}</span>
        </div>

        <div class="summary-row" style="border-bottom: 1px solid var(--border-color); padding-bottom: var(--space-md);">
          <span>送料</span>
          <span>${shipping === 0 ? '<span style="color: var(--success); font-weight: 600;">無料</span>' : `¥${shipping.toLocaleString()}`}</span>
        </div>

        <div class="summary-row total">
          <span>合計金額</span>
          <span class="total-price">¥${total.toLocaleString()}</span>
        </div>

        ${shipping > 0 ? `
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: var(--space-sm); text-align: center;">
            あと <strong>¥${(5000 - subtotal).toLocaleString()}</strong> のご注文で送料無料になります。
          </p>
        ` : `
          <p style="font-size: 0.8rem; color: var(--success); font-weight: 600; margin-top: var(--space-sm); text-align: center;">
            送料無料が適用されています！
          </p>
        `}

        <button class="checkout-btn" onclick="window.handleCheckout()">
          レジに進む
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>

        <a href="index.html" style="display: block; text-align: center; margin-top: var(--space-lg); font-size: 0.9rem; font-weight: 500; color: var(--text-secondary); text-decoration: underline;">
          買い物を続ける
        </a>
      </div>
    </div>
  `;
}

// Wrapper function to update item quantities
function updateItemQuantity(productId, quantity) {
  if (typeof window.updateCartQuantity === 'function') {
    window.updateCartQuantity(productId, quantity);
    renderCartPage();
  }
}

// Wrapper function to remove item
function removeItem(productId) {
  if (typeof window.removeFromCart === 'function') {
    window.removeFromCart(productId);
    renderCartPage();
  }
}

// Expose renderCartPage globally
window.renderCartPage = renderCartPage;
