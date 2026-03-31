// ===== Shopping Cart =====
const Cart = {
  KEY: 'cw_cart',

  getItems() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || [];
    } catch (e) {
      return [];
    }
  },

  saveItems(items) {
    localStorage.setItem(this.KEY, JSON.stringify(items));
    this.updateBadge();
  },

  addItem(product) {
    const items = this.getItems();
    const existing = items.find(i => i.id === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({ id: product.id, name: product.name, price: parseInt(product.price) || 0, image: product.image, qty: 1 });
    }
    this.saveItems(items);
  },

  updateQty(id, delta) {
    const items = this.getItems();
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      this.saveItems(items.filter(i => i.id !== id));
    } else {
      this.saveItems(items);
    }
  },

  removeItem(id) {
    this.saveItems(this.getItems().filter(i => i.id !== id));
  },

  clear() {
    this.saveItems([]);
  },

  getTotalItems() {
    return this.getItems().reduce((sum, i) => sum + i.qty, 0);
  },

  getTotalPrice() {
    return this.getItems().reduce((sum, i) => sum + (i.price * i.qty), 0);
  },

  updateBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    const count = this.getTotalItems();
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  },

  generateLineMessage() {
    const items = this.getItems();
    if (items.length === 0) return '';
    let msg = 'สั่งซื้อจาก coachwanchai.netlify.app\n';
    items.forEach((item, i) => {
      msg += (i + 1) + '. ' + item.name + ' x' + item.qty + '\n';
    });
    msg += 'รวม: ' + this.getTotalItems() + ' ชิ้น';
    const total = this.getTotalPrice();
    if (total > 0) {
      msg += ' (' + total.toLocaleString() + ' บาท)';
    }
    return msg;
  },

  openLineCheckout() {
    const msg = this.generateLineMessage();
    if (!msg) return;
    const encoded = encodeURIComponent(msg);
    window.open('https://line.me/R/oaMessage/@coachwanchai/?' + encoded, '_blank');
  },

  renderCartPage() {
    const container = document.getElementById('cartPageContent');
    if (!container) return;

    const items = this.getItems();

    if (items.length === 0) {
      container.innerHTML = '<div class="cart-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
        '<p>ตะกร้าสินค้าว่างเปล่า</p>' +
        '<a href="/products/" class="btn btn-primary">ดูสินค้าทั้งหมด</a>' +
        '</div>';
      return;
    }

    let html = '';
    items.forEach(item => {
      html += '<div class="cart-item" data-id="' + item.id + '">';
      if (item.image) {
        html += '<div class="cart-item-image"><img src="' + item.image + '" alt="' + item.name + '"></div>';
      }
      html += '<div class="cart-item-info">' +
        '<div class="cart-item-name">' + item.name + '</div>';
      if (item.price > 0) {
        html += '<div class="cart-item-price">' + item.price.toLocaleString() + ' บาท</div>';
      }
      html += '</div>' +
        '<div class="cart-item-qty">' +
        '<button class="cart-qty-minus" data-id="' + item.id + '">-</button>' +
        '<span>' + item.qty + '</span>' +
        '<button class="cart-qty-plus" data-id="' + item.id + '">+</button>' +
        '</div>' +
        '<button class="cart-item-remove" data-id="' + item.id + '" title="ลบ">&times;</button>' +
        '</div>';
    });

    // Summary
    html += '<div class="cart-summary">';
    html += '<div class="cart-summary-row"><span>จำนวนสินค้า</span><span>' + this.getTotalItems() + ' ชิ้น</span></div>';
    const total = this.getTotalPrice();
    if (total > 0) {
      html += '<div class="cart-summary-row total"><span>รวมทั้งหมด</span><span class="cart-total-price">' + total.toLocaleString() + ' บาท</span></div>';
    }
    html += '</div>';

    // Actions
    html += '<div class="cart-actions">' +
      '<button class="btn btn-clear" id="cartClear">ล้างตะกร้า</button>' +
      '<button class="btn btn-line" id="cartCheckout">สั่งซื้อผ่าน Line</button>' +
      '</div>';

    container.innerHTML = html;

    // Event listeners
    container.querySelectorAll('.cart-qty-minus').forEach(btn => {
      btn.addEventListener('click', () => { Cart.updateQty(btn.dataset.id, -1); Cart.renderCartPage(); });
    });
    container.querySelectorAll('.cart-qty-plus').forEach(btn => {
      btn.addEventListener('click', () => { Cart.updateQty(btn.dataset.id, 1); Cart.renderCartPage(); });
    });
    container.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', () => { Cart.removeItem(btn.dataset.id); Cart.renderCartPage(); });
    });
    const clearBtn = document.getElementById('cartClear');
    if (clearBtn) clearBtn.addEventListener('click', () => { Cart.clear(); Cart.renderCartPage(); });
    const checkoutBtn = document.getElementById('cartCheckout');
    if (checkoutBtn) checkoutBtn.addEventListener('click', () => { Cart.openLineCheckout(); });
  }
};

// Initialize badge on page load
document.addEventListener('DOMContentLoaded', () => {
  Cart.updateBadge();

  // Add to Cart buttons
  document.querySelectorAll('.btn-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      Cart.addItem({
        id: btn.dataset.productId,
        name: btn.dataset.productName,
        price: btn.dataset.productPrice,
        image: btn.dataset.productImage
      });
      btn.textContent = 'เพิ่มแล้ว!';
      btn.classList.add('added');
      setTimeout(() => {
        btn.textContent = 'เพิ่มลงตะกร้า';
        btn.classList.remove('added');
      }, 1500);
    });
  });

  // Render cart page if present
  Cart.renderCartPage();
});

// Mobile menu toggle
const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');

if (menuToggle && mainNav) {
  menuToggle.addEventListener('click', () => {
    mainNav.classList.toggle('open');
  });

  // Close menu when clicking a link
  mainNav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('open');
    });
  });
}
