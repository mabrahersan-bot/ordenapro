(() => {
  let installPrompt = null;
  const scriptBase = document.currentScript?.src || new URL("./pwa.js", window.location.href).href;

  function notify(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const iconUrl = new URL("../assets/icon.svg", scriptBase).href;
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body,
          icon: iconUrl,
          badge: iconUrl
        });
      });
    } else {
      new Notification(title, { body, icon: iconUrl });
    }
  }

  function pwaStatusText() {
    if (!("serviceWorker" in navigator)) return "Instalacion no disponible en este navegador.";
    if (window.matchMedia("(display-mode: standalone)").matches) return "App instalada.";
    return installPrompt ? "Lista para instalar." : "Usa el menu del navegador para agregarla al inicio.";
  }

  function updateStatus() {
    document.querySelectorAll("[data-pwa-status]").forEach((node) => {
      node.textContent = pwaStatusText();
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    updateStatus();
  });

  window.OrdenaPWA = {
    notify,
    async install() {
      if (!installPrompt) {
        updateStatus();
        return;
      }
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      updateStatus();
    },
    async enableNotifications() {
      if (!("Notification" in window)) return "Este navegador no soporta notificaciones.";
      const permission = await Notification.requestPermission();
      return permission === "granted" ? "Notificaciones activadas." : "Notificaciones no activadas.";
    },
    updateStatus
  };

  if ("serviceWorker" in navigator) {
    const swUrl = new URL("../sw.js", scriptBase);
    navigator.serviceWorker.register(swUrl).finally(updateStatus);
  }

  document.addEventListener("click", async (event) => {
    if (event.target.matches("[data-install-app]")) {
      await window.OrdenaPWA.install();
    }
    if (event.target.matches("[data-enable-notifications]")) {
      const message = await window.OrdenaPWA.enableNotifications();
      const target = document.querySelector("[data-pwa-status]");
      if (target) target.textContent = message;
    }
  });

  updateStatus();
})();
