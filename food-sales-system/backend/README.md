# OrdenaPro Backend

Primera base tecnica para convertir el prototipo en sistema real.

## Que incluye

- SQLite para guardar datos reales.
- Usuarios por rol: comprador, negocio, repartidor y admin.
- Negocio con direccion de recoleccion, cobertura, abierto/bloqueado.
- Productos con extras.
- Direcciones del comprador.
- Pedidos con efectivo, envio, comision, estado, GPS y calificacion.
- Configuracion de tarifas y comisiones.
- Endpoints JSON para conectar las apps.

## Correr local

Desde esta carpeta:

```bash
python3 server.py
```

Servidor:

```text
http://127.0.0.1:8780
```

Prueba rapida:

```text
http://127.0.0.1:8780/api/health
```

## Correr en servidor publico

```bash
HOST=0.0.0.0 PORT=8780 python3 server.py
```

Tambien puedes elegir donde guardar la base:

```bash
ORDENAPRO_DB=/ruta/ordenapro.db HOST=0.0.0.0 PORT=8780 python3 server.py
```

## Endpoints principales

- `POST /api/login`
- `GET /api/products`
- `POST /api/products`
- `POST /api/addresses`
- `POST /api/orders`
- `GET /api/orders`
- `PATCH /api/orders/{id}/status`
- `PATCH /api/orders/{id}/gps`
- `PATCH /api/orders/{id}/rating`
- `GET /api/business`
- `PATCH /api/business`
- `GET /api/settings`
- `PATCH /api/settings`
- `POST /api/admin/notes`

## Conectar las apps

Las apps leen `apps/config.js`. Cuando el backend tenga URL publica, coloca ahi:

```js
window.ORDENAPRO_CONFIG = {
  apiBase: "https://TU-BACKEND.com"
};
```
