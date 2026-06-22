# Subir OrdenaPro a Render

Necesitas dos servicios en Render:

1. `ordenapro-api`: backend/base de datos.
2. `ordenapro-apps`: las apps instalables para iPhone.

## Camino recomendado para probar sin pagar

### 1. Subir el proyecto a GitHub

Render normalmente trabaja conectando un repositorio. Crea un repo en GitHub y sube la carpeta `food-sales-system`.

### 2. Crear el backend

En Render:

- New > Web Service
- Connect GitHub
- Elige el repo
- Name: `ordenapro-api`
- Runtime: `Python`
- Build Command:

```bash
pip install -r backend/requirements.txt
```

- Start Command:

```bash
python backend/server.py
```

- Environment Variables:

```text
HOST=0.0.0.0
```

Render te dara una liga parecida a:

```text
https://ordenapro-api.onrender.com
```

Prueba:

```text
https://ordenapro-api.onrender.com/api/health
```

### 3. Pegar la URL del backend

Edita `apps/config.js`:

```js
window.ORDENAPRO_CONFIG = {
  apiBase: "https://ordenapro-api.onrender.com"
};
```

Sube ese cambio a GitHub.

### 4. Crear las apps

En Render:

- New > Static Site
- Connect GitHub
- Elige el mismo repo
- Name: `ordenapro-apps`
- Build Command: dejar vacio
- Publish Directory:

```text
.
```

Render te dara una liga parecida a:

```text
https://ordenapro-apps.onrender.com/instalar.html
```

Esa es la liga que abres en Safari del iPhone.

## Instalar en iPhone

1. Abre `https://ordenapro-apps.onrender.com/instalar.html` en Safari.
2. Entra a Comprador, Negocio, Repartidor o Admin.
3. Toca Compartir.
4. Toca Agregar a pantalla de inicio.
5. Toca Agregar.

## Importante sobre datos reales

En plan gratis, la base SQLite puede reiniciarse cuando Render reinicia el servicio. Sirve para probar e instalar.

Para operar con pedidos reales necesitas una de estas dos opciones:

- Activar un disco persistente en Render y usar:

```text
ORDENAPRO_DB=/var/data/ordenapro.db
```

- O migrar la base a Postgres.

Para vender de verdad, recomiendo Postgres.
