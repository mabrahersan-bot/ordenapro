const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const coverageKm = 10;

const defaultState = {
  menu: [
    {
      id: "taco-box",
      name: "Caja de tacos",
      description: "Orden familiar con salsas y guarniciones.",
      price: 189,
      short: "TC",
      photo: "",
      available: true,
      extras: [
        { id: "taco-cheese", name: "Queso extra", price: 25 },
        { id: "taco-salsa", name: "Salsa especial", price: 10 },
      ],
    },
    {
      id: "burger",
      name: "Hamburguesa premium",
      description: "Carne, queso, vegetales frescos y papas.",
      price: 145,
      short: "HB",
      photo: "",
      available: true,
      extras: [
        { id: "burger-bacon", name: "Tocino", price: 22 },
        { id: "burger-fries", name: "Papas grandes", price: 18 },
      ],
    },
    {
      id: "bowl",
      name: "Bowl ejecutivo",
      description: "Proteina, arroz, vegetales y aderezo.",
      price: 132,
      short: "BW",
      photo: "",
      available: true,
      extras: [
        { id: "bowl-protein", name: "Proteina extra", price: 30 },
        { id: "bowl-avocado", name: "Aguacate", price: 20 },
      ],
    },
    {
      id: "pizza",
      name: "Pizza artesanal",
      description: "Masa delgada, queso y topping especial.",
      price: 218,
      short: "PZ",
      photo: "",
      available: true,
      extras: [
        { id: "pizza-cheese", name: "Extra queso", price: 28 },
        { id: "pizza-dip", name: "Aderezo", price: 12 },
      ],
    },
    {
      id: "coffee",
      name: "Cafe y pan",
      description: "Combo para desayuno o merienda.",
      price: 89,
      short: "CF",
      photo: "",
      available: true,
      extras: [
        { id: "coffee-shot", name: "Shot extra", price: 15 },
        { id: "coffee-milk", name: "Leche deslactosada", price: 8 },
      ],
    },
    {
      id: "salad",
      name: "Ensalada fresca",
      description: "Hojas, semillas, fruta y vinagreta.",
      price: 118,
      short: "EN",
      photo: "",
      available: true,
      extras: [
        { id: "salad-chicken", name: "Pollo", price: 28 },
        { id: "salad-seeds", name: "Semillas", price: 12 },
      ],
    },
  ],
  orders: [
    {
      id: 1001,
      customer: "Mariana Lopez",
      address: "Calle Norte 44",
      items: [
        { name: "Pizza artesanal", qty: 1, price: 218 },
        { name: "Cafe y pan", qty: 2, price: 89 },
      ],
      total: 396,
      status: "preparing",
      courier: "",
      distanceKm: 6.2,
      gpsProgress: 0,
      createdAt: "20:10",
    },
    {
      id: 1002,
      customer: "Carlos Ruiz",
      address: "Mesa 8",
      items: [{ name: "Bowl ejecutivo", qty: 2, price: 132 }],
      total: 264,
      status: "ready",
      courier: "",
      distanceKm: 3.8,
      gpsProgress: 0,
      createdAt: "20:18",
    },
  ],
  cart: [],
  nextOrderId: 1003,
};

const statusLabels = {
  pending: "Nuevo",
  preparing: "Preparando",
  ready: "Listo",
  assigned: "En camino",
  delivered: "Entregado",
};

const statusClasses = {
  pending: "pending",
  preparing: "preparing",
  ready: "ready",
  assigned: "preparing",
  delivered: "delivered",
};

let state = loadState();

function loadState() {
  const saved = localStorage.getItem("ordenapro-demo");
  const loaded = saved ? JSON.parse(saved) : structuredClone(defaultState);
  loaded.menu = loaded.menu.map((item) => ({
    photo: "",
    available: true,
    extras: [],
    ...item,
  }));
  loaded.orders = loaded.orders.map((order, index) => ({
    distanceKm: index % 2 ? 3.8 : 6.2,
    gpsProgress: order.status === "delivered" ? 100 : 0,
    ...order,
  }));
  loaded.cart = Array.isArray(loaded.cart)
    ? loaded.cart
    : Object.entries(loaded.cart || {}).map(([productId, qty]) => ({
        productId,
        qty,
        extras: [],
      }));
  return loaded;
}

function saveState() {
  localStorage.setItem("ordenapro-demo", JSON.stringify(state));
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function productShort(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatItems(items) {
  return items
    .map((item) => {
      const extras = item.extras?.length ? ` (${item.extras.map((extra) => extra.name).join(", ")})` : "";
      return `${item.qty} x ${item.name}${extras}`;
    })
    .join(", ");
}

function cartEntries() {
  return state.cart
    .map((line) => {
      const product = state.menu.find((item) => item.id === line.productId);
      if (!product) return null;
      const extras = line.extras || [];
      const extrasTotal = extras.reduce((sum, extra) => sum + extra.price, 0);
      return {
        ...product,
        qty: line.qty,
        selectedExtras: extras,
        linePrice: product.price + extrasTotal,
      };
    })
    .filter(Boolean);
}

function cartTotal() {
  return cartEntries().reduce((sum, item) => sum + item.linePrice * item.qty, 0);
}

function orderTotal(order) {
  return order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function activeTrackedOrder() {
  return (
    state.orders.find((order) => ["assigned", "ready", "preparing", "pending"].includes(order.status)) ||
    state.orders[0]
  );
}

function gpsPosition(order) {
  const distanceRatio = Math.min(order.distanceKm / coverageKm, 1);
  const progress = Math.min(order.gpsProgress || 0, 100) / 100;
  const homeX = 50 + 36 * distanceRatio;
  const homeY = 24 + 45 * distanceRatio;
  return {
    homeX,
    homeY,
    courierX: 50 + (homeX - 50) * progress,
    courierY: 50 + (homeY - 50) * progress,
  };
}

function placePin(id, x, y) {
  const pin = document.getElementById(id);
  if (!pin) return;
  pin.style.left = `${x}%`;
  pin.style.top = `${y}%`;
}

function remainingKm(order) {
  const remainingRatio = 1 - Math.min(order.gpsProgress || 0, 100) / 100;
  return Math.max(order.distanceKm * remainingRatio, 0);
}

function etaMinutes(order) {
  if (order.status === "delivered") return 0;
  if (!["assigned", "ready"].includes(order.status)) return Math.ceil(order.distanceKm * 4 + 12);
  return Math.max(Math.ceil(remainingKm(order) * 4), 2);
}

function renderMenu() {
  const grid = document.getElementById("menuGrid");
  const availableProducts = state.menu.filter((item) => item.available);
  grid.innerHTML = availableProducts.length
    ? availableProducts
    .map(
      (item) => `
        <article class="product-card">
          ${
            item.photo
              ? `<img class="product-photo" src="${item.photo}" alt="${escapeHtml(item.name)}" />`
              : `<div class="product-art">${escapeHtml(item.short || productShort(item.name))}</div>`
          }
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.description)}</p>
          </div>
          ${
            item.extras?.length
              ? `<div class="extras-picker">
                  ${item.extras
                    .map(
                      (extra) => `
                        <label>
                          <input type="checkbox" data-extra-for="${item.id}" value="${extra.id}" />
                          ${escapeHtml(extra.name)} +${money.format(extra.price)}
                        </label>
                      `,
                    )
                    .join("")}
                </div>`
              : `<span class="meta">Sin extras configurados</span>`
          }
          <footer>
            <strong>${money.format(item.price)}</strong>
            <button class="mini-button" type="button" data-add="${item.id}">Agregar</button>
          </footer>
        </article>
      `,
    )
    .join("")
    : `<div class="empty-state">El negocio aun no tiene productos disponibles.</div>`;
}

function renderCart() {
  const entries = cartEntries();
  const count = entries.reduce((sum, item) => sum + item.qty, 0);
  setText("cartCount", `${count} producto${count === 1 ? "" : "s"}`);
  setText("cartTotal", money.format(cartTotal()));

  const holder = document.getElementById("cartItems");
  if (!entries.length) {
    holder.className = "cart-items empty-state";
    holder.textContent = "Agrega productos para iniciar.";
    return;
  }

  holder.className = "cart-items";
  holder.innerHTML = entries
    .map(
      (item) => `
        <div class="cart-row">
          <span>
            ${item.qty} x ${escapeHtml(item.name)}
            ${
              item.selectedExtras.length
                ? `<small>${item.selectedExtras.map((extra) => escapeHtml(extra.name)).join(", ")}</small>`
                : ""
            }
          </span>
          <strong>${money.format(item.linePrice * item.qty)}</strong>
        </div>
      `,
    )
    .join("");
}

function orderCard(order, role) {
  const badgeClass = statusClasses[order.status] || "";
  const action =
    role === "merchant"
      ? merchantAction(order)
      : role === "courier"
        ? courierAction(order)
        : "";

  return `
    <article class="order-card">
      <header>
        <div>
          <h4>#${order.id} - ${order.customer}</h4>
          <div class="meta">${order.address} · ${order.distanceKm} km · ${formatItems(order.items)}</div>
        </div>
        <span class="badge ${badgeClass}">${statusLabels[order.status]}</span>
      </header>
      <footer>
        <strong>${money.format(order.total)}</strong>
        ${action}
      </footer>
    </article>
  `;
}

function merchantAction(order) {
  if (order.status === "pending") {
    return `<button class="mini-button" type="button" data-status="${order.id}:preparing">Aceptar</button>`;
  }
  if (order.status === "preparing") {
    return `<button class="mini-button" type="button" data-status="${order.id}:ready">Marcar listo</button>`;
  }
  if (order.status === "ready") {
    return `<span class="meta">Esperando repartidor</span>`;
  }
  return `<span class="meta">${order.courier || "Operacion cerrada"}</span>`;
}

function courierAction(order) {
  if (order.status === "ready") {
    return `<button class="mini-button" type="button" data-take="${order.id}">Tomar entrega</button>`;
  }
  if (order.status === "assigned") {
    return `
      <button class="mini-button" type="button" data-progress="${order.id}">Avanzar GPS</button>
      <button class="mini-button" type="button" data-deliver="${order.id}">Entregar</button>
    `;
  }
  return `<span class="meta">${order.courier || "Sin asignar"}</span>`;
}

function renderMerchant() {
  const merchantOrders = document.getElementById("merchantOrders");
  merchantOrders.innerHTML = state.orders.length
    ? state.orders.map((order) => orderCard(order, "merchant")).join("")
    : `<div class="empty-state">Aun no hay pedidos.</div>`;

  document.getElementById("merchantMenu").innerHTML = state.menu
    .map(
      (item) => `
      <div class="menu-row product-row">
        ${
          item.photo
            ? `<img class="menu-thumb" src="${item.photo}" alt="${escapeHtml(item.name)}" />`
            : `<span class="menu-thumb fallback">${escapeHtml(item.short || productShort(item.name))}</span>`
        }
        <span>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.description)}</small>
          <small>${item.extras?.length ? `${item.extras.length} extras` : "sin extras"} · ${
            item.available ? "disponible" : "oculto"
          }</small>
        </span>
        <div class="row-actions">
          <strong>${money.format(item.price)}</strong>
          <button class="mini-button" type="button" data-toggle-product="${item.id}">${
            item.available ? "Ocultar" : "Mostrar"
          }</button>
          <button class="mini-button danger" type="button" data-delete-product="${item.id}">Eliminar</button>
        </div>
      </div>
    `,
    )
    .join("");
}

function renderCourier() {
  const orders = state.orders.filter((order) => ["ready", "assigned", "delivered"].includes(order.status));
  document.getElementById("courierOrders").innerHTML = orders.length
    ? orders.map((order) => orderCard(order, "courier")).join("")
    : `<div class="empty-state">No hay entregas listas.</div>`;

  const taken = state.orders.filter((order) => order.courier).length;
  const delivered = state.orders.filter((order) => order.status === "delivered").length;
  const assigned = state.orders.find((order) => order.status === "assigned") || activeTrackedOrder();
  setText("courierTaken", taken);
  setText("courierDelivered", delivered);
  setText("courierEarnings", money.format(delivered * 32));
  setText("courierDistance", `${remainingKm(assigned).toFixed(1)} km`);
  renderMapPins(assigned, "courier");
}

function renderAdmin() {
  const revenue = state.orders.reduce((sum, order) => sum + order.total, 0);
  const average = state.orders.length ? revenue / state.orders.length : 0;
  const pending = state.orders.filter((order) => order.status !== "delivered").length;

  setText("adminRevenue", money.format(revenue));
  setText("adminOrders", state.orders.length);
  setText("adminAverage", money.format(average));
  setText("adminPending", pending);
  setText("metricRevenue", money.format(revenue));
  setText("metricActive", pending);
  setText("metricCouriers", Math.max(1, state.orders.filter((order) => order.courier).length));
  setText("liveOrdersCount", `${state.orders.length} pedidos`);

  document.getElementById("adminTimeline").innerHTML = state.orders
    .slice()
    .reverse()
    .map(
      (order) => `
        <div class="timeline-row">
          <div>
            <strong>#${order.id} ${statusLabels[order.status]}</strong>
            <small>${order.createdAt} · ${order.customer} · ${order.distanceKm} km · ${order.courier || "sin repartidor"}</small>
          </div>
          <strong>${money.format(order.total)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderBuyerTracking() {
  const order = activeTrackedOrder();
  if (!order) return;

  renderMapPins(order, "buyer");
  const trackingStatus = document.getElementById("buyerTrackingStatus");
  const trackingCopy = document.getElementById("buyerTrackingCopy");
  const eta = etaMinutes(order);
  trackingStatus.textContent =
    order.status === "delivered" ? "Entregado" : `${statusLabels[order.status]} · ${eta} min`;
  trackingCopy.innerHTML = `
    <strong>Pedido #${order.id}: ${statusLabels[order.status]}</strong>
    <span>${order.address} esta a ${order.distanceKm} km. Restan ${remainingKm(order).toFixed(1)} km.</span>
    <span>${order.courier ? `Repartidor: ${order.courier}` : "Aun sin repartidor asignado."}</span>
  `;
}

function renderMapPins(order, scope) {
  const position = gpsPosition(order);
  if (scope === "buyer") {
    placePin("buyerHomePin", position.homeX, position.homeY);
    placePin("buyerCourierPin", position.courierX, position.courierY);
    return;
  }
  placePin("courierHomePin", position.homeX, position.homeY);
  placePin("courierPin", position.courierX, position.courierY);
}

function renderAll() {
  renderMenu();
  renderCart();
  renderMerchant();
  renderCourier();
  renderAdmin();
  renderBuyerTracking();
  saveState();
}

function addToCart(productId) {
  const product = state.menu.find((item) => item.id === productId);
  if (!product) return;
  const selectedExtraIds = Array.from(document.querySelectorAll(`[data-extra-for="${productId}"]:checked`)).map(
    (input) => input.value,
  );
  const extras = (product.extras || []).filter((extra) => selectedExtraIds.includes(extra.id));
  const extrasKey = extras.map((extra) => extra.id).sort().join("|");
  const existing = state.cart.find(
    (line) => line.productId === productId && (line.extras || []).map((extra) => extra.id).sort().join("|") === extrasKey,
  );
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ productId, qty: 1, extras });
  }
  document.querySelectorAll(`[data-extra-for="${productId}"]:checked`).forEach((input) => {
    input.checked = false;
  });
  renderAll();
}

function placeOrder() {
  const entries = cartEntries();
  if (!entries.length) return;
  const distanceKm = Number(document.getElementById("customerDistance").value);
  if (distanceKm > coverageKm) return;

  const now = new Date();
  state.orders.unshift({
    id: state.nextOrderId++,
    customer: document.getElementById("customerName").value || "Cliente",
    address: document.getElementById("customerAddress").value || "Sin direccion",
    items: entries.map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.linePrice,
      extras: item.selectedExtras,
    })),
    total: cartTotal(),
    status: "pending",
    courier: "",
    distanceKm,
    gpsProgress: 0,
    createdAt: now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  });
  state.cart = [];
  switchView("merchant");
  renderAll();
}

function updateOrderStatus(orderId, status) {
  const order = state.orders.find((item) => item.id === Number(orderId));
  if (!order) return;
  order.status = status;
  renderAll();
}

function takeDelivery(orderId) {
  const order = state.orders.find((item) => item.id === Number(orderId));
  if (!order) return;
  order.status = "assigned";
  order.courier = "Repartidor Demo";
  order.gpsProgress = Math.max(order.gpsProgress || 0, 12);
  renderAll();
}

function deliverOrder(orderId) {
  const order = state.orders.find((item) => item.id === Number(orderId));
  if (!order) return;
  order.status = "delivered";
  order.courier = order.courier || "Repartidor Demo";
  order.gpsProgress = 100;
  renderAll();
}

function advanceGps(orderId) {
  const order =
    state.orders.find((item) => item.id === Number(orderId)) ||
    state.orders.find((item) => item.status === "assigned");
  if (!order || order.status !== "assigned") return;
  order.gpsProgress = Math.min((order.gpsProgress || 0) + 22, 96);
  renderAll();
}

function renderCoverage() {
  const distance = Number(document.getElementById("customerDistance").value);
  const isCovered = distance <= coverageKm;
  setText("distanceLabel", `${distance.toFixed(1)} km`);
  setText(
    "coverageLabel",
    isCovered ? "Dentro del radio de reparto." : "Fuera de cobertura. Maximo 10 km.",
  );
  document.getElementById("coverageBox").classList.toggle("outside", !isCovered);
  document.getElementById("placeOrder").disabled = !isCovered;
}

function parseExtras(value, productId) {
  return value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const [rawName, rawPrice = "0"] = chunk.split("+");
      return {
        id: `${productId}-extra-${index + 1}`,
        name: rawName.trim(),
        price: Number(rawPrice.trim()) || 0,
      };
    });
}

function clearProductForm() {
  document.getElementById("productForm").reset();
  document.getElementById("productAvailable").checked = true;
  document.getElementById("photoPreview").className = "photo-preview";
  document.getElementById("photoPreview").textContent = "Foto";
  document.getElementById("photoPreview").style.backgroundImage = "";
  delete document.getElementById("photoPreview").dataset.photo;
}

function createProduct(event) {
  event.preventDefault();
  const name = document.getElementById("productName").value.trim();
  const description = document.getElementById("productDescription").value.trim();
  const price = Number(document.getElementById("productPrice").value);
  if (!name || !description || !price) return;

  const productId = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
  state.menu.unshift({
    id: productId,
    name,
    description,
    price,
    short: productShort(name),
    photo: document.getElementById("photoPreview").dataset.photo || "",
    extras: parseExtras(document.getElementById("productExtras").value, productId),
    available: document.getElementById("productAvailable").checked,
  });
  clearProductForm();
  renderAll();
}

function previewProductPhoto(event) {
  const file = event.target.files?.[0];
  const preview = document.getElementById("photoPreview");
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    preview.dataset.photo = reader.result;
    preview.textContent = "";
    preview.className = "photo-preview has-photo";
    preview.style.backgroundImage = `url("${reader.result}")`;
  });
  reader.readAsDataURL(file);
}

function toggleProduct(productId) {
  const product = state.menu.find((item) => item.id === productId);
  if (!product) return;
  product.available = !product.available;
  renderAll();
}

function deleteProduct(productId) {
  state.menu = state.menu.filter((item) => item.id !== productId);
  state.cart = state.cart.filter((line) => line.productId !== productId);
  renderAll();
}

function switchView(view) {
  const titles = {
    buyer: "App para compradores",
    merchant: "App para restaurante o negocio",
    courier: "App para repartidores",
    admin: "Administrador general",
  };

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
  setText("viewTitle", titles[view]);
}

document.addEventListener("click", (event) => {
  const addId = event.target.dataset.add;
  const status = event.target.dataset.status;
  const takeId = event.target.dataset.take;
  const deliverId = event.target.dataset.deliver;
  const progressId = event.target.dataset.progress;
  const toggleProductId = event.target.dataset.toggleProduct;
  const deleteProductId = event.target.dataset.deleteProduct;
  const view = event.target.dataset.view;

  if (addId) addToCart(addId);
  if (status) {
    const [orderId, nextStatus] = status.split(":");
    updateOrderStatus(orderId, nextStatus);
  }
  if (takeId) takeDelivery(takeId);
  if (deliverId) deliverOrder(deliverId);
  if (progressId) advanceGps(progressId);
  if (toggleProductId) toggleProduct(toggleProductId);
  if (deleteProductId) deleteProduct(deleteProductId);
  if (view) switchView(view);
});

document.getElementById("placeOrder").addEventListener("click", placeOrder);
document.getElementById("customerDistance").addEventListener("input", renderCoverage);
document.getElementById("advanceGps").addEventListener("click", () => advanceGps());
document.getElementById("productForm").addEventListener("submit", createProduct);
document.getElementById("productPhoto").addEventListener("change", previewProductPhoto);

document.getElementById("resetDemo").addEventListener("click", () => {
  state = structuredClone(defaultState);
  renderAll();
  renderCoverage();
  switchView("buyer");
});

renderAll();
renderCoverage();
