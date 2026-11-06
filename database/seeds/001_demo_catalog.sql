-- DEMONSTRATION DATA ONLY: invented USD amounts, not current/accurate store prices.
-- Import ONCE after 001_catalog.sql into an EMPTY five-table catalog.
-- Explicit IDs make this small fixture readable. Never merge it into populated tables.
-- No IGNORE, REPLACE, UPDATE or DELETE: collisions must fail, not overwrite data.
-- On ANY import error: stop, ROLLBACK in the same session, and inspect before retrying.
SET NAMES utf8mb4;
SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode,
  'STRICT_TRANS_TABLES', 'NO_ZERO_DATE', 'NO_ZERO_IN_DATE');
SET time_zone = '+00:00';
START TRANSACTION;

INSERT INTO products (id, name, brand, variant, size, unit, pack_quantity, category) VALUES
  (1, 'Coca-Cola', 'Coca-Cola', 'Original', 1.5, 'L', 1, 'Beverages'),
  (2, 'Coca-Cola', 'Coca-Cola', 'Original', 330, 'ml', 1, 'Beverages'),
  (3, 'Pepsi', 'Pepsi', 'Original', 1.5, 'L', 1, 'Beverages'),
  (4, 'Mineral Water', 'Tannourine', '', 1.5, 'L', 1, 'Beverages'),
  (5, 'Mineral Water', 'Tannourine', '', 1.5, 'L', 6, 'Beverages'),
  (6, 'Orange Juice', 'Libby''s', '', 1, 'L', 1, 'Beverages'),
  (7, 'Full Cream Milk', 'Candia', 'UHT', 1, 'L', 1, 'Dairy'),
  (8, 'Low Fat Milk', 'Candia', 'UHT', 1, 'L', 1, 'Dairy'),
  (9, 'Labneh', 'Taanayel', 'Full Fat', 500, 'g', 1, 'Dairy'),
  (10, 'Labneh', 'Taanayel', 'Full Fat', 1, 'kg', 1, 'Dairy'),
  (11, 'Plain Yogurt', 'Dairy Khoury', '', 1, 'kg', 1, 'Dairy'),
  (12, 'Halloumi', 'Taanayel', '', 250, 'g', 1, 'Dairy'),
  (13, 'Potato Chips', 'Master', 'Salted', 90, 'g', 1, 'Snacks'),
  (14, 'Potato Chips', 'Master', 'Barbecue', 90, 'g', 1, 'Snacks'),
  (15, 'Potato Chips', 'Lay''s', 'Salted', 170, 'g', 1, 'Snacks'),
  (16, 'Chocolate Wafer', 'KitKat', 'Four Finger', 41.5, 'g', 1, 'Snacks'),
  (17, 'Tea Biscuits', 'Gandour', '', 200, 'g', 1, 'Snacks'),
  (18, 'Roasted Peanuts', 'Al Rifai', 'Salted', 250, 'g', 1, 'Snacks'),
  (19, 'Basmati Rice', 'Al Walimah', '', 1, 'kg', 1, 'Rice and pasta'),
  (20, 'Basmati Rice', 'Al Walimah', '', 5, 'kg', 1, 'Rice and pasta'),
  (21, 'Long Grain Rice', 'Ben''s Original', '', 1, 'kg', 1, 'Rice and pasta'),
  (22, 'Spaghetti', 'Barilla', 'No. 5', 500, 'g', 1, 'Rice and pasta'),
  (23, 'Penne Rigate', 'Barilla', '', 500, 'g', 1, 'Rice and pasta'),
  (24, 'Vermicelli', 'Panzani', '', 500, 'g', 1, 'Rice and pasta'),
  (25, 'Dishwashing Liquid', 'Fairy', 'Lemon', 650, 'ml', 1, 'Cleaning products'),
  (26, 'Bleach', 'Clorox', 'Original', 1, 'L', 1, 'Cleaning products'),
  (27, 'Floor Cleaner', 'Dettol', 'Lemon', 1, 'L', 1, 'Cleaning products'),
  (28, 'Laundry Powder', 'Persil', 'Automatic', 2.5, 'kg', 1, 'Cleaning products'),
  (29, 'Glass Cleaner', 'Ajax', '', 750, 'ml', 1, 'Cleaning products'),
  (30, 'Toilet Cleaner', 'Harpic', 'Original', 750, 'ml', 1, 'Cleaning products'),
  (31, 'Facial Tissues', 'Sanita', 'Two Ply', 200, 'sheet', 1, 'Household essentials'),
  (32, 'Toilet Paper', 'Sanita', 'Two Ply', 1, 'roll', 6, 'Household essentials'),
  (33, 'Kitchen Towels', 'Sanita', '', 1, 'roll', 2, 'Household essentials'),
  (34, 'Garbage Bags', 'Sanita', 'Large', 20, 'piece', 1, 'Household essentials'),
  (35, 'Aluminium Foil', 'Sanita', '30 m roll', 1, 'roll', 1, 'Household essentials'),
  (36, 'Kitchen Sponges', 'Vileda', '', 1, 'piece', 3, 'Household essentials');

-- One stored spelling per normalized key: 'Coca-Cola 1.5 L' and
-- 'Coca Cola 1.5L' both normalize to 'cocacola1.5l'; do not insert both.
INSERT INTO product_aliases (product_id, alias) VALUES
  (1, 'Coca Cola 1.5L'), (1, 'Coke 1.5L'),
  (2, 'Coke 330ml'), (3, 'Pepsi 1.5L'),
  (4, 'Tannourine Water 1.5L'), (5, 'Tannourine Water 6 x 1.5L'),
  (9, 'Taanayel Labne 500g'), (10, 'Taanayel Labne 1kg'),
  (19, 'Al Walimah Basmati 1kg'), (20, 'Al Walimah Basmati 5kg'),
  (22, 'Barilla Spaghetti No 5 500g'), (25, 'Fairy Lemon 650ml');

-- Real chain names are context only. Branch records and addresses below are
-- FICTIONAL Lebanese demonstration scenarios; no actual outlet/location is asserted.
INSERT INTO supermarkets (id, name) VALUES
  (1, 'Spinneys - DEMONSTRATION DATA'),
  (2, 'Carrefour - DEMONSTRATION DATA'),
  (3, 'Le Charcutier - DEMONSTRATION DATA');
INSERT INTO branches (id, supermarket_id, name, address) VALUES
  (1, 1, 'Beirut - DEMO', 'DEMONSTRATION DATA: fictional Beirut branch, Lebanon'),
  (2, 1, 'Metn - DEMO', 'DEMONSTRATION DATA: fictional Metn branch, Lebanon'),
  (3, 2, 'Baabda - DEMO', 'DEMONSTRATION DATA: fictional Baabda branch, Lebanon'),
  (4, 3, 'Jounieh - DEMO', 'DEMONSTRATION DATA: fictional Jounieh branch, Lebanon');

-- Invented base amounts plus branch offsets, purely to exercise comparisons.
-- All four statuses below simulate verification; 'verified' is NOT a real-world claim.
INSERT INTO prices (product_id, branch_id, price, currency, observed_at, status, source_type, source_note)
SELECT p.id, b.id,
  CASE p.id
    WHEN 1 THEN 1.60 WHEN 2 THEN 0.55 WHEN 3 THEN 1.45
    WHEN 4 THEN 0.45 WHEN 5 THEN 2.50 WHEN 6 THEN 1.80
    WHEN 7 THEN 1.40 WHEN 8 THEN 1.45 WHEN 9 THEN 2.80
    WHEN 10 THEN 5.20 WHEN 11 THEN 2.10 WHEN 12 THEN 3.20
    WHEN 13 THEN 0.70 WHEN 14 THEN 0.75 WHEN 15 THEN 1.65
    WHEN 16 THEN 0.80 WHEN 17 THEN 0.95 WHEN 18 THEN 3.10
    WHEN 19 THEN 2.60 WHEN 20 THEN 11.80 WHEN 21 THEN 3.00
    WHEN 22 THEN 1.30 WHEN 23 THEN 1.35 WHEN 24 THEN 1.15
    WHEN 25 THEN 2.40 WHEN 26 THEN 1.50 WHEN 27 THEN 3.20
    WHEN 28 THEN 8.50 WHEN 29 THEN 2.10 WHEN 30 THEN 2.70
    WHEN 31 THEN 0.90 WHEN 32 THEN 2.80 WHEN 33 THEN 1.60
    WHEN 34 THEN 1.90 WHEN 35 THEN 2.20 WHEN 36 THEN 1.50
  END + CASE b.id WHEN 1 THEN 0.10 WHEN 2 THEN 0.20 WHEN 3 THEN 0.00 ELSE 0.15 END,
  'USD', '2026-01-15 12:00:00.000000', 'verified', 'seed',
  'DEMONSTRATION DATA: invented USD amount; simulated verification; not current or accurate'
FROM products p CROSS JOIN branches b
WHERE b.id <= 3 OR (b.id = 4 AND p.id <= 12);

-- Preserve two earlier observations for the same product/branch. No upsert.
-- Later untrusted observations must never replace the latest verified candidate.
INSERT INTO prices (product_id, branch_id, price, currency, observed_at, status, source_type, source_note) VALUES
  (1, 1, 1.90, 'USD', '2026-01-01 12:00:00', 'verified', 'seed', 'DEMONSTRATION DATA: historical invented amount'),
  (1, 1, 1.80, 'USD', '2026-01-08 12:00:00', 'verified', 'seed', 'DEMONSTRATION DATA: historical invented amount'),
  (1, 1, 1.20, 'USD', '2026-01-16 12:00:00', 'pending', 'seed', 'DEMONSTRATION DATA: simulated pending observation'),
  (1, 1, 0.10, 'USD', '2026-01-17 12:00:00', 'flagged', 'seed', 'DEMONSTRATION DATA: simulated suspicious observation'),
  (1, 1, 0.05, 'USD', '2026-01-18 12:00:00', 'rejected', 'seed', 'DEMONSTRATION DATA: simulated rejected observation');

COMMIT;
