# Publicar Dindu para iPhone

Para instalar en iPhone, Dindu necesita una liga publica con HTTPS.

## Lo que ya queda listo

- Pagina de instalacion: `instalar.html`
- Apps separadas: comprador, negocio, repartidor y admin.
- PWA instalable con manifiestos separados para comprador, negocio, repartidor y admin.
- Configuracion para apuntar a un backend publico desde `apps/config.js`.
- Backend preparado para servidor publico con variables `HOST`, `PORT` y `ORDENAPRO_DB`.

## Cuando tengas la URL del backend

Edita `apps/config.js`:

```js
window.DINDU_CONFIG = {
  apiBase: "https://TU-BACKEND.com"
};
```

## Como se instala en iPhone

1. Abrir `https://TU-DOMINIO.com/instalar.html` en Safari.
2. Entrar a la app que corresponda: comprador, negocio, repartidor o admin.
3. Tocar Compartir.
4. Tocar Agregar a pantalla de inicio.
5. Confirmar con Agregar.

## Backend en produccion

El servidor acepta estas variables:

```bash
HOST=0.0.0.0
PORT=8780
ORDENAPRO_DB=/ruta/dindu.db
python3 backend/server.py
```

En un hosting real, normalmente `PORT` lo pone el proveedor automaticamente.

## Render

Sigue la guia preparada en `RENDER-PASOS.md`.
