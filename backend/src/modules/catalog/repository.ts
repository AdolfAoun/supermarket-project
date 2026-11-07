import type { Pool, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database.js';

export interface Product {
  id: number;
  name: string;
  brand: string;
  variant: string;
  size: number;
  unit: string;
  packQuantity: number;
  category: string;
  imageUrl: string | null;
}

export interface Branch {
  id: number;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Supermarket {
  id: number;
  name: string;
  branches: Branch[];
}

export interface ComparisonPrice {
  supermarketId: number;
  supermarket: string;
  branchId: number;
  branch: string;
  price: string;
  currency: 'USD';
  observedAt: string;
  status: 'verified';
  demonstrationData: true;
  availability: 'check_with_store';
}

export interface CatalogRepository {
  listProducts(search: string, limit: number): Promise<Product[]>;
  findProduct(id: number): Promise<Product | null>;
  listPrices(productId: number): Promise<ComparisonPrice[]>;
  listSupermarkets(): Promise<Supermarket[]>;
}

// SQL applies exactly the generated-alias normalization, including to bound input.
// LOCATE treats %, _ and backslash literally and does no fuzzy matching.
const normalize = (expression: string) =>
  `LOWER(REPLACE(REPLACE(TRIM(${expression}), '-', ''), ' ', ''))`;
const productColumns = 'p.id, p.name, p.brand, p.variant, p.size, p.unit, p.pack_quantity, p.category, p.image_url';

function product(row: RowDataPacket): Product {
  return {
    id: row.id, name: row.name, brand: row.brand, variant: row.variant,
    size: Number(row.size), unit: row.unit, packQuantity: row.pack_quantity,
    category: row.category, imageUrl: row.image_url,
  };
}

export type ReadRows = (sql: string, values: (string | number)[]) => Promise<RowDataPacket[]>;
export function createSqlReader(database: Pick<Pool, 'execute'> = pool): ReadRows {
  return async (sql, values) => {
    // Bind on the server; text-protocol escaping depends on session SQL mode.
    const [rows] = await database.execute<RowDataPacket[]>({ sql, values, timeout: 5000 });
    return rows;
  };
}

export function createCatalogRepository(read: ReadRows = createSqlReader()): CatalogRepository {
  return {
    async listProducts(search, limit) {
      const rows = await read(`
        SELECT ${productColumns} FROM products p
        WHERE p.is_active = 1 AND (
          LOCATE(${normalize('?')}, ${normalize('p.name')}) > 0
          OR LOCATE(${normalize('?')}, ${normalize('p.brand')}) > 0
          OR LOCATE(${normalize('?')}, ${normalize('p.category')}) > 0
          OR EXISTS (
            SELECT 1 FROM product_aliases a WHERE a.product_id = p.id
            AND LOCATE(${normalize('?')}, a.normalized_alias) > 0
          )
        )
        ORDER BY p.name, p.brand, p.variant, p.size, p.unit, p.pack_quantity, p.id
        LIMIT ?`, [search, search, search, search, limit]);
      return rows.map(product);
    },

    async findProduct(id) {
      const rows = await read(`SELECT ${productColumns} FROM products p
        WHERE p.id = ? AND p.is_active = 1`, [id]);
      return rows.length ? product(rows[0]) : null;
    },

    async listPrices(productId) {
      const rows = await read(`
        SELECT s.id AS supermarket_id, s.name AS supermarket,
          b.id AS branch_id, b.name AS branch, ranked.price,
          DATE_FORMAT(ranked.observed_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS observed_at
        FROM (
          SELECT branch_id, price, observed_at,
            ROW_NUMBER() OVER (PARTITION BY branch_id ORDER BY observed_at DESC, id DESC) AS position
          FROM prices
          WHERE product_id = ? AND status = 'verified'
            AND currency = 'USD' AND source_type = 'seed'
        ) ranked
        JOIN branches b ON b.id = ranked.branch_id
        JOIN supermarkets s ON s.id = b.supermarket_id
        WHERE ranked.position = 1
        ORDER BY ranked.price ASC, b.id ASC`, [productId]);
      return rows.map(row => ({
        supermarketId: row.supermarket_id, supermarket: row.supermarket,
        branchId: row.branch_id, branch: row.branch, price: String(row.price),
        currency: 'USD', observedAt: row.observed_at, status: 'verified',
        demonstrationData: true, availability: 'check_with_store',
      }));
    },

    async listSupermarkets() {
      const rows = await read(`
        SELECT s.id AS supermarket_id, s.name AS supermarket,
          b.id AS branch_id, b.name AS branch, b.address, b.latitude, b.longitude
        FROM supermarkets s LEFT JOIN branches b ON b.supermarket_id = s.id
        ORDER BY s.name, s.id, b.name, b.id`, []);
      const supermarkets = new Map<number, Supermarket>();
      for (const row of rows) {
        if (!supermarkets.has(row.supermarket_id)) {
          supermarkets.set(row.supermarket_id, { id: row.supermarket_id, name: row.supermarket, branches: [] });
        }
        if (row.branch_id !== null) {
          supermarkets.get(row.supermarket_id)!.branches.push({
            id: row.branch_id, name: row.branch, address: row.address,
            latitude: row.latitude === null ? null : Number(row.latitude),
            longitude: row.longitude === null ? null : Number(row.longitude),
          });
        }
      }
      return [...supermarkets.values()];
    },
  };
}
