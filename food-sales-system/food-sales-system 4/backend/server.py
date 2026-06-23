#!/usr/bin/env python3
import json
import os
import random
import secrets
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("ORDENAPRO_DB", ROOT / "dindu.db"))


def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript((ROOT / "schema.sql").read_text())
        ensure_columns(db, "orders", {
            "courier_lat": "REAL",
            "courier_lng": "REAL",
            "courier_accuracy": "REAL",
            "courier_location_at": "TEXT",
        })
        db.executescript((ROOT / "seed.sql").read_text())


def ensure_columns(db, table, columns):
    existing = {row["name"] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
    for name, definition in columns.items():
        if name not in existing:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def row_to_dict(row):
    return {key: row[key] for key in row.keys()}


def money_to_cents(value):
    return int(round(float(value) * 100))


def cents(value):
    return int(value or 0)


def calculate_costs(subtotal_cents, distance_km, settings):
    delivery_fee = round(cents(settings["base_delivery_fee_cents"]) + distance_km * cents(settings["per_km_fee_cents"]))
    platform_fee = round(subtotal_cents * float(settings["platform_rate"]))
    courier_commission = round(
        cents(settings["courier_base_commission_cents"])
        + distance_km * cents(settings["courier_per_km_commission_cents"])
    )
    return {
        "subtotal_cents": subtotal_cents,
        "delivery_fee_cents": delivery_fee,
        "platform_fee_cents": platform_fee,
        "courier_commission_cents": courier_commission,
        "total_cents": subtotal_cents + delivery_fee,
    }


class Api(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def auth_token(self):
        header = self.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            return header.split(" ", 1)[1].strip()
        return self.headers.get("X-Session-Token", "").strip()

    def require_role(self, *roles):
        token = self.auth_token()
        if not token:
            self.send_json({"error": "Sesion requerida"}, 401)
            return None
        with connect() as db:
            session = db.execute(
                """
                SELECT sessions.*, users.status
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
                """,
                (token,),
            ).fetchone()
        if not session or session["status"] != "active":
            self.send_json({"error": "Sesion invalida o expirada"}, 401)
            return None
        if roles and session["role"] not in roles:
            self.send_json({"error": "Permiso insuficiente"}, 403)
            return None
        return session

    def do_OPTIONS(self):
        self.send_json({"ok": True})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        try:
            if path == "/api/health":
                return self.send_json({"ok": True, "database": str(DB_PATH)})
            if path == "/api/products":
                return self.get_products()
            if path == "/api/orders":
                return self.get_orders(query)
            if path == "/api/settings":
                return self.get_settings()
            if path == "/api/business":
                return self.get_business()
            if path == "/api/app-state":
                return self.get_app_state()
            return self.send_json({"error": "Ruta no encontrada"}, 404)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/login":
                return self.login()
            if path == "/api/auth/request-code":
                return self.request_login_code()
            if path == "/api/auth/verify-code":
                return self.verify_login_code()
            if path == "/api/addresses":
                return self.create_address()
            if path == "/api/products":
                if not self.require_role("merchant", "admin"):
                    return
                return self.create_product()
            if path == "/api/orders":
                if not self.require_role("buyer", "admin"):
                    return
                return self.create_order()
            if path == "/api/app-orders":
                session = self.require_role("buyer")
                if not session:
                    return
                return self.create_app_order()
            if path == "/api/admin/notes":
                if not self.require_role("admin"):
                    return
                return self.create_admin_note()
            if path == "/api/reset":
                if not self.require_role("admin"):
                    return
                return self.reset_database()
            return self.send_json({"error": "Ruta no encontrada"}, 404)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)

    def do_PATCH(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path.startswith("/api/orders/") and path.endswith("/status"):
                return self.update_order_status(int(path.split("/")[3]))
            if path.startswith("/api/orders/") and path.endswith("/gps"):
                if not self.require_role("courier", "admin"):
                    return
                return self.update_order_gps(int(path.split("/")[3]))
            if path.startswith("/api/orders/") and path.endswith("/rating"):
                if not self.require_role("buyer"):
                    return
                return self.rate_order(int(path.split("/")[3]))
            if path.startswith("/api/products/"):
                if not self.require_role("merchant", "admin"):
                    return
                return self.update_product(int(path.split("/")[3]))
            if path == "/api/settings":
                if not self.require_role("admin"):
                    return
                return self.update_settings()
            if path == "/api/business":
                if not self.require_role("merchant", "admin"):
                    return
                return self.update_business()
            return self.send_json({"error": "Ruta no encontrada"}, 404)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)

    def login(self):
        data = self.read_json()
        role = data.get("role", "buyer")
        phone = data.get("phone", "")
        name = data.get("name", "Usuario")
        with connect() as db:
            user = db.execute("SELECT * FROM users WHERE role = ? AND phone = ?", (role, phone)).fetchone()
            if not user:
                cur = db.execute("INSERT INTO users (role, name, phone) VALUES (?, ?, ?)", (role, name, phone))
                user = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
            return self.send_json({"user": row_to_dict(user)})

    def request_login_code(self):
        data = self.read_json()
        role = data.get("role", "buyer")
        phone = "".join(ch for ch in data.get("phone", "") if ch.isdigit())
        name = data.get("name", "Usuario")
        if not phone:
            return self.send_json({"error": "Telefono requerido"}, 400)
        code = f"{random.randint(100000, 999999)}"
        with connect() as db:
            db.execute(
                """
                INSERT INTO login_codes (role, phone, code, name, expires_at)
                VALUES (?, ?, ?, ?, datetime('now', '+10 minutes'))
                """,
                (role, phone, code, name),
            )
        return self.send_json({
            "ok": True,
            "phone": phone,
            "demo_code": code,
            "message": "Codigo demo generado. En produccion se enviaria por SMS.",
        })

    def verify_login_code(self):
        data = self.read_json()
        role = data.get("role", "buyer")
        phone = "".join(ch for ch in data.get("phone", "") if ch.isdigit())
        code = data.get("code", "").strip()
        with connect() as db:
            login_code = db.execute(
                """
                SELECT * FROM login_codes
                WHERE role = ? AND phone = ? AND code = ? AND used_at IS NULL AND expires_at > datetime('now')
                ORDER BY id DESC
                LIMIT 1
                """,
                (role, phone, code),
            ).fetchone()
            if not login_code:
                return self.send_json({"error": "Codigo invalido o expirado"}, 401)
            db.execute("UPDATE login_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?", (login_code["id"],))
            user = db.execute("SELECT * FROM users WHERE role = ? AND phone = ?", (role, phone)).fetchone()
            if not user:
                cur = db.execute(
                    "INSERT INTO users (role, name, phone) VALUES (?, ?, ?)",
                    (role, login_code["name"] or "Usuario", phone),
                )
                user = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
            elif login_code["name"]:
                db.execute("UPDATE users SET name = ? WHERE id = ?", (login_code["name"], user["id"]))
                user = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
            token = secrets.token_urlsafe(32)
            db.execute(
                """
                INSERT INTO sessions (token, user_id, role, expires_at)
                VALUES (?, ?, ?, datetime('now', '+30 days'))
                """,
                (token, user["id"], role),
            )
            return self.send_json({
                "user": row_to_dict(user),
                "session": {"token": token, "user_id": user["id"], "role": role},
            })

    def get_products(self):
        with connect() as db:
            products = []
            for product in db.execute("SELECT * FROM products ORDER BY id DESC").fetchall():
                item = row_to_dict(product)
                item["extras"] = [
                    row_to_dict(row)
                    for row in db.execute("SELECT * FROM product_extras WHERE product_id = ?", (product["id"],)).fetchall()
                ]
                products.append(item)
            return self.send_json({"products": products})

    def get_app_state(self):
        with connect() as db:
            business = db.execute("SELECT * FROM businesses WHERE id = 1").fetchone()
            settings = db.execute("SELECT * FROM platform_settings WHERE id = 1").fetchone()
            products = []
            for product in db.execute("SELECT * FROM products ORDER BY id DESC").fetchall():
                products.append(
                    {
                        "id": f"db-{product['id']}",
                        "dbId": product["id"],
                        "name": product["name"],
                        "description": product["description"],
                        "price": product["price_cents"] / 100,
                        "short": "".join(part[0] for part in product["name"].split()[:2]).upper(),
                        "photo": product["photo_url"] or "",
                        "available": bool(product["is_available"]),
                        "extras": [
                            {
                                "id": f"db-extra-{row['id']}",
                                "dbId": row["id"],
                                "name": row["name"],
                                "price": row["price_cents"] / 100,
                            }
                            for row in db.execute(
                                "SELECT * FROM product_extras WHERE product_id = ?",
                                (product["id"],),
                            ).fetchall()
                        ],
                    }
                )
            orders = []
            for order in db.execute(
                """
                SELECT orders.*, users.name AS buyer_name, users.phone AS buyer_phone, couriers.name AS courier_name
                FROM orders
                JOIN users ON users.id = orders.buyer_user_id
                LEFT JOIN users couriers ON couriers.id = orders.courier_user_id
                ORDER BY orders.id DESC
                """
            ).fetchall():
                items = []
                for item in db.execute("SELECT * FROM order_items WHERE order_id = ?", (order["id"],)).fetchall():
                    items.append(
                        {
                            "name": item["name"],
                            "qty": item["qty"],
                            "price": item["unit_price_cents"] / 100,
                            "extras": json.loads(item["extras_json"] or "[]"),
                        }
                    )
                orders.append(
                    {
                        "id": order["id"],
                        "customer": order["buyer_name"],
                        "customerPhone": order["buyer_phone"] or "",
                        "address": order["delivery_address"],
                        "deliveryAddress": order["delivery_address"],
                        "pickupAddress": order["pickup_address"],
                        "items": items,
                        "total": order["subtotal_cents"] / 100,
                        "subtotal": order["subtotal_cents"] / 100,
                        "deliveryFee": order["delivery_fee_cents"] / 100,
                        "platformFee": order["platform_fee_cents"] / 100,
                        "courierCommission": order["courier_commission_cents"] / 100,
                        "grandTotal": order["total_cents"] / 100,
                        "paymentMethod": "Efectivo",
                        "customerNote": order["customer_note"] or "",
                        "cancelReason": order["cancel_reason"] or "",
                        "rating": order["rating"] or 0,
                        "chat": [],
                        "status": order["status"],
                        "courier": order["courier_name"] or "",
                        "distanceKm": order["distance_km"],
                        "gpsProgress": order["gps_progress"],
                        "courierLat": order["courier_lat"],
                        "courierLng": order["courier_lng"],
                        "courierAccuracy": order["courier_accuracy"],
                        "courierLocationAt": order["courier_location_at"] or "",
                        "createdAt": order["created_at"],
                    }
                )
            return self.send_json(
                {
                    "state": {
                        "business": {
                            "name": business["name"],
                            "pickupAddress": business["pickup_address"],
                            "phone": business["phone"],
                            "open": bool(business["is_open"]),
                            "blocked": bool(business["is_blocked"]),
                        },
                        "settings": {
                            "baseDeliveryFee": settings["base_delivery_fee_cents"] / 100,
                            "perKmFee": settings["per_km_fee_cents"] / 100,
                            "platformRate": settings["platform_rate"],
                            "courierBaseCommission": settings["courier_base_commission_cents"] / 100,
                            "courierPerKmCommission": settings["courier_per_km_commission_cents"] / 100,
                            "serviceActive": bool(settings["service_active"]),
                        },
                        "menu": products,
                        "orders": orders,
                    }
                }
            )

    def create_product(self):
        data = self.read_json()
        with connect() as db:
            cur = db.execute(
                """
                INSERT INTO products (business_id, name, description, price_cents, photo_url, is_available)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    data.get("business_id", 1),
                    data["name"],
                    data.get("description", ""),
                    money_to_cents(data.get("price", 0)),
                    data.get("photo_url", ""),
                    1 if data.get("is_available", True) else 0,
                ),
            )
            product_id = cur.lastrowid
            for extra in data.get("extras", []):
                db.execute(
                    "INSERT INTO product_extras (product_id, name, price_cents) VALUES (?, ?, ?)",
                    (product_id, extra["name"], money_to_cents(extra.get("price", 0))),
                )
            return self.send_json({"id": product_id}, 201)

    def update_product(self, product_id):
        data = self.read_json()
        with connect() as db:
            product = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
            if not product:
                return self.send_json({"error": "Producto no encontrado"}, 404)
            db.execute(
                """
                UPDATE products
                SET name = COALESCE(?, name), description = COALESCE(?, description),
                    price_cents = COALESCE(?, price_cents), photo_url = COALESCE(?, photo_url),
                    is_available = COALESCE(?, is_available)
                WHERE id = ?
                """,
                (
                    data.get("name"),
                    data.get("description"),
                    money_to_cents(data["price"]) if "price" in data else None,
                    data.get("photo_url"),
                    data.get("is_available"),
                    product_id,
                ),
            )
            return self.send_json({"ok": True})

    def create_address(self):
        data = self.read_json()
        with connect() as db:
            cur = db.execute(
                """
                INSERT INTO buyer_addresses (buyer_user_id, label, address, reference, is_default)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    data["buyer_user_id"],
                    data.get("label", "Direccion"),
                    data["address"],
                    data.get("reference", ""),
                    1 if data.get("is_default") else 0,
                ),
            )
            return self.send_json({"id": cur.lastrowid}, 201)

    def create_order(self):
        data = self.read_json()
        items = data["items"]
        distance_km = float(data.get("distance_km", 1))
        subtotal = sum(money_to_cents(item["unit_price"]) * int(item.get("qty", 1)) for item in items)
        with connect() as db:
            settings = db.execute("SELECT * FROM platform_settings WHERE id = 1").fetchone()
            business = db.execute("SELECT * FROM businesses WHERE id = ?", (data.get("business_id", 1),)).fetchone()
            if not business or not business["is_open"] or business["is_blocked"]:
                return self.send_json({"error": "El negocio no puede recibir pedidos"}, 409)
            if distance_km > float(business["coverage_km"]):
                return self.send_json({"error": "Direccion fuera de cobertura"}, 409)
            costs = calculate_costs(subtotal, distance_km, settings)
            cur = db.execute(
                """
                INSERT INTO orders (
                  buyer_user_id, business_id, pickup_address, delivery_address, delivery_reference,
                  distance_km, payment_method, subtotal_cents, delivery_fee_cents, platform_fee_cents,
                  courier_commission_cents, total_cents, customer_note
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data["buyer_user_id"],
                    data.get("business_id", 1),
                    business["pickup_address"],
                    data["delivery_address"],
                    data.get("delivery_reference", ""),
                    distance_km,
                    data.get("payment_method", "cash"),
                    costs["subtotal_cents"],
                    costs["delivery_fee_cents"],
                    costs["platform_fee_cents"],
                    costs["courier_commission_cents"],
                    costs["total_cents"],
                    data.get("customer_note", ""),
                ),
            )
            order_id = cur.lastrowid
            for item in items:
                db.execute(
                    """
                    INSERT INTO order_items (order_id, product_id, name, qty, unit_price_cents, extras_json)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        order_id,
                        item.get("product_id"),
                        item["name"],
                        int(item.get("qty", 1)),
                        money_to_cents(item["unit_price"]),
                        json.dumps(item.get("extras", []), ensure_ascii=False),
                    ),
                )
            return self.send_json({"id": order_id, **costs}, 201)

    def create_app_order(self):
        data = self.read_json()
        session = self.require_role("buyer")
        if not session:
            return
        with connect() as db:
            buyer_id = session["user_id"]
            db.execute(
                "UPDATE users SET name = ?, phone = COALESCE(NULLIF(?, ''), phone) WHERE id = ?",
                (data.get("customer_name", "Cliente"), data.get("customer_phone", ""), buyer_id),
            )
        return self.create_order_from_app_payload(data, buyer_id)

    def create_order_from_app_payload(self, data, buyer_id):
        items = []
        for item in data["items"]:
            product_id = item.get("dbId") or item.get("product_id")
            items.append(
                {
                    "product_id": product_id,
                    "name": item["name"],
                    "qty": item.get("qty", 1),
                    "unit_price": item["unit_price"],
                    "extras": item.get("extras", []),
                }
            )
        payload = {
            "buyer_user_id": buyer_id,
            "business_id": 1,
            "delivery_address": data["delivery_address"],
            "delivery_reference": data.get("delivery_reference", ""),
            "distance_km": data.get("distance_km", 1),
            "payment_method": "cash",
            "customer_note": data.get("customer_note", ""),
            "items": items,
        }
        original_read_json = self.read_json
        self.read_json = lambda: payload
        try:
            return self.create_order()
        finally:
            self.read_json = original_read_json

    def get_orders(self, query):
        status = query.get("status", [None])[0]
        sql = "SELECT orders.*, users.name AS buyer_name, users.phone AS buyer_phone FROM orders JOIN users ON users.id = orders.buyer_user_id"
        params = []
        if status:
            sql += " WHERE orders.status = ?"
            params.append(status)
        sql += " ORDER BY orders.id DESC"
        with connect() as db:
            orders = []
            for order in db.execute(sql, params).fetchall():
                item = row_to_dict(order)
                item["items"] = [
                    row_to_dict(row)
                    for row in db.execute("SELECT * FROM order_items WHERE order_id = ?", (order["id"],)).fetchall()
                ]
                orders.append(item)
            return self.send_json({"orders": orders})

    def update_order_status(self, order_id):
        data = self.read_json()
        status = data["status"]
        required = {
            "pending": ("admin",),
            "preparing": ("merchant", "admin"),
            "ready": ("merchant", "admin"),
            "assigned": ("courier", "admin"),
            "delivered": ("courier", "admin"),
            "canceled": ("buyer", "merchant", "admin"),
        }.get(status, ("admin",))
        session = self.require_role(*required)
        if not session:
            return
        courier_user_id = data.get("courier_user_id")
        cancel_reason = data.get("cancel_reason")
        if status == "assigned" and session["role"] == "courier":
            courier_user_id = session["user_id"]
        with connect() as db:
            if status == "assigned":
                db.execute(
                    """
                    UPDATE orders
                    SET status = ?, courier_user_id = COALESCE(?, courier_user_id), gps_progress = MAX(gps_progress, 12), updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (status, courier_user_id, order_id),
                )
            else:
                db.execute(
                    """
                    UPDATE orders
                    SET status = ?, cancel_reason = COALESCE(?, cancel_reason), gps_progress = CASE WHEN ? = 'delivered' THEN 100 ELSE gps_progress END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (status, cancel_reason, status, order_id),
                )
            return self.send_json({"ok": True})

    def update_order_gps(self, order_id):
        data = self.read_json()
        progress = max(0, min(100, int(data.get("gps_progress", 0))))
        with connect() as db:
            if "courier_lat" in data and "courier_lng" in data:
                db.execute(
                    """
                    UPDATE orders
                    SET gps_progress = ?, courier_lat = ?, courier_lng = ?, courier_accuracy = ?,
                        courier_location_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        progress,
                        float(data["courier_lat"]),
                        float(data["courier_lng"]),
                        float(data.get("courier_accuracy", 0)),
                        order_id,
                    ),
                )
            else:
                db.execute("UPDATE orders SET gps_progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (progress, order_id))
            return self.send_json({"ok": True})

    def rate_order(self, order_id):
        data = self.read_json()
        rating = max(1, min(5, int(data.get("rating", 5))))
        with connect() as db:
            db.execute("UPDATE orders SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (rating, order_id))
            return self.send_json({"ok": True})

    def get_settings(self):
        with connect() as db:
            settings = db.execute("SELECT * FROM platform_settings WHERE id = 1").fetchone()
            return self.send_json({"settings": row_to_dict(settings)})

    def update_settings(self):
        data = self.read_json()
        with connect() as db:
            db.execute(
                """
                UPDATE platform_settings
                SET base_delivery_fee_cents = ?, per_km_fee_cents = ?, platform_rate = ?,
                    courier_base_commission_cents = ?, courier_per_km_commission_cents = ?, service_active = ?
                WHERE id = 1
                """,
                (
                    money_to_cents(data.get("base_delivery_fee", 18)),
                    money_to_cents(data.get("per_km_fee", 6)),
                    float(data.get("platform_rate", 0.08)),
                    money_to_cents(data.get("courier_base_commission", 18)),
                    money_to_cents(data.get("courier_per_km_commission", 4)),
                    1 if data.get("service_active", True) else 0,
                ),
            )
            return self.send_json({"ok": True})

    def get_business(self):
        with connect() as db:
            business = db.execute("SELECT * FROM businesses WHERE id = 1").fetchone()
            return self.send_json({"business": row_to_dict(business)})

    def update_business(self):
        data = self.read_json()
        with connect() as db:
            db.execute(
                """
                UPDATE businesses
                SET name = COALESCE(?, name), pickup_address = COALESCE(?, pickup_address),
                    phone = COALESCE(?, phone), is_open = COALESCE(?, is_open), is_blocked = COALESCE(?, is_blocked)
                WHERE id = 1
                """,
                (
                    data.get("name"),
                    data.get("pickup_address"),
                    data.get("phone"),
                    data.get("is_open"),
                    data.get("is_blocked"),
                ),
            )
            return self.send_json({"ok": True})

    def create_admin_note(self):
        data = self.read_json()
        with connect() as db:
            cur = db.execute(
                "INSERT INTO admin_notes (admin_user_id, title) VALUES (?, ?)",
                (data.get("admin_user_id"), data["title"]),
            )
            return self.send_json({"id": cur.lastrowid}, 201)

    def reset_database(self):
        with connect() as db:
            db.executescript(
                """
                DELETE FROM order_items;
                DELETE FROM orders;
                DELETE FROM sessions;
                DELETE FROM login_codes;
                DELETE FROM product_extras;
                DELETE FROM products;
                DELETE FROM buyer_addresses;
                DELETE FROM businesses;
                DELETE FROM admin_notes;
                DELETE FROM users;
                DELETE FROM platform_settings;
                """
            )
            db.executescript((ROOT / "seed.sql").read_text())
        return self.send_json({"ok": True})


def main():
    init_db()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8780"))
    server = ThreadingHTTPServer((host, port), Api)
    print(f"Dindu API en http://{host}:{port}")
    print(f"Salud: http://{host}:{port}/api/health")
    server.serve_forever()


if __name__ == "__main__":
    main()
