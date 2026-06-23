let state = OP.load();
let refreshing = false;
let gpsWatchId = null;
let knownReadyOrders = null;

function canAutoRefresh() {
  const tag = document.activeElement?.tagName;
  return !["INPUT", "SELECT", "TEXTAREA"].includes(tag);
}

function canUseCourierActions() {
  return !state.backendConnected || OP.hasSession("courier");
}

function action(order) {
  if (!canUseCourierActions()) {
    return `<span class="meta">Verifica tu telefono para tomar entregas.</span>`;
  }
  if (order.status === "ready") return `<button class="mini-button" type="button" data-take="${order.id}">Tomar entrega</button>`;
  if (order.status === "assigned") {
    return `
      <button class="mini-button" type="button" data-progress="${order.id}">Avanzar GPS</button>
      <button class="mini-button" type="button" data-deliver="${order.id}">Entregar</button>
    `;
  }
  return `<span class="meta">${OP.escapeHtml(order.courier || "Sin asignar")}</span>`;
}

function renderOrders() {
  const orders = state.orders.filter((order) => ["ready", "assigned", "delivered"].includes(order.status));
  document.getElementById("courierOrders").innerHTML = orders.length
    ? orders
        .map(
          (order) => `
          <article class="order-card">
            <header>
              <div>
                <h4>#${order.id} - ${OP.escapeHtml(order.customer)}</h4>
                <div class="meta">Recoger en: ${OP.escapeHtml(order.pickupAddress)}</div>
                <div class="meta">Entregar en: ${OP.escapeHtml(order.deliveryAddress)} · ${order.distanceKm} km</div>
                <div class="meta">Cliente: ${OP.escapeHtml(order.customer)} · ${OP.escapeHtml(order.customerPhone || "sin telefono")}</div>
                <div class="meta">${OP.escapeHtml(OP.formatItems(order.items))}</div>
                <div class="meta">Pago: ${OP.escapeHtml(order.paymentMethod)} · Cobrar: ${OP.money.format(order.grandTotal)} · Comision: ${OP.money.format(order.courierCommission)}</div>
                <div class="meta">Nota: ${OP.escapeHtml(order.customerNote || "sin nota")}</div>
              </div>
              <span class="badge">${OP.statusLabels[order.status]}</span>
            </header>
            <footer>
              <strong>${OP.money.format(order.total)}</strong>
              ${action(order)}
            </footer>
          </article>
        `,
        )
        .join("")
    : `<div class="empty-state">No hay entregas listas.</div>`;
}

function renderSummary() {
  const session = OP.getSession("courier");
  document.getElementById("courierSession").textContent = session
    ? `Sesion verificada · usuario #${session.user_id}`
    : "Verifica tu telefono";
  document.getElementById("backendStatus").textContent = state.backendConnected
    ? "Conectado a base de datos"
    : "Modo demo local";
  const assigned = state.orders.find((order) => order.status === "assigned") || OP.activeTrackedOrder(state);
  const taken = state.orders.filter((order) => order.courier).length;
  const delivered = state.orders.filter((order) => order.status === "delivered").length;
  document.getElementById("courierTaken").textContent = taken;
  document.getElementById("courierDelivered").textContent = delivered;
  const earnings = state.orders
    .filter((order) => order.status === "delivered" && order.courier)
    .reduce((sum, order) => sum + order.courierCommission, 0);
  document.getElementById("courierEarnings").textContent = OP.money.format(earnings);
  document.getElementById("courierDistance").textContent = `${OP.remainingKm(assigned).toFixed(1)} km`;
  OP.renderPins(assigned, "courier");
  renderGpsStatus(assigned);
}

function renderGpsStatus(order) {
  const holder = document.getElementById("gpsStatus");
  if (!order?.courierLat || !order?.courierLng) {
    holder.textContent = gpsWatchId ? "Esperando primera ubicacion GPS..." : "GPS real apagado.";
    return;
  }
  holder.textContent = `Ultima ubicacion: ${Number(order.courierLat).toFixed(5)}, ${Number(order.courierLng).toFixed(5)} · precision ${Math.round(order.courierAccuracy || 0)} m`;
}

function notifyCourierChanges() {
  const readyIds = new Set(state.orders.filter((order) => order.status === "ready").map((order) => order.id));
  if (knownReadyOrders) {
    const fresh = [...readyIds].filter((id) => !knownReadyOrders.has(id));
    if (fresh.length) {
      window.OrdenaPWA?.notify("Entrega disponible", `Hay ${fresh.length} pedido${fresh.length === 1 ? "" : "s"} listo para repartir.`);
    }
  }
  knownReadyOrders = readyIds;
}

async function sendAuthCode() {
  if (!state.backendConnected) {
    document.getElementById("authHint").textContent = "Modo demo local: sin codigo.";
    return;
  }
  const payload = await OP.requestLoginCode(
    "courier",
    document.getElementById("authPhone").value,
    document.getElementById("authName").value,
  );
  document.getElementById("authHint").textContent = `Codigo demo: ${payload.demo_code}`;
}

async function verifyAuthCode() {
  if (state.backendConnected) {
    await OP.verifyLoginCode("courier", document.getElementById("authPhone").value, document.getElementById("authCode").value);
  }
  document.getElementById("authHint").textContent = "Sesion verificada.";
  await renderAll();
}

async function take(orderId) {
  if (!canUseCourierActions()) {
    document.getElementById("authHint").textContent = "Verifica tu telefono para tomar entregas.";
    return;
  }
  const order = state.orders.find((item) => item.id === Number(orderId));
  if (!order) return;
  if (state.backendConnected) {
    await OP.updateBackendOrderStatus(orderId, "assigned", {}, "courier");
  } else {
    order.status = "assigned";
    order.courier = "Repartidor Demo";
    order.gpsProgress = Math.max(order.gpsProgress || 0, 12);
    OP.save(state);
  }
  window.OrdenaPWA?.notify("Entrega tomada", `Recoge el pedido #${order.id} en ${order.pickupAddress}.`);
  await renderAll();
}

async function deliver(orderId) {
  if (!canUseCourierActions()) {
    document.getElementById("authHint").textContent = "Verifica tu telefono para entregar pedidos.";
    return;
  }
  const order = state.orders.find((item) => item.id === Number(orderId));
  if (!order) return;
  if (state.backendConnected) {
    await OP.updateBackendOrderStatus(orderId, "delivered", {}, "courier");
  } else {
    order.status = "delivered";
    order.courier = order.courier || "Repartidor Demo";
    order.gpsProgress = 100;
    OP.save(state);
  }
  await renderAll();
}

async function progress(orderId) {
  if (!canUseCourierActions()) {
    document.getElementById("authHint").textContent = "Verifica tu telefono para actualizar GPS.";
    return;
  }
  const order =
    state.orders.find((item) => item.id === Number(orderId)) ||
    state.orders.find((item) => item.status === "assigned");
  if (!order || order.status !== "assigned") return;
  const nextProgress = Math.min((order.gpsProgress || 0) + 22, 96);
  if (state.backendConnected) {
    await OP.updateBackendGps(order.id, nextProgress);
  } else {
    order.gpsProgress = nextProgress;
    OP.save(state);
  }
  await renderAll();
}

async function sendRealLocation(position) {
  const order = state.orders.find((item) => item.status === "assigned");
  if (!order) {
    document.getElementById("gpsStatus").textContent = "Toma una entrega antes de enviar GPS real.";
    return;
  }
  const nextProgress = Math.min((order.gpsProgress || 12) + 6, 96);
  const location = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
  if (state.backendConnected) {
    await OP.updateBackendGps(order.id, nextProgress, location);
  } else {
    order.gpsProgress = nextProgress;
    order.courierLat = location.lat;
    order.courierLng = location.lng;
    order.courierAccuracy = location.accuracy;
    order.courierLocationAt = new Date().toISOString();
    OP.save(state);
  }
  document.getElementById("gpsStatus").textContent = `GPS enviado: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} · precision ${Math.round(location.accuracy)} m`;
  await renderAll();
}

function startRealGps() {
  if (!canUseCourierActions()) {
    document.getElementById("authHint").textContent = "Verifica tu telefono para activar GPS.";
    return;
  }
  if (!navigator.geolocation) {
    document.getElementById("gpsStatus").textContent = "Este navegador no soporta GPS. Usa Avanzar GPS como demo.";
    return;
  }
  if (!state.orders.some((item) => item.status === "assigned")) {
    document.getElementById("gpsStatus").textContent = "Primero toma una entrega para activar GPS.";
    return;
  }
  if (gpsWatchId) return;
  document.getElementById("gpsStatus").textContent = "Solicitando permiso de ubicacion...";
  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      sendRealLocation(position).catch(() => {
        document.getElementById("gpsStatus").textContent = "No se pudo enviar la ubicacion.";
      });
    },
    (error) => {
      document.getElementById("gpsStatus").textContent = `GPS no disponible: ${error.message}`;
      stopRealGps();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
  );
}

function stopRealGps() {
  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  document.getElementById("gpsStatus").textContent = "GPS real apagado.";
}

async function renderAll() {
  state = await OP.loadSmart();
  notifyCourierChanges();
  renderOrders();
  renderSummary();
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
  if (event.target.dataset.take) take(event.target.dataset.take);
  if (event.target.dataset.deliver) deliver(event.target.dataset.deliver);
  if (event.target.dataset.progress) progress(event.target.dataset.progress);
});
document.getElementById("advanceGps").addEventListener("click", () => progress());
document.getElementById("startRealGps").addEventListener("click", startRealGps);
document.getElementById("stopRealGps").addEventListener("click", stopRealGps);
document.getElementById("sendCode").addEventListener("click", sendAuthCode);
document.getElementById("verifyCode").addEventListener("click", verifyAuthCode);
renderAll();
setInterval(autoRefresh, 4000);
