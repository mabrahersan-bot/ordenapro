let state = OP.load();
let refreshing = false;
let lastBuyerOrderStatus = "";
let buyerNoticeTimer = null;

function showBuyerNotice(message) {
  const warning = document.getElementById("checkoutWarning");
  if (!warning) return;
  warning.textContent = message;
  warning.classList.add("visible");
  clearTimeout(buyerNoticeTimer);
  buyerNoticeTimer = setTimeout(() => warning.classList.remove("visible"), 4200);
}

function canAutoRefresh() {
  const tag = document.activeElement?.tagName;
  return !["INPUT", "SELECT", "TEXTAREA"].includes(tag);
}

function cartEntries() {
  return state.cart
    .map((line) => {
      const product = state.menu.find((item) => item.id === line.productId);
      if (!product) return null;
      const extras = line.extras || [];
      const extrasTotal = extras.reduce((sum, extra) => sum + extra.price, 0);
      return { ...product, qty: line.qty, selectedExtras: extras, linePrice: product.price + extrasTotal };
    })
    .filter(Boolean);
}

function cartTotal() {
  return cartEntries().reduce((sum, item) => sum + item.linePrice * item.qty, 0);
}

function currentCosts() {
  const subtotal = cartTotal();
  if (!subtotal) {
    return {
      subtotal: 0,
      deliveryFee: 0,
      platformFee: 0,
      courierCommission: 0,
      grandTotal: 0,
    };
  }
  return OP.calculateCosts(subtotal, Number(document.getElementById("customerDistance").value), state.settings);
}

function addressReady() {
  const address = document.getElementById("customerAddress").value.trim();
  return address.length >= 8 && !address.toLowerCase().includes("sin direccion");
}

function renderMenu() {
  const products = state.menu.filter((item) => item.available);
  const holder = document.getElementById("menuGrid");
  holder.innerHTML = products.length
    ? products
        .map(
          (item) => `
          <article class="product-card">
            ${
              item.photo
                ? `<img class="product-photo" src="${item.photo}" alt="${OP.escapeHtml(item.name)}" />`
                : `<div class="product-art">${OP.escapeHtml(item.short || OP.productShort(item.name))}</div>`
            }
            <div>
              <h3>${OP.escapeHtml(item.name)}</h3>
              <p>${OP.escapeHtml(item.description)}</p>
            </div>
            ${
              item.extras?.length
                ? `<div class="extras-picker">
                    ${item.extras
                      .map(
                        (extra) => `
                          <label>
                            <input type="checkbox" data-extra-for="${item.id}" value="${extra.id}" />
                            ${OP.escapeHtml(extra.name)} +${OP.money.format(extra.price)}
                          </label>
                        `,
                      )
                      .join("")}
                  </div>`
                : `<span class="meta">Sin extras configurados</span>`
            }
            <footer>
              <strong>${OP.money.format(item.price)}</strong>
              <span class="cash-tag">Efectivo</span>
              <button class="mini-button" type="button" data-add="${item.id}" onclick="addToCart(this.dataset.add)">Agregar</button>
            </footer>
          </article>
        `,
        )
        .join("")
    : `<div class="empty-state">No hay productos disponibles.</div>`;
}

function renderCart() {
  const entries = cartEntries();
  const count = entries.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById("cartCount").textContent = `${count} producto${count === 1 ? "" : "s"}`;
  document.getElementById("cartTotal").textContent = OP.money.format(cartTotal());

  const holder = document.getElementById("cartItems");
  if (!entries.length) {
    holder.className = "cart-items empty-state";
    holder.textContent = "Agrega productos para ver tu total en efectivo.";
    return;
  }

  holder.className = "cart-items";
  holder.innerHTML = entries
    .map(
      (item) => `
        <div class="cart-row">
          <span>
            ${item.qty} x ${OP.escapeHtml(item.name)}
            ${item.selectedExtras.length ? `<small>${item.selectedExtras.map((extra) => OP.escapeHtml(extra.name)).join(", ")}</small>` : ""}
            <small>Paga por este producto: ${OP.money.format(item.linePrice * item.qty)}</small>
          </span>
          <strong>${OP.money.format(item.linePrice * item.qty)}</strong>
        </div>
      `,
    )
    .join("");
}

function selectedAddress() {
  return (
    state.customer.savedAddresses.find((address) => address.id === state.customer.selectedAddressId) ||
    state.customer.savedAddresses[0]
  );
}

function buyerOrders() {
  const phone = state.customer.phone?.trim();
  if (!state.backendConnected) return state.orders;
  if (!phone) return [];
  return state.orders.filter((order) => String(order.customerPhone || "").trim() === phone);
}

function renderSession() {
  const customer = state.customer;
  const session = OP.getSession("buyer");
  if (session) {
    customer.loggedIn = true;
  }
  const address = selectedAddress();
  document.getElementById("buyerGreeting").textContent = customer.loggedIn
    ? `Hola, ${customer.name}`
    : "Comprar en negocios locales";
  document.getElementById("backendStatus").textContent = state.backendConnected
    ? "Conectado a base de datos"
    : "Modo demo local";
  document.getElementById("sessionTitle").textContent = customer.loggedIn
    ? `Sesion activa · ${customer.phone || "sin telefono"}`
    : "Inicia sesion";
  document.getElementById("loginName").value = customer.name;
  document.getElementById("loginPhone").value = customer.phone;
  document.getElementById("customerName").value = customer.name;
  document.getElementById("customerAddress").value = address
    ? `${address.address}${address.reference ? ` · ${address.reference}` : ""}`
    : "";
  document.getElementById("addressCount").textContent = `${customer.savedAddresses.length} guardada${
    customer.savedAddresses.length === 1 ? "" : "s"
  }`;
  document.getElementById("savedAddress").innerHTML = customer.savedAddresses
    .map(
      (item) => `
      <option value="${item.id}" ${item.id === customer.selectedAddressId ? "selected" : ""}>
        ${OP.escapeHtml(item.label)} - ${OP.escapeHtml(item.address)}
      </option>
    `,
    )
    .join("");
}

function renderCoverage() {
  const distance = Number(document.getElementById("customerDistance").value);
  const isLoggedIn = !state.backendConnected || OP.hasSession("buyer");
  const hasAddress = addressReady();
  const hasCart = cartEntries().length > 0;
  const isCovered = distance <= OP.coverageKm && OP.canReceiveOrders(state) && isLoggedIn && hasAddress && hasCart;
  document.getElementById("distanceLabel").textContent = `${distance.toFixed(1)} km`;
  document.getElementById("coverageLabel").textContent = isCovered
    ? "Todo listo para confirmar."
    : !isLoggedIn
      ? "Verifica tu telefono antes de pedir."
      : !hasCart
      ? "Agrega al menos un producto."
      : !hasAddress
      ? "Confirma una direccion completa."
      : state.business.blocked
      ? "Negocio pausado por administracion."
      : !state.business.open || !state.settings.serviceActive
        ? "Servicio temporalmente cerrado."
        : "Fuera de cobertura. Maximo 10 km.";
  document.getElementById("coverageBox").classList.toggle("outside", !isCovered);
  document.getElementById("placeOrder").disabled = !isCovered;
  document.getElementById("pickupPreview").textContent = state.business.pickupAddress;
  const costs = currentCosts();
  document.getElementById("cashDueTop").textContent = OP.money.format(costs.grandTotal);
  document.getElementById("checkoutSummary").innerHTML = `
    <div><span>Productos</span><strong>${OP.money.format(costs.subtotal)}</strong></div>
    <div><span>Envio estimado</span><strong>${OP.money.format(costs.deliveryFee)}</strong></div>
    <div class="summary-total"><span>Total en efectivo</span><strong>${OP.money.format(costs.grandTotal)}</strong></div>
  `;
  document.getElementById("cashCallout").textContent = costs.grandTotal
    ? `Prepara ${OP.money.format(costs.grandTotal)} en efectivo para pagar al recibir.`
    : "Agrega productos para ver cuanto pagaras en efectivo.";
}

function renderTracking() {
  const order = OP.activeTrackedOrder({ ...state, orders: buyerOrders() });
  if (!order) {
    document.getElementById("trackingStatus").textContent = "Sin pedido activo";
    document.getElementById("trackingCopy").innerHTML = `
      <strong>Aun no tienes pedido en camino</strong>
      <span>Cuando confirmes un pedido, aqui veras el estado, el total en efectivo y la ubicacion del repartidor.</span>
    `;
    return;
  }
  OP.renderPins(order, "buyer");
  document.getElementById("trackingStatus").textContent =
    order.status === "delivered" ? "Entregado" : `${OP.statusLabels[order.status]} · ${OP.etaMinutes(order)} min`;
  document.getElementById("trackingCopy").innerHTML = `
    <strong>Pedido #${order.id}: ${OP.statusLabels[order.status]}</strong>
    <span class="next-step">${OP.escapeHtml(nextBuyerStep(order))}</span>
    <span>Recoge en: ${OP.escapeHtml(order.pickupAddress)}</span>
    <span>Entrega en: ${OP.escapeHtml(order.deliveryAddress)} · ${order.distanceKm} km · restan ${OP.remainingKm(order).toFixed(1)} km.</span>
    <span>Pago: ${OP.escapeHtml(order.paymentMethod)} · efectivo a pagar: ${OP.money.format(order.grandTotal)}</span>
    ${
      order.courierLat && order.courierLng
        ? `<span>GPS real repartidor: ${Number(order.courierLat).toFixed(5)}, ${Number(order.courierLng).toFixed(5)} · precision ${Math.round(order.courierAccuracy || 0)} m</span>`
        : `<span>GPS real aun no activado por el repartidor.</span>`
    }
    <span>${order.courier ? `Repartidor: ${OP.escapeHtml(order.courier)}` : "Aun sin repartidor asignado."}</span>
  `;
}

function nextBuyerStep(order) {
  if (order.status === "pending") return "El negocio debe aceptar tu pedido.";
  if (order.status === "preparing") return "El negocio esta preparando tu pedido.";
  if (order.status === "ready") return "Tu pedido esta listo y espera repartidor.";
  if (order.status === "assigned") return "El repartidor va en camino.";
  if (order.status === "delivered") return "Pedido entregado. Puedes calificar el servicio.";
  if (order.status === "canceled") return "Pedido cancelado. Revisa el motivo en historial.";
  return "Seguimiento activo.";
}

function renderHistory() {
  const orders = buyerOrders();
  const holder = document.getElementById("buyerHistory");
  holder.innerHTML = orders.length
    ? orders
        .slice(0, 6)
        .map(
          (order) => `
          <article class="order-card">
            <header>
              <div>
                <h4>#${order.id} - ${OP.statusLabels[order.status]}</h4>
                <div class="meta">${OP.escapeHtml(order.deliveryAddress)} · ${OP.money.format(order.grandTotal)}</div>
                ${order.cancelReason ? `<div class="meta">Motivo: ${OP.escapeHtml(order.cancelReason)}</div>` : ""}
                ${order.rating ? `<div class="meta">Calificacion: ${order.rating}/5</div>` : ""}
              </div>
              <span class="badge">${OP.statusLabels[order.status]}</span>
            </header>
            <footer>
              ${
                ["pending", "preparing"].includes(order.status)
                  ? `<button class="mini-button danger" type="button" data-cancel="${order.id}" onclick="cancelOrder(this.dataset.cancel)">Cancelar</button>`
                  : ""
              }
              ${
                order.status === "delivered" && !order.rating
                  ? `<button class="mini-button" type="button" data-rate="${order.id}" onclick="rateOrder(this.dataset.rate)">Calificar 5</button>`
                  : ""
              }
            </footer>
          </article>
        `,
        )
        .join("")
    : `<div class="empty-state">Aun no hay pedidos.</div>`;
}

function notifyBuyerChanges() {
  const order = OP.activeTrackedOrder(state);
  const key = order ? `${order.id}:${order.status}` : "none";
  if (lastBuyerOrderStatus && key !== lastBuyerOrderStatus && order) {
    window.OrdenaPWA?.notify(
      "Tu pedido se actualizo",
      `Pedido #${order.id}: ${OP.statusLabels[order.status]}. Total en efectivo ${OP.money.format(order.grandTotal)}.`,
    );
  }
  lastBuyerOrderStatus = key;
}

function addToCart(productId) {
  const product = state.menu.find((item) => item.id === productId);
  if (!product) return;
  const selectedIds = Array.from(document.querySelectorAll(`[data-extra-for="${productId}"]:checked`)).map(
    (input) => input.value,
  );
  const extras = (product.extras || []).filter((extra) => selectedIds.includes(extra.id));
  const key = extras.map((extra) => extra.id).sort().join("|");
  const existing = state.cart.find(
    (line) => line.productId === productId && (line.extras || []).map((extra) => extra.id).sort().join("|") === key,
  );
  if (existing) existing.qty += 1;
  else state.cart.push({ productId, qty: 1, extras });
  OP.save(state);
  renderAll();
}

async function loginBuyer() {
  state.customer.name = document.getElementById("loginName").value.trim() || "Cliente";
  state.customer.phone = document.getElementById("loginPhone").value.trim();
  if (state.backendConnected) {
    const payload = await OP.requestLoginCode("buyer", state.customer.phone, state.customer.name);
    document.getElementById("loginHint").textContent = `Codigo demo: ${payload.demo_code}`;
  } else {
    state.customer.loggedIn = true;
    document.getElementById("loginHint").textContent = "Sesion demo iniciada sin codigo.";
  }
  OP.save(state);
  await renderAll();
}

async function verifyBuyer() {
  state.customer.name = document.getElementById("loginName").value.trim() || "Cliente";
  state.customer.phone = document.getElementById("loginPhone").value.trim();
  if (state.backendConnected) {
    await OP.verifyLoginCode("buyer", state.customer.phone, document.getElementById("loginCode").value);
  }
  state.customer.loggedIn = true;
  document.getElementById("loginHint").textContent = "Sesion verificada.";
  OP.save(state);
  await renderAll();
}

function chooseAddress() {
  state.customer.selectedAddressId = document.getElementById("savedAddress").value;
  OP.save(state);
  renderAll();
}

function saveAddress() {
  const label = document.getElementById("addressLabel").value.trim() || "Direccion";
  const address = document.getElementById("newAddress").value.trim();
  const reference = document.getElementById("addressReference").value.trim();
  if (!address || address.length < 8) {
    showBuyerNotice("Escribe una direccion completa antes de guardarla.");
    return;
  }
  const id = `addr-${Date.now()}`;
  state.customer.savedAddresses.push({ id, label, address, reference });
  state.customer.selectedAddressId = id;
  document.getElementById("addressLabel").value = "";
  document.getElementById("newAddress").value = "";
  document.getElementById("addressReference").value = "";
  OP.save(state);
  showBuyerNotice("Direccion guardada y seleccionada.");
  renderAll();
}

async function placeOrder() {
  const entries = cartEntries();
  const distanceKm = Number(document.getElementById("customerDistance").value);
  if (state.backendConnected && !OP.hasSession("buyer")) {
    document.getElementById("loginHint").textContent = "Verifica tu telefono para confirmar el pedido.";
    showBuyerNotice("Primero verifica tu telefono.");
    return;
  }
  if (!entries.length) {
    showBuyerNotice("Agrega al menos un producto para pedir.");
    return;
  }
  if (!addressReady()) {
    showBuyerNotice("Confirma tu direccion de entrega antes de pedir.");
    return;
  }
  if (distanceKm > OP.coverageKm) {
    showBuyerNotice("La direccion queda fuera del radio de 10 km.");
    return;
  }

  const now = new Date();
  const costs = currentCosts();
  const order = {
    id: state.nextOrderId++,
    customer: document.getElementById("customerName").value || "Cliente",
    customerPhone: state.customer.phone,
    address: document.getElementById("customerAddress").value || "Sin direccion",
    deliveryAddress: document.getElementById("customerAddress").value || "Sin direccion",
    pickupAddress: state.business.pickupAddress,
    items: entries.map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.linePrice,
      extras: item.selectedExtras,
    })),
    total: costs.subtotal,
    subtotal: costs.subtotal,
    deliveryFee: costs.deliveryFee,
    platformFee: costs.platformFee,
    courierCommission: costs.courierCommission,
    grandTotal: costs.grandTotal,
    paymentMethod: "Efectivo",
    customerNote: document.getElementById("customerNote").value.trim(),
    cancelReason: "",
    rating: 0,
    chat: [
      {
        from: "Comprador",
        text: document.getElementById("customerNote").value.trim() || "Pedido creado.",
        at: now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
      },
    ],
    status: "pending",
    courier: "",
    distanceKm,
    gpsProgress: 0,
    createdAt: now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };

  if (state.backendConnected) {
    await OP.createBackendOrder({
      customer_name: order.customer,
      customer_phone: order.customerPhone,
      delivery_address: order.deliveryAddress,
      delivery_reference: selectedAddress()?.reference || "",
      distance_km: order.distanceKm,
      customer_note: order.customerNote,
      items: entries.map((item) => ({
        product_id: item.dbId,
        dbId: item.dbId,
        name: item.name,
        qty: item.qty,
        unit_price: item.linePrice,
        extras: item.selectedExtras,
      })),
    });
  } else {
    state.orders.unshift(order);
  }
  state.cart = [];
  OP.save(state);
  window.OrdenaPWA?.notify("Pedido confirmado", `Prepara ${OP.money.format(costs.grandTotal)} en efectivo al recibir.`);
  await renderAll();
}

function cancelOrder(orderId) {
  const order = state.orders.find((item) => item.id === Number(orderId));
  if (!order || !["pending", "preparing"].includes(order.status)) return;
  order.status = "canceled";
  order.cancelReason = "Cancelado por comprador antes de salir a reparto.";
  OP.save(state);
  renderAll();
}

function rateOrder(orderId) {
  const order = state.orders.find((item) => item.id === Number(orderId));
  if (!order || order.status !== "delivered") return;
  order.rating = 5;
  OP.save(state);
  renderAll();
}

window.addToCart = addToCart;
window.cancelOrder = cancelOrder;
window.rateOrder = rateOrder;

async function renderAll() {
  state = await OP.loadSmart();
  notifyBuyerChanges();
  renderSession();
  renderMenu();
  renderCart();
  renderCoverage();
  renderTracking();
  renderHistory();
}

async function autoRefresh() {
  if (refreshing || document.hidden || !canAutoRefresh()) return;
  refreshing = true;
  try {
    state = await OP.loadSmart();
    notifyBuyerChanges();
    renderSession();
    renderCart();
    renderCoverage();
    renderTracking();
    renderHistory();
  } finally {
    refreshing = false;
  }
}

document.getElementById("customerDistance").addEventListener("input", renderCoverage);
document.getElementById("customerAddress").addEventListener("input", renderCoverage);
document.getElementById("placeOrder").addEventListener("click", placeOrder);
document.getElementById("loginButton").addEventListener("click", loginBuyer);
document.getElementById("verifyButton").addEventListener("click", verifyBuyer);
document.getElementById("savedAddress").addEventListener("change", chooseAddress);
document.getElementById("saveAddress").addEventListener("click", saveAddress);
renderAll();
setInterval(autoRefresh, 4000);
