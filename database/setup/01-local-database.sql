-- Run manually in local phpMyAdmin as an administrator.
-- Replace the password placeholder BEFORE running; do not save the edited SQL in Git.
-- CREATE USER deliberately fails if this account exists: inspect it rather than overwrite it.
CREATE DATABASE IF NOT EXISTS supermarket_comparison
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'supermarket_app'@'127.0.0.1'
  IDENTIFIED BY 'REPLACE_WITH_YOUR_LOCAL_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON supermarket_comparison.*
  TO 'supermarket_app'@'127.0.0.1';
-- Future schema migrations run separately as administrator; no DDL or global grants here.
SHOW GRANTS FOR 'supermarket_app'@'127.0.0.1';
