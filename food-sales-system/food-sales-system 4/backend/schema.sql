PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'merchant', 'courier', 'admin')),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'merchant', 'courier', 'admin')),
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'merchant', 'courier', 'admin')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_lat REAL,
  pickup_lng REAL,
  phone TEXT,
  coverage_km REAL NOT NULL DEFAULT 10,
  is_open INTEGER NOT NULL DEFAULT 1,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS buyer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_user_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  reference TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (buyer_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  photo_url TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE TABLE IF NOT EXISTS product_extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_user_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  courier_user_id INTEGER,
  pickup_address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_reference TEXT,
  pickup_lat REAL,
  pickup_lng REAL,
  delivery_lat REAL,
  delivery_lng REAL,
  distance_km REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL,
  delivery_fee_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  courier_commission_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  customer_note TEXT,
  cancel_reason TEXT,
  rating INTEGER,
  gps_progress INTEGER NOT NULL DEFAULT 0,
  courier_lat REAL,
  courier_lng REAL,
  courier_accuracy REAL,
  courier_location_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_user_id) REFERENCES users(id),
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (courier_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  extras_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_delivery_fee_cents INTEGER NOT NULL DEFAULT 1800,
  per_km_fee_cents INTEGER NOT NULL DEFAULT 600,
  platform_rate REAL NOT NULL DEFAULT 0.08,
  courier_base_commission_cents INTEGER NOT NULL DEFAULT 1800,
  courier_per_km_commission_cents INTEGER NOT NULL DEFAULT 400,
  service_active INTEGER NOT NULL DEFAULT 1
);
