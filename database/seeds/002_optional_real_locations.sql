-- OPTIONAL real locations only. Review provenance before manual import.
-- Run in a dedicated session with no existing transaction; MySQL 8 / migration 001.
-- Requires CREATE ROUTINE, EXECUTE and ALTER ROUTINE in the selected schema.
-- No prices, schema migration, owner record updates or deletes.
-- Identical records are accepted; conflicting IDs or names abort ALL fixture writes.
-- The procedure is temporary import machinery, removed after a successful CALL.
-- If your client stops on CALL failure, remove the routine explicitly before retry:
-- DROP PROCEDURE t05b_import_real_locations;
SET NAMES utf8mb4;
SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES');
SET time_zone = '+00:00';
DELIMITER $$
CREATE PROCEDURE t05b_import_real_locations()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;
  INSERT INTO supermarkets (id, name) SELECT 1001, 'Spinneys'
    WHERE NOT EXISTS (SELECT 1 FROM supermarkets WHERE id = 1001);
  IF NOT EXISTS (SELECT 1 FROM supermarkets WHERE id = 1001 AND BINARY name = BINARY 'Spinneys') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location supermarket collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1005, 1001, 'Ashrafieh - Alexandre', 'Ashrafieh facing Mar Youhana (Hotel Alexandre). Alexandre district, Adib Eshaq street', 33.884739, 35.518509 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1005);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1005 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Ashrafieh - Alexandre' AND BINARY address = BINARY 'Ashrafieh facing Mar Youhana (Hotel Alexandre). Alexandre district, Adib Eshaq street'
    AND latitude = 33.884739 AND longitude = 35.518509) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1005 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1008, 1001, 'Ashrafieh - Mar Mitr', 'La Sagesse School', 33.891427, 35.520902 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1008);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1008 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Ashrafieh - Mar Mitr' AND BINARY address = BINARY 'La Sagesse School'
    AND latitude = 33.891427 AND longitude = 35.520902) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1008 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1014, 1001, 'Ain El Tineh', 'Sakiet El Janzeer', 33.886449, 35.479156 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1014);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1014 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Ain El Tineh' AND BINARY address = BINARY 'Sakiet El Janzeer'
    AND latitude = 33.886449 AND longitude = 35.479156) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1014 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1023, 1001, 'Sahel Alma', 'Spinneys Sahel Alma', 34.000842, 35.647694 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1023);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1023 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Sahel Alma' AND BINARY address = BINARY 'Spinneys Sahel Alma'
    AND latitude = 34.000842 AND longitude = 35.647694) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1023 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1032, 1001, 'Dbayeh 24/7', 'Dbayeh Highway, Jdeidet El Metn', 33.935035, 35.589932 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1032);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1032 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Dbayeh 24/7' AND BINARY address = BINARY 'Dbayeh Highway, Jdeidet El Metn'
    AND latitude = 33.935035 AND longitude = 35.589932) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1032 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1038, 1001, 'Elissar', 'Antelias, Bikfaya Highway', 33.924426, 35.624532 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1038);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1038 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Elissar' AND BINARY address = BINARY 'Antelias, Bikfaya Highway'
    AND latitude = 33.924426 AND longitude = 35.624532) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1038 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1044, 1001, 'Hamra', 'Sourati Road, Idriss building', 33.896895, 35.484799 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1044);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1044 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Hamra' AND BINARY address = BINARY 'Sourati Road, Idriss building'
    AND latitude = 33.896895 AND longitude = 35.484799) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1044 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1053, 1001, 'Jbeil', 'Jbeil Main Highway, Blat Exit', 34.109895, 35.654787 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1053);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1053 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Jbeil' AND BINARY address = BINARY 'Jbeil Main Highway, Blat Exit'
    AND latitude = 34.109895 AND longitude = 35.654787) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1053 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1056, 1001, 'Jnah', 'Wata El Msaytbeh', 33.873805, 35.490518 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1056);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1056 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Jnah' AND BINARY address = BINARY 'Wata El Msaytbeh'
    AND latitude = 33.873805 AND longitude = 35.490518) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1056 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1065, 1001, 'Signature by Spinneys', 'Beirut Souks', 33.899155, 35.503365 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1065);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1065 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Signature by Spinneys' AND BINARY address = BINARY 'Beirut Souks'
    AND latitude = 33.899155 AND longitude = 35.503365) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1065 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1078, 1001, 'Zouk', 'XJH8+4V5, Beirut, Lebanon', 33.977974, 35.617567 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1078);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1078 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Zouk' AND BINARY address = BINARY 'XJH8+4V5, Beirut, Lebanon'
    AND latitude = 33.977974 AND longitude = 35.617567) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1078 collision; import rolled back';
  END IF;
  INSERT INTO branches (id, supermarket_id, name, address, latitude, longitude)
    SELECT 1081, 1001, 'Ajaltoun', 'Ajaltoun main road, Keserwan', 33.970582, 35.688593 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1081);
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = 1081 AND supermarket_id = 1001
    AND BINARY name = BINARY 'Ajaltoun' AND BINARY address = BINARY 'Ajaltoun main road, Keserwan'
    AND latitude = 33.970582 AND longitude = 35.688593) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Real-location branch 1081 collision; import rolled back';
  END IF;
  COMMIT;
END$$
DELIMITER ;
CALL t05b_import_real_locations();
DROP PROCEDURE t05b_import_real_locations;
