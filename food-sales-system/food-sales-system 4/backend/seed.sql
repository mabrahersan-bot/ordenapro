PRAGMA foreign_keys = ON;

INSERT INTO users (id, role, name, phone, email, status) VALUES
  (1, 'buyer', 'Ana Martinez', '5551234567', 'ana@example.local', 'active'),
  (2, 'merchant', 'Cocina Central', '5550102026', 'negocio@example.local', 'active'),
  (3, 'courier', 'Repartidor Demo', '5553334444', 'reparto@example.local', 'active'),
  (4, 'admin', 'Administrador', '5550001111', 'admin@example.local', 'active')
ON CONFLICT(id) DO NOTHING;

INSERT INTO businesses (id, owner_user_id, name, pickup_address, pickup_lat, pickup_lng, phone, coverage_km, is_open, is_blocked) VALUES
  (1, 2, 'Cocina Central', 'Portal Hidalgo 12, Centro', 19.43261, -99.13321, '5550102026', 10, 1, 0)
ON CONFLICT(id) DO NOTHING;

INSERT INTO buyer_addresses (id, buyer_user_id, label, address, reference, is_default) VALUES
  (1, 1, 'Casa', 'Av. Central 120, Col. Centro', 'Porton negro, tocar dos veces', 1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO products (id, business_id, name, description, price_cents, photo_url, is_available) VALUES
  (1, 1, 'Caja de tacos', 'Orden familiar con salsas y guarniciones.', 18900, '', 1),
  (2, 1, 'Hamburguesa premium', 'Carne, queso, vegetales frescos y papas.', 14500, '', 1),
  (3, 1, 'Bowl ejecutivo', 'Proteina, arroz, vegetales y aderezo.', 13200, '', 1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO product_extras (id, product_id, name, price_cents) VALUES
  (1, 1, 'Queso extra', 2500),
  (2, 1, 'Salsa especial', 1000),
  (3, 2, 'Tocino', 2200),
  (4, 2, 'Papas grandes', 1800),
  (5, 3, 'Proteina extra', 3000),
  (6, 3, 'Aguacate', 2000)
ON CONFLICT(id) DO NOTHING;

INSERT INTO platform_settings (id, base_delivery_fee_cents, per_km_fee_cents, platform_rate, courier_base_commission_cents, courier_per_km_commission_cents, service_active)
VALUES (1, 1500, 1000, 0.08, 1500, 1000, 1)
ON CONFLICT(id) DO NOTHING;
