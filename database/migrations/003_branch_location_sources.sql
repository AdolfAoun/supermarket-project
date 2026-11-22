-- T05-B2 OPTIONAL additive provenance ledger. Manual approval/application only.
-- Reuses supermarkets/branches; no existing record/table alterations or prices.
-- DDL commits implicitly: apply separately BEFORE the transactional data importer.
CREATE TABLE branch_location_sources (
  osm_type VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  osm_id BIGINT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  record_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  catalog_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  review_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provenance JSON NOT NULL,
  imported_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (osm_type, osm_id),
  KEY idx_location_sources_branch (branch_id),
  CONSTRAINT fk_location_sources_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_location_sources_type CHECK (osm_type IN ('node','way','relation')),
  CONSTRAINT chk_location_sources_id CHECK (osm_id > 0),
  CONSTRAINT chk_location_sources_status CHECK (review_status IN ('auto_validated','owner_reviewed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
