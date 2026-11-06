-- T02-A. Select the intended database in phpMyAdmin before importing.
-- Requires MySQL >= 8.0.16 (enforced CHECK constraints), InnoDB and strict SQL mode.
-- Run once, in order. DDL commits implicitly; inspect a partial failure before retrying.
-- No database/user creation, destructive rollback, or IF NOT EXISTS masking schema drift.
SET NAMES utf8mb4;
SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode,
  'STRICT_TRANS_TABLES', 'NO_ZERO_DATE', 'NO_ZERO_IN_DATE');
SET time_zone = '+00:00';

CREATE TABLE products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  brand VARCHAR(80) NOT NULL,
  variant VARCHAR(80) NOT NULL DEFAULT '',
  size DECIMAL(10,3) NOT NULL COMMENT 'Amount per pack member, in unit',
  unit VARCHAR(12) NOT NULL,
  pack_quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  category VARCHAR(80) NOT NULL,
  image_url VARCHAR(2048) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_identity (name, brand, variant, size, unit, pack_quantity),
  KEY idx_products_brand (brand),
  KEY idx_products_category_name (category, name),
  CONSTRAINT chk_products_text CHECK (
    CHAR_LENGTH(TRIM(name)) > 0 AND CHAR_LENGTH(TRIM(brand)) > 0
    AND CHAR_LENGTH(TRIM(category)) > 0
  ),
  CONSTRAINT chk_products_size CHECK (size > 0),
  CONSTRAINT chk_products_unit CHECK (unit IN ('ml', 'L', 'g', 'kg', 'piece', 'roll', 'sheet')),
  CONSTRAINT chk_products_pack CHECK (pack_quantity > 0),
  CONSTRAINT chk_products_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_aliases (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  alias VARCHAR(255) NOT NULL,
  -- Deliberately simple normalization: lowercase; remove ASCII spaces and hyphens.
  normalized_alias VARCHAR(255) GENERATED ALWAYS AS
    (LOWER(REPLACE(REPLACE(TRIM(alias), '-', ''), ' ', ''))) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_aliases_normalized (normalized_alias),
  KEY idx_product_aliases_product (product_id),
  CONSTRAINT fk_product_aliases_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_product_aliases_text CHECK (CHAR_LENGTH(normalized_alias) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE supermarkets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supermarkets_name (name),
  CONSTRAINT chk_supermarkets_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE branches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  supermarket_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(255) NOT NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_branches_supermarket_name (supermarket_id, name),
  CONSTRAINT fk_branches_supermarket FOREIGN KEY (supermarket_id)
    REFERENCES supermarkets (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_branches_text CHECK (
    CHAR_LENGTH(TRIM(name)) > 0 AND CHAR_LENGTH(TRIM(address)) > 0
  ),
  CONSTRAINT chk_branches_coordinates CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  price DECIMAL(12,2) NOT NULL COMMENT 'Price for one complete catalog package; not receipt line total',
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'USD',
  observed_at DATETIME(6) NOT NULL COMMENT 'UTC source observation time',
  status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  source_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_note VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_prices_product_branch_status_time (product_id, branch_id, status, observed_at, id),
  KEY idx_prices_branch_product (branch_id, product_id),
  CONSTRAINT fk_prices_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_prices_branch FOREIGN KEY (branch_id)
    REFERENCES branches (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_prices_positive CHECK (price > 0),
  CONSTRAINT chk_prices_currency CHECK (currency IN ('USD', 'LBP')),
  CONSTRAINT chk_prices_status CHECK (status IN ('verified', 'pending', 'flagged', 'rejected')),
  -- Receipt source will be added together with its enforced receipt_item_id FK.
  CONSTRAINT chk_prices_source CHECK (source_type IN ('seed', 'manual', 'online')),
  CONSTRAINT chk_prices_demo_note CHECK (
    source_type <> 'seed' OR
    (source_note IS NOT NULL AND source_note LIKE 'DEMONSTRATION DATA%')
  ),
  CONSTRAINT chk_prices_observation CHECK (observed_at >= '1970-01-01 00:00:00')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
