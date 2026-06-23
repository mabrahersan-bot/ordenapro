let state = OP.load();
let refreshing = false;
let knownAdminOrders = null;
let adminNoticeTimer = null;

function showAdminNotice(message) {
  const holder = document.getElementById("adminAlerts");
  if (!holder) return;
  holder.innerHTML = `<div class="admin-alert important">${OP.escapeHtml(message)}</div>`;
  clearTimeout(adminNoticeTimer);
  adminNoticeTimer = setTimeout(renderAlerts, 4200);
}

function canAutoRefresh() {
  const tag = document.activeElement?.tagName;
  return !["INPUT", "SELECT", "TEXTAREA"].includes(tag);
}

function canUseAdminActions() {
  return !state.backendConnected || OP.hasSession("admin");
}

function requireAdmin(message = "Verifica tu telefono de administrador para continuar.") {
  if (canUseAdminActions()) return true;
  document.getElementById("authHint").textContent = message;
  return false;
}

function renderKpis() {
  const session = OP.getSession("admin");
  document.getElementById("adminSession").textContent = session
    ? `Sesion verificada · usuario #${session.user_id}`
    : "Verifica tu telefono";
  document.getElementById("backendStatus").textContent = state.backendConnected
    ? "Conectado a base de datos"
    : "Modo demo local";
  const revenue = state.orders.reduce((sum, order) => sum + order.grandTotal, 0);
  const average = state.orders.length ? revenue / state.orders.length : 0;
  const pending = state.orders.filter((order) => !["delivered", "canceled"].includes(order.status)).length;
  const platform = state.orders.reduce((sum, order) => sum + order.platformFee, 0);
  const activeCourier = state.orders.some((order) => order.status === "assigned");
  document.getElementById("adminRevenue").textContent = OP.money.format(revenue);
  document.getElementById("adminOrders").textContent = state.orders.length;
  document.getElementById("adminAverage").textContent = OP.money.format(average);
  document.getElementById("adminPending").textContent = pending;
  document.getElementById("adminPlatform").textContent = OP.money.format(platform);
  document.getElementById("adminServiceStatus").textContent = state.settings.serviceActive ? "Activo" : "Pausado";
  document.getElementById("adminBusinessStatus").textContent = state.business.blocked
    ? "Bloqueado"
    : state.business.open
      ? "Abierto"
      : "Cerrado";
  document.getElementById("adminCourierStatus").textContent = activeCourier ? "En ruta" : "Disponible";
  document.getElementById("adminLiveStatus").textContent = pending ? `${pending} activos` : "Sin pendientes";
}

function cashTotals() {
  const validOrders = state.orders.filter((order) => order.status !== "canceled");
  const deliveredOrders = validOrders.filter((order) => order.status === "delivered");
  return {
    customerCash: validOrders.reduce((sum, order) => sum + order.grandTotal, 0),
    merchantDue: validOrders.reduce((sum, order) => sum + order.total, 0),
    courierDue: validOrders.reduce((sum, order) => sum + order.courierCommission, 0),
    platformDue: validOrders.reduce((sum, order) => sum + order.platformFee, 0),
    deliveredCash: deliveredOrders.reduce((sum, order) => sum + order.grandTotal, 0),
  };
}

function buildAlerts() {
  const alerts = [];
  if (!state.settings.serviceActive) alerts.push("Servicio pausado: compradores no deberian generar pedidos nuevos.");
  if (state.business.blocked) alerts.push("Negocio bloqueado: revisar incidencia antes de reactivar.");
  if (!state.business.open) alerts.push("Negocio cerrado: no esta recibiendo pedidos.");
  const noCourier = state.orders.filter((order) => order.status === "ready" && !order.courier);
  if (noCourier.length) alerts.push(`${noCourier.length} pedido${noCourier.length === 1 ? "" : "s"} listo sin repartidor.`);
  const noGps = state.orders.filter((order) => order.status === "assigned" && !order.courierLat);
  if (noGps.length) alerts.push(`${noGps.length} entrega${noGps.length === 1 ? "" : "s"} en ruta sin GPS real.`);
  const canceled = state.orders.filter((order) => order.status === "canceled");
  if (canceled.length) alerts.push(`${canceled.length} pedido${canceled.length === 1 ? "" : "s"} cancelado.`);
  return alerts;
}

function renderCashBoard() {
  const totals = cashTotals();
  document.getElementById("adminCashBoard").innerHTML = `
    <article><span>Cobrar clientes</span><strong>${OP.money.format(totals.customerCash)}</strong></article>
    <article><span>Para negocios</span><strong>${OP.money.format(totals.merchantDue)}</strong></article>
    <article><span>Comisiones reparto</span><strong>${OP.money.format(totals.courierDue)}</strong></article>
    <article><span>Plataforma</span><strong>${OP.money.format(totals.platformDue)}</strong></article>
  `;
}

function renderAlerts() {
  const alerts = buildAlerts();
  document.getElementById("adminAlertCount").textContent = alerts.length;
  document.getElementById("adminAlerts").innerHTML = alerts.length
    ? alerts.map((alert) => `<div class="admin-alert">${OP.escapeHtml(alert)}</div>`).join("")
    : `<div class="admin-alert ok">Sin alertas criticas.</div>`;
}

function orderPriority(order) {
  const weights = {
    pending: 1,
    preparing: 2,
    ready: 3,
    assigned: 4,
    canceled: 5,
    delivered: 6,
  };
  return weights[order.status] || 9;
}

function notifyAdminChanges() {
  const orderIds = new Set(state.orders.map((order) => order.id));
  if (knownAdminOrders) {
    const fresh = [...orderIds].filter((id) => !knownAdminOrders.has(id));
    if (fresh.length) {
      window.OrdenaPWA?.notify("Operacion nueva", `Entraron ${fresh.length} pedido${fresh.length === 1 ? "" : "s"} al panel.`);
    }
  }
  knownAdminOrders = orderIds;
}

async function sendAuthCode() {
  if (!state.backendConnected) {
    document.getElementById("authHint").textContent = "Modo demo local: sin codigo.";
    return;
  }
  const payload = await OP.requestLoginCode(
    "admin",
    document.getElementById("authPhone").value,
    document.getElementById("authName").value,
  );
  document.getElementById("authHint").textContent = `Codigo demo: ${payload.demo_code}`;
}

async function verifyAuthCode() {
  if (state.backendConnected) {
    await OP.verifyLoginCode("admin", document.getElementById("authPhone").value, document.getElementById("authCode").value);
  }
  document.getElementById("authHint").textContent = "Sesion verificada.";
  await renderAll();
}

function renderOrders() {
  document.getElementById("adminOrdersList").innerHTML = state.orders.length
    ? state.orders
        .slice()
        .sort((a, b) => orderPriority(a) - orderPriority(b) || b.id - a.id)
        .map(
          (order) => `
          <article class="order-card admin-order ${order.status}">
            <header>
              <div>
                <h4>#${order.id} - ${OP.escapeHtml(order.customer)}</h4>
                <div class="meta">Recoge: ${OP.escapeHtml(order.pickupAddress)} · Entrega: ${OP.escapeHtml(order.deliveryAddress)}</div>
                <div class="meta">Telefono comprador: ${OP.escapeHtml(order.customerPhone || "sin telefono")}</div>
                <div class="meta">${order.distanceKm} km · ${OP.escapeHtml(OP.formatItems(order.items))}</div>
                <div class="meta">Pago: ${OP.escapeHtml(order.paymentMethod)} · Cliente: ${OP.money.format(order.grandTotal)} · Envio: ${OP.money.format(order.deliveryFee)} · Plataforma: ${OP.money.format(order.platformFee)} · Repartidor: ${OP.money.format(order.courierCommission)}</div>
                <div class="admin-cash-line">
                  <span>Cliente ${OP.money.format(order.grandTotal)}</span>
                  <span>Negocio ${OP.money.format(order.total)}</span>
                  <span>Reparto ${OP.money.format(order.courierCommission)}</span>
                </div>
                ${
                  order.courierLat && order.courierLng
                    ? `<div class="meta">GPS repartidor: ${Number(order.courierLat).toFixed(5)}, ${Number(order.courierLng).toFixed(5)} · ${Math.round(order.courierAccuracy || 0)} m</div>`
                    : `<div class="meta">GPS repartidor: sin ubicacion real</div>`
                }
                ${order.cancelReason ? `<div class="meta">Cancelacion: ${OP.escapeHtml(order.cancelReason)}</div>` : ""}
              </div>
              <span class="badge ${order.status}">${OP.statusLabels[order.status]}</span>
            </header>
            <footer>
              <strong>${OP.money.format(order.total)}</strong>
              ${
                canUseAdminActions()
                  ? `
                    <button class="mini-button" type="button" data-admin-status="${order.id}:ready">Listo</button>
                    <button class="mini-button" type="button" data-admin-status="${order.id}:assigned">Asignar</button>
                    <button class="mini-button" type="button" data-admin-status="${order.id}:delivered">Entregado</button>
                    <button class="mini-button danger" type="button" data-admin-status="${order.id}:canceled">Cancelar</button>
                  `
                  : `<span class="meta">Verifica admin para operar.</span>`
              }
            </footer>
          </article>
        `,
        )
        .join("")
    : `<div class="empty-state">Sin pedidos registrados.</div>`;
}

function renderSettings() {
  document.getElementById("toggleService").textContent = state.settings.serviceActive ? "Pausar servicio" : "Activar servicio";
  document.getElementById("toggleBusinessBlock").textContent = state.business.blocked ? "Desbloquear negocio" : "Bloquear negocio";
  document.getElementById("baseDeliveryFee").value = state.settings.baseDeliveryFee;
  document.getElementById("perKmFee").value = state.settings.perKmFee;
  document.getElementById("platformRate").value = Math.round(state.settings.platformRate * 100);
  document.getElementById("courierBaseCommission").value = state.settings.courierBaseCommission;
  document.getElementById("courierPerKmCommission").value = state.settings.courierPerKmCommission;
  const locked = state.backendConnected && !OP.hasSession("admin");
  [
    "resetDemo",
    "toggleService",
    "toggleBusinessBlock",
    "forceReady",
    "assignCourier",
    "saveSettings",
    "saveNote",
  ].forEach((id) => {
    document.getElementById(id).disabled = locked;
  });
}

function renderOpsSummary() {
  const active = state.orders.filter((order) => ["pending", "preparing", "ready", "assigned"].includes(order.status));
  const assigned = state.orders.filter((order) => order.status === "assigned");
  const ready = state.orders.filter((order) => order.status === "ready");
  const totals = cashTotals();
  document.getElementById("adminOpsSummary").innerHTML = `
    <div class="admin-summary-card">
      <span>${OP.escapeHtml(state.business.name)}</span>
      <strong>${state.business.open && !state.business.blocked ? "Operando" : "Revisar"}</strong>
      <small>${OP.escapeHtml(state.business.pickupAddress)}</small>
    </div>
    <div class="admin-summary-grid">
      <span><strong>${active.length}</strong> activos</span>
      <span><strong>${ready.length}</strong> listos</span>
      <span><strong>${assigned.length}</strong> repartiendo</span>
      <span><strong>${OP.money.format(totals.deliveredCash)}</strong> entregado</span>
    </div>
  `;
}

function renderMenu() {
  document.getElementById("adminMenu").innerHTML = state.menu
    .map(
      (item) => `
      <div class="menu-row">
        <span>
          <strong>${OP.escapeHtml(item.name)}</strong>
          <small>${item.available ? "visible" : "oculto"} · ${OP.money.format(item.price)}</small>
        </span>
        <button class="mini-button" type="button" data-toggle-product="${item.id}">${item.available ? "Ocultar" : "Mostrar"}</button>
      </div>
    `,
    )
    .join("");
}

function renderNotes() {
  document.getElementById("adminNotes").innerHTML = state.adminNotes.length
    ? state.adminNotes
        .slice()
        .reverse()
        .map(
          (note) => `
          <div class="timeline-row">
            <div>
              <strong>${OP.escapeHtml(note.title)}</strong>
              <small>${OP.escapeHtml(note.createdAt)}</small>
            </div>
          </div>
        `,
        )
        .join("")
    : `<div class="empty-state">Sin notas internas.</div>`;
}

async function setOrderStatus(orderId, status) {
  if (!requireAdmin("Verifica admin para cambiar estados.")) return;
  const order = state.orders.find((item) => item.id === Number(orderId));
  if (!order) return;
  if (status === "canceled" && !confirm(`Cancelar pedido #${order.id}?`)) return;
  if (status === "delivered" && !confirm(`Marcar pedido #${order.id} como entregado?`)) return;
  if (state.backendConnected) {
    await OP.updateBackendOrderStatus(orderId, status, {
      courier_user_id: status === "assigned" ? 3 : undefined,
      cancel_reason: status === "canceled" ? "Cancelado por administrador." : undefined,
    }, "admin");
  } else {
    order.status = status;
    if (status === "assigned") {
      order.courier = "Repartidor Demo";
      order.gpsProgress = Math.max(order.gpsProgress || 0, 12);
    }
    if (status === "delivered") order.gpsProgress = 100;
    if (status === "canceled") order.cancelReason = "Cancelado por administrador.";
    OP.save(state);
  }
  showAdminNotice(`Pedido #${order.id}: ${OP.statusLabels[status]}.`);
  await renderAll();
}

async function toggleProduct(productId) {
  if (!requireAdmin("Verifica admin para cambiar productos.")) return;
  const product = state.menu.find((item) => item.id === productId);
  if (!product) return;
  product.available = !product.available;
  if (state.backendConnected) {
    await OP.updateBackendProduct(product);
  } else {
    OP.save(state);
  }
  showAdminNotice(`${product.name} ahora esta ${product.available ? "visible" : "oculto"}.`);
  await renderAll();
}

function saveNote() {
  if (!requireAdmin("Verifica admin para guardar notas.")) return;
  const value = document.getElementById("adminNote").value.trim();
  if (!value) return;
  state.adminNotes.push({
    title: value,
    createdAt: new Date().toLocaleString("es-MX"),
  });
  document.getElementById("adminNote").value = "";
  OP.save(state);
  showAdminNotice("Nota interna guardada.");
  renderAll();
}

async function forceReady() {
  if (!requireAdmin("Verifica admin para forzar pedidos listos.")) return;
  if (state.backendConnected) {
    for (const order of state.orders.filter((item) => ["pending", "preparing"].includes(item.status))) {
      await OP.updateBackendOrderStatus(order.id, "ready");
    }
    await renderAll();
    return;
  }
  state.orders.forEach((order) => {
    if (["pending", "preparing"].includes(order.status)) order.status = "ready";
  });
  OP.save(state);
  showAdminNotice("Pedidos pendientes marcados como listos.");
  renderAll();
}

async function assignCourier() {
  if (!requireAdmin("Verifica admin para asignar repartidores.")) return;
  if (state.backendConnected) {
    for (const order of state.orders.filter((item) => item.status === "ready")) {
      await OP.updateBackendOrderStatus(order.id, "assigned", { courier_user_id: 3 });
    }
    await renderAll();
    return;
  }
  state.orders.forEach((order) => {
    if (order.status === "ready") {
      order.status = "assigned";
      order.courier = "Repartidor Demo";
      order.gpsProgress = Math.max(order.gpsProgress || 0, 12);
    }
  });
  OP.save(state);
  showAdminNotice("Pedidos listos asignados al repartidor demo.");
  renderAll();
}

async function toggleService() {
  if (!requireAdmin("Verifica admin para pausar o activar servicio.")) return;
  state.settings.serviceActive = !state.settings.serviceActive;
  if (state.backendConnected) {
    await OP.updateBackendSettings(state.settings);
  } else {
    OP.save(state);
  }
  showAdminNotice(state.settings.serviceActive ? "Servicio activado." : "Servicio pausado.");
  await renderAll();
}

async function toggleBusinessBlock() {
  if (!requireAdmin("Verifica admin para bloquear negocios.")) return;
  state.business.blocked = !state.business.blocked;
  if (state.backendConnected) {
    await OP.updateBackendBusiness(state.business);
  } else {
    OP.save(state);
  }
  showAdminNotice(state.business.blocked ? "Negocio bloqueado." : "Negocio desbloqueado.");
  await renderAll();
}

async function saveSettings() {
  if (!requireAdmin("Verifica admin para cambiar tarifas.")) return;
  state.settings.baseDeliveryFee = Number(document.getElementById("baseDeliveryFee").value) || 0;
  state.settings.perKmFee = Number(document.getElementById("perKmFee").value) || 0;
  state.settings.platformRate = (Number(document.getElementById("platformRate").value) || 0) / 100;
  state.settings.courierBaseCommission = Number(document.getElementById("courierBaseCommission").value) || 0;
  state.settings.courierPerKmCommission = Number(document.getElementById("courierPerKmCommission").value) || 0;
  if (state.backendConnected) {
    await OP.updateBackendSettings(state.settings);
  } else {
    OP.save(state);
  }
  showAdminNotice("Tarifas actualizadas.");
  await renderAll();
}

async function renderAll() {
  state = await OP.loadSmart();
  notifyAdminChanges();
  renderKpis();
  renderCashBoard();
  renderAlerts();
  renderOrders();
  renderOpsSummary();
  renderMenu();
  renderNotes();
  renderSettings();
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
  if (event.target.dataset.adminStatus) {
    const [orderId, status] = event.target.dataset.adminStatus.split(":");
    setOrderStatus(orderId, status);
  }
  if (event.target.dataset.toggleProduct) toggleProduct(event.target.dataset.toggleProduct);
});
document.getElementById("resetDemo").addEventListener("click", () => {
  (async () => {
    if (!requireAdmin("Verifica admin para reiniciar la base.")) return;
    if (state.backendConnected) {
      await OP.resetBackend();
    } else {
      state = OP.reset();
    }
    await renderAll();
  })();
});
document.getElementById("forceReady").addEventListener("click", forceReady);
document.getElementById("assignCourier").addEventListener("click", assignCourier);
document.getElementById("toggleService").addEventListener("click", toggleService);
document.getElementById("toggleBusinessBlock").addEventListener("click", toggleBusinessBlock);
document.getElementById("saveSettings").addEventListener("click", saveSettings);
document.getElementById("saveNote").addEventListener("click", saveNote);
document.getElementById("sendCode").addEventListener("click", sendAuthCode);
document.getElementById("verifyCode").addEventListener("click", verifyAuthCode);
renderAll();
setInterval(autoRefresh, 4000);
