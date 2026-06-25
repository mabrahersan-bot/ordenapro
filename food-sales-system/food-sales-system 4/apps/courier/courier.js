let state = OP.load();
let refreshing = false;
let gpsWatchId = null;
let knownReadyOrders = null;
let courierNoticeTimer = null;

function showCourierNotice(message) {
  const holder = document.getElementById("courierNotice");
  if (!holder) return;
  holder.textContent = message;
  holder.classList.add("visible");
  clearTimeout(courierNoticeTimer);
  courierNoticeTimer = setTimeout(() => holder.classList.remove("visible"), 4200);
}

function canAutoRefresh() {
  const tag = document.activeElement?.tagName;
  return !["INPUT", "SELECT", "TEXTAREA"].includes(tag);
}

function canUseCourierActions() {
  return !state.backendConnected || OP.hasSession("courier");
}

function deliveryStep(order) {
  const progress = order?.gpsProgress || 0;
  if (!order) return "none";
  if (order.status === "ready") return "available";
  if (order.status === "delivered") return "delivered";
  if (progress >= 72) return "to-customer";
  if (progress >= 46) return "picked-up";
  if (progress >= 24) return "at-store";
  return "accepted";
}

function stepLabel(order) {
  const labels = {
    available: "Disponible",
    accepted: "Aceptada",
    "at-store": "En negocio",
    "picked-up": "Pedido recogido",
    "to-customer": "Camino al cliente",
    delivered: "Entregado",
  };
  return labels[deliveryStep(order)] || "Sin entrega";
}

function routeText(order) {
  if (!order) return "Toma una entrega para ver la ruta.";
  const courierPoint = OP.orderCourierCoords(order);
  const deliveryPoint = OP.orderDeliveryCoords(order);
  const realRemaining = OP.distanceKm(courierPoint, deliveryPoint);
  const distanceText = realRemaining ? `${realRemaining.toFixed(1)} km reales restantes` : `${order.distanceKm} km estimados`;
  return `Recoge en ${order.pickupAddress}. Entrega en ${order.deliveryAddress}. Distancia ${distanceText}.`;
}

function moneyBreakdown(order) {
  return `
    <div class="courier-money">
      <span><small>Cobrar cliente</small><strong>${OP.money.format(order.grandTotal)}</strong></span>
      <span><small>Entregar negocio</small><strong>${OP.money.format(order.total)}</strong></span>
      <span><small>Tu comision</small><strong>${OP.money.format(order.courierCommission)}</strong></span>
    </div>
  `;
}

function deliveryChecklist(order) {
  const step = deliveryStep(order);
  const done = {
    accepted: ["accepted", "at-store", "picked-up", "to-customer", "delivered"].includes(step),
    "at-store": ["at-store", "picked-up", "to-customer", "delivered"].includes(step),
    "picked-up": ["picked-up", "to-customer", "delivered"].includes(step),
    "to-customer": ["to-customer", "delivered"].includes(step),
    delivered: step === "delivered",
  };
  return `
    <div class="delivery-steps">
      <span class="${done.accepted ? "done" : ""}">1. Aceptada</span>
      <span class="${done["at-store"] ? "done" : ""}">2. Llegue al negocio</span>
      <span class="${done["picked-up"] ? "done" : ""}">3. Pedido recogido</span>
      <span class="${done["to-customer"] ? "done" : ""}">4. En camino</span>
      <span class="${done.delivered ? "done" : ""}">5. Entregado</span>
    </div>
  `;
}

function action(order) {
  if (!canUseCourierActions()) {
    return `<span class="meta">Verifica tu telefono para tomar entregas.</span>`;
  }
  if (order.status === "ready") return `<button class="mini-button" type="button" data-take="${order.id}">Tomar entrega</button>`;
  if (order.status === "assigned") {
    const step = deliveryStep(order);
    const nextLabel =
      step === "accepted"
        ? "Llegue al negocio"
        : step === "at-store"
          ? "Recogi pedido"
          : step === "picked-up"
            ? "Voy al cliente"
            : "Avanzar GPS";
    return `
      <button class="mini-button" type="button" data-progress="${order.id}">${nextLabel}</button>
      <button class="mini-button" type="button" data-deliver="${order.id}">Entregar</button>
    `;
  }
  return `<span class="meta">${OP.escapeHtml(order.courier || "Sin asignar")}</span>`;
}

function renderOrders() {
  const active = state.orders.find((order) => order.status === "assigned");
  const readyOrders = state.orders.filter((order) => order.status === "ready");
  const deliveredOrders = state.orders.filter((order) => order.status === "delivered" && order.courier).slice(0, 3);
  document.getElementById("activeDelivery").innerHTML = active
    ? `
      <article class="order-card courier-active">
        <header>
          <div>
            <p class="eyebrow">Entrega activa</p>
            <h4>#${active.id} - ${OP.escapeHtml(active.customer)}</h4>
            <div class="meta">Paso actual: ${stepLabel(active)} · ETA ${OP.etaMinutes(active)} min</div>
            <div class="meta">${OP.escapeHtml(routeText(active))}</div>
            <div class="meta">Cliente: ${OP.escapeHtml(active.customerPhone || "sin telefono")} · Nota: ${OP.escapeHtml(active.customerNote || "sin nota")}</div>
            <div class="meta">${OP.escapeHtml(OP.formatItems(active.items))}</div>
          </div>
          <span class="badge ${active.status}">${OP.statusLabels[active.status]}</span>
        </header>
        ${moneyBreakdown(active)}
        ${deliveryChecklist(active)}
        <footer>
          <strong>Restan ${OP.remainingKm(active).toFixed(1)} km</strong>
          ${action(active)}
        </footer>
      </article>
    `
    : `<div class="empty-state compact">No tienes una entrega activa.</div>`;

  document.getElementById("courierOrders").innerHTML = `
    <div class="courier-section-title">
      <strong>Disponibles para tomar</strong>
      <span>${readyOrders.length}</span>
    </div>
    ${
      readyOrders.length
        ? readyOrders
            .map(
              (order) => `
          <article class="order-card courier-job">
            <header>
              <div>
                <h4>#${order.id} - ${OP.escapeHtml(order.customer)}</h4>
                <div class="meta">Recoger en: ${OP.escapeHtml(order.pickupAddress)}</div>
                <div class="meta">Entregar en: ${OP.escapeHtml(order.deliveryAddress)} · ${order.distanceKm} km</div>
                <div class="meta">Cliente: ${OP.escapeHtml(order.customer)} · ${OP.escapeHtml(order.customerPhone || "sin telefono")}</div>
                <div class="meta">${OP.escapeHtml(OP.formatItems(order.items))}</div>
                <div class="meta">Pago: ${OP.escapeHtml(order.paymentMethod)} · ETA ${OP.etaMinutes(order)} min</div>
                <div class="meta">Nota: ${OP.escapeHtml(order.customerNote || "sin nota")}</div>
              </div>
              <span class="badge ${order.status}">${OP.statusLabels[order.status]}</span>
            </header>
            ${moneyBreakdown(order)}
            <footer>
              <strong>${order.distanceKm} km</strong>
              ${action(order)}
            </footer>
          </article>
        `,
            )
            .join("")
        : `<div class="empty-state compact">No hay pedidos listos por ahora.</div>`
    }
    <div class="courier-section-title">
      <strong>Entregadas recientes</strong>
      <span>${deliveredOrders.length}</span>
    </div>
    ${
      deliveredOrders.length
        ? deliveredOrders
            .map(
              (order) => `
          <article class="order-card courier-job delivered">
            <header>
              <div>
                <h4>#${order.id} - ${OP.escapeHtml(order.customer)}</h4>
                <div class="meta">Cobrado: ${OP.money.format(order.grandTotal)} · Comision: ${OP.money.format(order.courierCommission)}</div>
              </div>
              <span class="badge delivered">${OP.statusLabels[order.status]}</span>
            </header>
          </article>
        `,
            )
            .join("")
        : `<div class="empty-state compact">Aun no hay entregas cerradas.</div>`
    }
  `;
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
  const active = state.orders.find((order) => order.status === "assigned");
  const ready = state.orders.filter((order) => order.status === "ready").length;
  const taken = state.orders.filter((order) => order.courier).length;
  const delivered = state.orders.filter((order) => order.status === "delivered").length;
  document.getElementById("courierTaken").textContent = taken;
  document.getElementById("courierDelivered").textContent = delivered;
  const earnings = state.orders
    .filter((order) => order.status === "delivered" && order.courier)
    .reduce((sum, order) => sum + order.courierCommission, 0);
  document.getElementById("courierEarnings").textContent = OP.money.format(earnings);
  document.getElementById("courierDistance").textContent = `${OP.remainingKm(assigned).toFixed(1)} km`;
  document.getElementById("courierShiftStatus").textContent = active ? "En entrega" : "Disponible";
  document.getElementById("courierShiftStatus").classList.toggle("closed", Boolean(active));
  document.getElementById("courierKpis").innerHTML = `
    <span><strong>${ready}</strong> disponibles</span>
    <span><strong>${active ? OP.money.format(active.grandTotal) : "$0"}</strong> a cobrar</span>
    <span><strong>${active ? OP.money.format(active.courierCommission) : "$0"}</strong> comision activa</span>
  `;
  document.getElementById("routeMini").textContent = routeText(active);
  const courierPoint = OP.orderCourierCoords(assigned);
  const pickupPoint = OP.orderPickupCoords(assigned);
  const deliveryPoint = OP.orderDeliveryCoords(assigned);
  if (!OP.renderRealMap("courierMap", courierPoint || pickupPoint || deliveryPoint, courierPoint ? "Tu GPS en vivo" : "Ruta de entrega")) {
    OP.renderPins(assigned, "courier");
  }
  renderGpsStatus(assigned);
}

function renderGpsStatus(order) {
  const holder = document.getElementById("gpsStatus");
  if (!order?.courierLat || !order?.courierLng) {
    holder.textContent = gpsWatchId ? "Esperando primera ubicacion GPS..." : "GPS real apagado.";
    return;
  }
  const route = OP.directionsUrl(OP.orderCourierCoords(order), OP.orderDeliveryCoords(order));
  holder.innerHTML = `
    Ultima ubicacion: ${Number(order.courierLat).toFixed(5)}, ${Number(order.courierLng).toFixed(5)} · precision ${Math.round(order.courierAccuracy || 0)} m
    ${route ? `<a class="map-link" target="_blank" rel="noopener" href="${route}">Abrir ruta al cliente</a>` : ""}
  `;
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
  document.getElementById("authHint").textContent = payload.demo_code
    ? `Codigo de prueba: ${payload.demo_code}`
    : "Codigo enviado por SMS.";
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
  showCourierNotice(`Entrega #${order.id} tomada. Cobra ${OP.money.format(order.grandTotal)} al cliente.`);
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
  if (!confirm(`Confirmar entrega #${order.id}? Debiste cobrar ${OP.money.format(order.grandTotal)} al cliente.`)) return;
  if (state.backendConnected) {
    await OP.updateBackendOrderStatus(orderId, "delivered", {}, "courier");
  } else {
    order.status = "delivered";
    order.courier = order.courier || "Repartidor Demo";
    order.gpsProgress = 100;
    OP.save(state);
  }
  showCourierNotice(`Entrega #${order.id} cerrada. Comision: ${OP.money.format(order.courierCommission)}.`);
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
  const current = order.gpsProgress || 0;
  const nextProgress = current < 24 ? 24 : current < 46 ? 46 : current < 72 ? 72 : Math.min(current + 18, 96);
  if (state.backendConnected) {
    await OP.updateBackendGps(order.id, nextProgress);
  } else {
    order.gpsProgress = nextProgress;
    OP.save(state);
  }
  showCourierNotice(`Pedido #${order.id}: ${stepLabel({ ...order, gpsProgress: nextProgress })}.`);
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
