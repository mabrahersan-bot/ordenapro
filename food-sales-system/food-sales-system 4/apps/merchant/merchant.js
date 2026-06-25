let state = OP.load();
let refreshing = false;
let knownPendingOrders = null;
let merchantNoticeTimer = null;

function showMerchantNotice(message) {
  const holder = document.getElementById("merchantNotice");
  if (!holder) return;
  holder.textContent = message;
  holder.classList.add("visible");
  clearTimeout(merchantNoticeTimer);
  merchantNoticeTimer = setTimeout(() => holder.classList.remove("visible"), 4200);
}

function canAutoRefresh() {
  const tag = document.activeElement?.tagName;
  return !["INPUT", "SELECT", "TEXTAREA"].includes(tag);
}

function canUseMerchantActions() {
  return !state.backendConnected || OP.hasSession("merchant");
}

function renderOrders() {
  const groups = [
    { title: "Nuevos", status: "pending" },
    { title: "Preparando", status: "preparing" },
    { title: "Listos", status: "ready" },
    { title: "Cerrados", status: "closed" },
  ];
  document.getElementById("merchantOrders").innerHTML = state.orders.length
    ? `<div class="order-board">
        ${groups.map((group) => renderOrderGroup(group)).join("")}
      </div>`
    : `<div class="empty-state">Aun no hay pedidos.</div>`;
}

function renderOrderGroup(group) {
  const orders = state.orders.filter((order) =>
    group.status === "closed"
      ? ["assigned", "delivered", "canceled"].includes(order.status)
      : order.status === group.status,
  );
  return `
    <section class="order-column ${group.status}">
      <div class="order-column-title">
        <strong>${group.title}</strong>
        <span>${orders.length}</span>
      </div>
      ${
        orders.length
          ? orders.map(renderOrderCard).join("")
          : `<div class="empty-state compact">Sin pedidos.</div>`
      }
    </section>
  `;
}

function renderOrderCard(order) {
  return `
    <article class="order-card merchant-order ${order.status}">
      <header>
        <div>
          <h4>#${order.id} - ${OP.escapeHtml(order.customer)}</h4>
          <div class="meta">Entrega: ${OP.escapeHtml(order.deliveryAddress)} · ${order.distanceKm} km</div>
          <div class="meta">Telefono: ${OP.escapeHtml(order.customerPhone || "sin telefono")}</div>
          <div class="meta">${OP.escapeHtml(OP.formatItems(order.items))}</div>
          <div class="meta">Nota: ${OP.escapeHtml(order.customerNote || "sin nota")}</div>
        </div>
        <span class="badge ${order.status}">${OP.statusLabels[order.status]}</span>
      </header>
      <div class="cash-strip">
        <span>Cobrar al cliente</span>
        <strong>${OP.money.format(order.grandTotal)}</strong>
      </div>
      <footer>
        <strong>Productos: ${OP.money.format(order.total)}</strong>
        ${merchantAction(order)}
      </footer>
    </article>
  `;
}

function renderKpis() {
  const active = state.orders.filter((order) => ["pending", "preparing", "ready"].includes(order.status));
  const pending = state.orders.filter((order) => order.status === "pending").length;
  const ready = state.orders.filter((order) => order.status === "ready").length;
  const cash = active.reduce((sum, order) => sum + order.grandTotal, 0);
  document.getElementById("merchantKpis").innerHTML = `
    <span><strong>${pending}</strong> nuevos</span>
    <span><strong>${ready}</strong> listos</span>
    <span><strong>${OP.money.format(cash)}</strong> por cobrar</span>
  `;
}

function renderBusiness() {
  const session = OP.getSession("merchant");
  document.getElementById("merchantSession").textContent = session
    ? `Sesion verificada · usuario #${session.user_id}`
    : "Verifica tu telefono";
  document.getElementById("backendStatus").textContent = state.backendConnected
    ? "Conectado a base de datos"
    : "Modo demo local";
  document.getElementById("businessName").value = state.business.name;
  document.getElementById("pickupAddress").value = state.business.pickupAddress;
  document.getElementById("businessPhone").value = state.business.phone;
  document.getElementById("businessOpen").checked = state.business.open;
  const point = OP.coords(state.business.pickupLat, state.business.pickupLng);
  document.getElementById("businessLocationStatus").textContent = point
    ? `GPS negocio: ${OP.formatCoords(point)}.`
    : "Sin ubicacion GPS del negocio. Se usara distancia manual del comprador.";
  const openStatus = document.getElementById("merchantOpenStatus");
  openStatus.textContent = state.business.open && !state.business.blocked ? "Abierto" : "Cerrado";
  openStatus.classList.toggle("closed", !state.business.open || state.business.blocked);
}

function notifyMerchantChanges() {
  const pendingIds = new Set(state.orders.filter((order) => order.status === "pending").map((order) => order.id));
  if (knownPendingOrders) {
    const fresh = [...pendingIds].filter((id) => !knownPendingOrders.has(id));
    if (fresh.length) {
      window.OrdenaPWA?.notify("Nuevo pedido recibido", `Hay ${fresh.length} pedido${fresh.length === 1 ? "" : "s"} esperando respuesta.`);
    }
  }
  knownPendingOrders = pendingIds;
}

async function sendAuthCode() {
  if (!state.backendConnected) {
    document.getElementById("authHint").textContent = "Modo demo local: sin codigo.";
    return;
  }
  const payload = await OP.requestLoginCode(
    "merchant",
    document.getElementById("authPhone").value,
    document.getElementById("authName").value,
  );
  document.getElementById("authHint").textContent = payload.demo_code
    ? `Codigo de prueba: ${payload.demo_code}`
    : "Codigo enviado por SMS.";
}

async function verifyAuthCode() {
  if (state.backendConnected) {
    await OP.verifyLoginCode("merchant", document.getElementById("authPhone").value, document.getElementById("authCode").value);
  }
  document.getElementById("authHint").textContent = "Sesion verificada.";
  await renderAll();
}

function merchantAction(order) {
  if (!canUseMerchantActions()) {
    return `<span class="meta">Verifica el negocio para operar pedidos.</span>`;
  }
  if (order.status === "pending") {
    return `
      <button class="mini-button" type="button" data-status="${order.id}:preparing">Aceptar pedido</button>
      <button class="mini-button danger" type="button" data-status="${order.id}:canceled">Cancelar</button>
    `;
  }
  if (order.status === "preparing") {
    return `
      <button class="mini-button" type="button" data-status="${order.id}:ready">Marcar listo</button>
      <button class="mini-button danger" type="button" data-status="${order.id}:canceled">Cancelar</button>
    `;
  }
  if (order.status === "ready") return `<span class="meta">Esperando repartidor</span>`;
  if (order.status === "canceled") return `<span class="meta">${OP.escapeHtml(order.cancelReason || "Cancelado")}</span>`;
  return `<span class="meta">${OP.escapeHtml(order.courier || "Operacion cerrada")}</span>`;
}

function renderMenu() {
  document.getElementById("merchantMenu").innerHTML = state.menu
    .map(
      (item) => `
      <div class="menu-row product-row">
        ${
          item.photo
            ? `<img class="menu-thumb" src="${item.photo}" alt="${OP.escapeHtml(item.name)}" />`
            : `<span class="menu-thumb fallback">${OP.escapeHtml(item.short || OP.productShort(item.name))}</span>`
        }
        <span>
          <strong>${OP.escapeHtml(item.name)}</strong>
          <small>${OP.escapeHtml(item.description)}</small>
          <small>${item.extras?.length ? `${item.extras.length} extras` : "sin extras"} · ${item.available ? "disponible" : "oculto"}</small>
        </span>
        <div class="row-actions">
          <strong>${OP.money.format(item.price)}</strong>
          <button class="mini-button" type="button" data-toggle-product="${item.id}">${item.available ? "Ocultar" : "Mostrar"}</button>
          <button class="mini-button danger" type="button" data-delete-product="${item.id}">Eliminar</button>
        </div>
      </div>
    `,
    )
    .join("");
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

function clearForm() {
  document.getElementById("productForm").reset();
  document.getElementById("productAvailable").checked = true;
  const preview = document.getElementById("photoPreview");
  preview.className = "photo-preview";
  preview.textContent = "Foto";
  preview.style.backgroundImage = "";
  delete preview.dataset.photo;
}

async function createProduct(event) {
  event.preventDefault();
  if (!canUseMerchantActions()) {
    document.getElementById("authHint").textContent = "Verifica tu telefono para publicar productos.";
    return;
  }
  const name = document.getElementById("productName").value.trim();
  const description = document.getElementById("productDescription").value.trim();
  const price = Number(document.getElementById("productPrice").value);
  if (!name || !description || !price || price <= 0) {
    showMerchantNotice("Completa nombre, descripcion y precio valido para publicar.");
    return;
  }
  const productId = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
  const product = {
    id: productId,
    name,
    description,
    price,
    short: OP.productShort(name),
    photo: document.getElementById("photoPreview").dataset.photo || "",
    extras: OP.parseExtras(document.getElementById("productExtras").value, productId),
    available: document.getElementById("productAvailable").checked,
  };
  if (state.backendConnected) {
    await OP.createBackendProduct(product);
  } else {
    state.menu.unshift(product);
    OP.save(state);
  }
  clearForm();
  showMerchantNotice(`${name} publicado en el menu.`);
  await renderAll();
}

async function updateOrder(orderId, status) {
  if (!canUseMerchantActions()) {
    document.getElementById("authHint").textContent = "Verifica tu telefono para cambiar pedidos.";
    return;
  }
  const order = state.orders.find((item) => item.id === Number(orderId));
  if (!order) return;
  if (status === "canceled" && !confirm(`Cancelar pedido #${order.id}?`)) return;
  if (state.backendConnected) {
    await OP.updateBackendOrderStatus(orderId, status, {
      cancel_reason: status === "canceled" ? "Cancelado por el negocio." : undefined,
    }, "merchant");
  } else {
    order.status = status;
    if (status === "canceled") order.cancelReason = "Cancelado por el negocio.";
    OP.save(state);
  }
  showMerchantNotice(`Pedido #${order.id}: ${OP.statusLabels[status]}.`);
  await renderAll();
}

async function saveBusiness(event) {
  event.preventDefault();
  if (!canUseMerchantActions()) {
    document.getElementById("authHint").textContent = "Verifica tu telefono para editar el negocio.";
    return;
  }
  const businessName = document.getElementById("businessName").value.trim();
  const pickupAddress = document.getElementById("pickupAddress").value.trim();
  const phone = document.getElementById("businessPhone").value.trim();
  if (!businessName || !pickupAddress || !phone) {
    showMerchantNotice("Completa nombre, direccion de recoleccion y telefono.");
    return;
  }
  state.business = {
    name: businessName,
    pickupAddress,
    pickupLat: state.business.pickupLat || null,
    pickupLng: state.business.pickupLng || null,
    phone,
    open: document.getElementById("businessOpen").checked,
    blocked: state.business.blocked,
  };
  state.orders = state.orders.map((order) =>
    ["pending", "preparing", "ready"].includes(order.status)
      ? { ...order, pickupAddress: state.business.pickupAddress }
      : order,
  );
  if (state.backendConnected) {
    await OP.updateBackendBusiness(state.business);
  } else {
    OP.save(state);
  }
  showMerchantNotice(state.business.open ? "Negocio abierto y datos guardados." : "Negocio cerrado y datos guardados.");
  await renderAll();
}

function useBusinessGps() {
  if (!navigator.geolocation) {
    showMerchantNotice("Este navegador no permite GPS.");
    return;
  }
  document.getElementById("businessLocationStatus").textContent = "Solicitando permiso de ubicacion...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.business.pickupLat = position.coords.latitude;
      state.business.pickupLng = position.coords.longitude;
      OP.save(state);
      document.getElementById("businessLocationStatus").textContent =
        `GPS negocio: ${OP.formatCoords({ lat: state.business.pickupLat, lng: state.business.pickupLng })} · precision ${Math.round(position.coords.accuracy)} m`;
      showMerchantNotice("GPS del negocio guardado. Ahora guarda datos para publicarlo.");
      renderBusiness();
    },
    (error) => {
      document.getElementById("businessLocationStatus").textContent = `GPS no disponible: ${error.message}`;
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
  );
}

async function toggleProduct(productId) {
  if (!canUseMerchantActions()) {
    document.getElementById("authHint").textContent = "Verifica tu telefono para cambiar productos.";
    return;
  }
  const product = state.menu.find((item) => item.id === productId);
  if (!product) return;
  product.available = !product.available;
  if (state.backendConnected) {
    await OP.updateBackendProduct(product);
  } else {
    OP.save(state);
  }
  showMerchantNotice(`${product.name} ahora esta ${product.available ? "visible" : "oculto"}.`);
  await renderAll();
}

function deleteProduct(productId) {
  if (!canUseMerchantActions()) {
    document.getElementById("authHint").textContent = "Verifica tu telefono para eliminar productos.";
    return;
  }
  const product = state.menu.find((item) => item.id === productId);
  if (!confirm(`Eliminar ${product?.name || "este producto"} del menu?`)) return;
  state.menu = state.menu.filter((item) => item.id !== productId);
  state.cart = state.cart.filter((line) => line.productId !== productId);
  OP.save(state);
  showMerchantNotice(`${product?.name || "Producto"} eliminado.`);
  renderAll();
}

async function renderAll() {
  state = await OP.loadSmart();
  notifyMerchantChanges();
  renderBusiness();
  renderKpis();
  renderOrders();
  renderMenu();
}

async function autoRefresh() {
  if (refreshing || document.hidden || !canAutoRefresh()) return;
  refreshing = true;
  try {
    await renderAll();
  } finally {
    refreshing = false;
  }
}

document.addEventListener("click", (event) => {
  if (event.target.dataset.status) {
    const [orderId, status] = event.target.dataset.status.split(":");
    updateOrder(orderId, status);
  }
  if (event.target.dataset.toggleProduct) toggleProduct(event.target.dataset.toggleProduct);
  if (event.target.dataset.deleteProduct) deleteProduct(event.target.dataset.deleteProduct);
});
document.getElementById("productForm").addEventListener("submit", createProduct);
document.getElementById("businessForm").addEventListener("submit", saveBusiness);
document.getElementById("useBusinessGps").addEventListener("click", useBusinessGps);
document.getElementById("productPhoto").addEventListener("change", previewProductPhoto);
document.getElementById("sendCode").addEventListener("click", sendAuthCode);
document.getElementById("verifyCode").addEventListener("click", verifyAuthCode);
renderAll();
setInterval(autoRefresh, 4000);
