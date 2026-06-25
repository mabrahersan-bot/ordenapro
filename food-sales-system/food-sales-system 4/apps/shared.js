const OP = (() => {
  const configApiBase =
    window.DINDU_CONFIG?.apiBase ||
    window.ORDENAPRO_CONFIG?.apiBase ||
    localStorage.getItem("dindu-api-base") ||
    localStorage.getItem("ordenapro-api-base") ||
    "";
  const apiBase = configApiBase || (location.protocol === "file:" ? "http://127.0.0.1:8780" : location.origin);
  const coverageKm = 10;
  const money = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  const statusLabels = {
    pending: "Nuevo",
    preparing: "Preparando",
    ready: "Listo",
    assigned: "En camino",
    delivered: "Entregado",
    canceled: "Cancelado",
  };

  const defaultState = {
    business: {
      name: "Cocina Central",
      pickupAddress: "Portal Hidalgo 12, Centro",
      pickupLat: 19.43261,
      pickupLng: -99.13321,
      phone: "555 010 2026",
      open: true,
      blocked: false,
    },
    settings: {
      baseDeliveryFee: 15,
      perKmFee: 10,
      platformRate: 0.08,
      courierBaseCommission: 15,
      courierPerKmCommission: 10,
      serviceActive: true,
    },
    customer: {
      loggedIn: false,
      name: "Cliente mostrador",
      phone: "",
      selectedAddressId: "home",
      savedAddresses: [
        {
          id: "home",
          label: "Casa",
          address: "Av. Central 120, Col. Centro",
          reference: "Porton negro, tocar dos veces",
          lat: 19.42702,
          lng: -99.16766,
        },
      ],
    },
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
    ],
    orders: [
      {
        id: 1001,
        customer: "Mariana Lopez",
        address: "Calle Norte 44",
        deliveryAddress: "Calle Norte 44",
        pickupAddress: "Portal Hidalgo 12, Centro",
        items: [{ name: "Caja de tacos", qty: 1, price: 189, extras: [] }],
        total: 189,
        subtotal: 189,
        deliveryFee: 55,
        platformFee: 15,
        courierCommission: 43,
        grandTotal: 244,
        paymentMethod: "Efectivo",
        customerNote: "Tocar el timbre azul.",
        cancelReason: "",
        rating: 0,
        chat: [],
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
        deliveryAddress: "Mesa 8",
        pickupAddress: "Portal Hidalgo 12, Centro",
        items: [{ name: "Bowl ejecutivo", qty: 2, price: 132, extras: [] }],
        total: 264,
        subtotal: 264,
        deliveryFee: 41,
        platformFee: 21,
        courierCommission: 33,
        grandTotal: 305,
        paymentMethod: "Transferencia",
        customerNote: "Entregar en recepcion.",
        cancelReason: "",
        rating: 0,
        chat: [],
        status: "ready",
        courier: "",
        distanceKm: 3.8,
        gpsProgress: 0,
        createdAt: "20:18",
      },
    ],
    cart: [],
    nextOrderId: 1003,
    adminNotes: [],
  };

  function load() {
    const saved = localStorage.getItem("dindu-demo");
    const state = saved ? JSON.parse(saved) : structuredClone(defaultState);
    state.business = {
      ...defaultState.business,
      ...(state.business || {}),
    };
    state.settings = {
      ...defaultState.settings,
      ...(state.settings || {}),
    };
    state.customer = {
      ...defaultState.customer,
      ...(state.customer || {}),
      savedAddresses: state.customer?.savedAddresses?.length
        ? state.customer.savedAddresses
        : structuredClone(defaultState.customer.savedAddresses),
    };
    const menuSource = Array.isArray(state.menu) && state.menu.length ? state.menu : structuredClone(defaultState.menu);
    state.menu = menuSource.map((item) => ({
      photo: "",
      available: true,
      extras: [],
      ...item,
    }));
    state.orders = (state.orders || []).map((order, index) => ({
      distanceKm: index % 2 ? 3.8 : 6.2,
      gpsProgress: order.status === "delivered" ? 100 : 0,
      courier: "",
      pickupAddress: state.business.pickupAddress,
      pickupLat: state.business.pickupLat,
      pickupLng: state.business.pickupLng,
      deliveryAddress: order.address || "Sin direccion",
      deliveryLat: order.deliveryLat || order.delivery_lat || null,
      deliveryLng: order.deliveryLng || order.delivery_lng || null,
      subtotal: order.total || 0,
      deliveryFee: 0,
      platformFee: 0,
      courierCommission: 0,
      grandTotal: order.total || 0,
      paymentMethod: "Efectivo",
      customerNote: "",
      cancelReason: "",
      rating: 0,
      chat: [],
      ...order,
    }));
    state.cart = Array.isArray(state.cart) ? state.cart : [];
    state.adminNotes = state.adminNotes || [];
    state.nextOrderId = state.nextOrderId || 1003;
    return state;
  }

  function save(state) {
    localStorage.setItem("dindu-demo", JSON.stringify(state));
  }

  async function api(path, options = {}) {
    const token = options.role ? getSession(options.role)?.token : null;
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Error ${response.status}`);
    }
    return response.json();
  }

  async function backendState() {
    const payload = await api("/api/app-state");
    const local = load();
    return {
      ...local,
      ...payload.state,
      customer: local.customer,
      cart: local.cart,
      adminNotes: local.adminNotes,
      nextOrderId: local.nextOrderId,
      backendConnected: true,
    };
  }

  async function loadSmart() {
    try {
      return await backendState();
    } catch {
      return { ...load(), backendConnected: false };
    }
  }

  async function createBackendOrder(order) {
    return api("/api/app-orders", {
      role: "buyer",
      method: "POST",
      body: JSON.stringify(order),
    });
  }

  function sessionKey(role) {
    return `dindu-session-${role}`;
  }

  function getSession(role) {
    const saved = localStorage.getItem(sessionKey(role));
    return saved ? JSON.parse(saved) : null;
  }

  function hasSession(role) {
    return Boolean(getSession(role));
  }

  function saveSession(role, session) {
    localStorage.setItem(sessionKey(role), JSON.stringify(session));
  }

  function logout(role) {
    localStorage.removeItem(sessionKey(role));
  }

  async function requestLoginCode(role, phone, name) {
    return api("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ role, phone, name }),
    });
  }

  async function verifyLoginCode(role, phone, code) {
    const payload = await api("/api/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({ role, phone, code }),
    });
    saveSession(role, payload.session);
    return payload;
  }

  async function createBackendProduct(product) {
    return api("/api/products", {
      role: "merchant",
      method: "POST",
      body: JSON.stringify({
        business_id: 1,
        name: product.name,
        description: product.description,
        price: product.price,
        photo_url: product.photo,
        is_available: product.available,
        extras: product.extras,
      }),
    });
  }

  async function updateBackendProduct(product) {
    if (!product.dbId) return null;
    return api(`/api/products/${product.dbId}`, {
      role: "merchant",
      method: "PATCH",
      body: JSON.stringify({
        is_available: product.available ? 1 : 0,
      }),
    });
  }

  async function updateBackendOrderStatus(orderId, status, extra = {}, role = "admin") {
    return api(`/api/orders/${orderId}/status`, {
      role,
      method: "PATCH",
      body: JSON.stringify({ status, ...extra }),
    });
  }

  async function updateBackendGps(orderId, gpsProgress, location = null) {
    return api(`/api/orders/${orderId}/gps`, {
      role: "courier",
      method: "PATCH",
      body: JSON.stringify({
        gps_progress: gpsProgress,
        ...(location
          ? {
              courier_lat: location.lat,
              courier_lng: location.lng,
              courier_accuracy: location.accuracy || 0,
            }
          : {}),
      }),
    });
  }

  async function updateBackendBusiness(business) {
    return api("/api/business", {
      role: "merchant",
      method: "PATCH",
      body: JSON.stringify({
        name: business.name,
        pickup_address: business.pickupAddress,
        pickup_lat: business.pickupLat,
        pickup_lng: business.pickupLng,
        phone: business.phone,
        is_open: business.open ? 1 : 0,
        is_blocked: business.blocked ? 1 : 0,
      }),
    });
  }

  async function updateBackendSettings(settings) {
    return api("/api/settings", {
      role: "admin",
      method: "PATCH",
      body: JSON.stringify({
        base_delivery_fee: settings.baseDeliveryFee,
        per_km_fee: settings.perKmFee,
        platform_rate: settings.platformRate,
        courier_base_commission: settings.courierBaseCommission,
        courier_per_km_commission: settings.courierPerKmCommission,
        service_active: settings.serviceActive,
      }),
    });
  }

  async function resetBackend() {
    return api("/api/reset", {
      role: "admin",
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  function reset() {
    const state = structuredClone(defaultState);
    save(state);
    return state;
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

  function activeTrackedOrder(state) {
    return (
      state.orders.find((order) => ["assigned", "ready", "preparing", "pending"].includes(order.status)) ||
      state.orders[0]
    );
  }

  function remainingKm(order) {
    const progress = Math.min(order?.gpsProgress || 0, 100) / 100;
    return Math.max((order?.distanceKm || 0) * (1 - progress), 0);
  }

  function etaMinutes(order) {
    if (!order || order.status === "delivered") return 0;
    if (!["assigned", "ready"].includes(order.status)) return Math.ceil(order.distanceKm * 4 + 12);
    return Math.max(Math.ceil(remainingKm(order) * 4), 2);
  }

  function gpsPosition(order) {
    const distanceRatio = Math.min((order?.distanceKm || 0) / coverageKm, 1);
    const progress = Math.min(order?.gpsProgress || 0, 100) / 100;
    const homeX = 50 + 36 * distanceRatio;
    const homeY = 24 + 45 * distanceRatio;
    return {
      homeX,
      homeY,
      courierX: 50 + (homeX - 50) * progress,
      courierY: 50 + (homeY - 50) * progress,
    };
  }

  function coords(lat, lng) {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
    return { lat: parsedLat, lng: parsedLng };
  }

  function orderPickupCoords(order) {
    return coords(order?.pickupLat ?? order?.pickup_lat, order?.pickupLng ?? order?.pickup_lng);
  }

  function orderDeliveryCoords(order) {
    return coords(order?.deliveryLat ?? order?.delivery_lat, order?.deliveryLng ?? order?.delivery_lng);
  }

  function orderCourierCoords(order) {
    return coords(order?.courierLat ?? order?.courier_lat, order?.courierLng ?? order?.courier_lng);
  }

  function distanceKm(from, to) {
    const start = coords(from?.lat, from?.lng);
    const end = coords(to?.lat, to?.lng);
    if (!start || !end) return null;
    const radiusKm = 6371;
    const toRad = (value) => (value * Math.PI) / 180;
    const dLat = toRad(end.lat - start.lat);
    const dLng = toRad(end.lng - start.lng);
    const lat1 = toRad(start.lat);
    const lat2 = toRad(end.lat);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatCoords(point) {
    const parsed = coords(point?.lat, point?.lng);
    return parsed ? `${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}` : "Sin coordenadas";
  }

  function googlePointEmbedUrl(point, zoom = 16) {
    const parsed = coords(point?.lat, point?.lng);
    if (!parsed) return "";
    return `https://maps.google.com/maps?q=${parsed.lat},${parsed.lng}&z=${zoom}&output=embed`;
  }

  function googleRouteEmbedUrl(from, to) {
    const start = coords(from?.lat, from?.lng);
    const end = coords(to?.lat, to?.lng);
    if (!start || !end) return "";
    return `https://maps.google.com/maps?saddr=${start.lat},${start.lng}&daddr=${end.lat},${end.lng}&output=embed`;
  }

  function directionsUrl(from, to) {
    const start = coords(from?.lat, from?.lng);
    const end = coords(to?.lat, to?.lng);
    if (!start || !end) return "";
    return `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&travelmode=driving`;
  }

  function renderRealMap(containerId, point, label = "Ubicacion real") {
    const holder = document.getElementById(containerId);
    const parsed = coords(point?.lat, point?.lng);
    if (!holder || !parsed) return false;
    holder.classList.add("real-map-active");
    holder.innerHTML = `
      <iframe title="${escapeHtml(label)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${googlePointEmbedUrl(parsed)}"></iframe>
      <span class="real-map-chip">${escapeHtml(label)} · ${escapeHtml(formatCoords(parsed))}</span>
    `;
    return true;
  }

  function renderRouteMap(containerId, from, to, label = "Ruta en Google Maps") {
    const holder = document.getElementById(containerId);
    const start = coords(from?.lat, from?.lng);
    const end = coords(to?.lat, to?.lng);
    const url = googleRouteEmbedUrl(start, end);
    if (!holder || !url) return false;
    const distance = distanceKm(start, end);
    holder.classList.add("real-map-active");
    holder.innerHTML = `
      <iframe title="${escapeHtml(label)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${url}"></iframe>
      <span class="real-map-chip">${escapeHtml(label)}${distance ? ` · ${distance.toFixed(1)} km aprox.` : ""}</span>
    `;
    return true;
  }

  function setPin(id, x, y) {
    const pin = document.getElementById(id);
    if (!pin) return;
    pin.style.left = `${x}%`;
    pin.style.top = `${y}%`;
  }

  function renderPins(order, prefix) {
    const position = gpsPosition(order);
    setPin(`${prefix}HomePin`, position.homeX, position.homeY);
    setPin(`${prefix}CourierPin`, position.courierX, position.courierY);
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

  function calculateCosts(subtotal, distanceKm, settings) {
    const extraKm = Math.max(Math.ceil((Number(distanceKm) || 0) - coverageKm), 0);
    const deliveryFee = Math.round(settings.baseDeliveryFee + extraKm * settings.perKmFee);
    const platformFee = Math.round(subtotal * settings.platformRate);
    const courierCommission = Math.round(settings.courierBaseCommission + extraKm * settings.courierPerKmCommission);
    return {
      subtotal,
      deliveryFee,
      platformFee,
      courierCommission,
      grandTotal: subtotal + deliveryFee,
    };
  }

  function canReceiveOrders(state) {
    return Boolean(state.settings.serviceActive && state.business.open && !state.business.blocked);
  }

  return {
    coverageKm,
    money,
    statusLabels,
    load,
    save,
    loadSmart,
    createBackendOrder,
    getSession,
    hasSession,
    saveSession,
    logout,
    requestLoginCode,
    verifyLoginCode,
    createBackendProduct,
    updateBackendProduct,
    updateBackendOrderStatus,
    updateBackendGps,
    updateBackendBusiness,
    updateBackendSettings,
    resetBackend,
    reset,
    escapeHtml,
    productShort,
    formatItems,
    activeTrackedOrder,
    remainingKm,
    etaMinutes,
    coords,
    distanceKm,
    formatCoords,
    directionsUrl,
    renderRealMap,
    renderRouteMap,
    orderPickupCoords,
    orderDeliveryCoords,
    orderCourierCoords,
    gpsPosition,
    renderPins,
    parseExtras,
    calculateCosts,
    canReceiveOrders,
  };
})();
