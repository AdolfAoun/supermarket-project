import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database.js';
import { HttpError } from '../../middleware/errors.js';
import type { Product } from '../catalog/repository.js';
import { MAX_QUANTITY } from '../shared/validation.js';

export interface ShoppingList { id: number; name: string; createdAt: string; updatedAt: string }
export interface ListItem {
  id: number; productId: number; quantity: number; createdAt: string; updatedAt: string;
  product: Product & { isActive: boolean };
}
export interface ListDetails extends ShoppingList { items: ListItem[] }
export interface ShoppingListRepository {
  list(userId: number): Promise<ShoppingList[]>;
  create(userId: number, name: string): Promise<ShoppingList>;
  get(userId: number, id: number): Promise<ListDetails>;
  rename(userId: number, id: number, name: string): Promise<ShoppingList>;
  remove(userId: number, id: number): Promise<void>;
  addItem(userId: number, id: number, productId: number, quantity: number): Promise<ListItem>;
  setQuantity(userId: number, id: number, itemId: number, quantity: number): Promise<ListItem>;
  removeItem(userId: number, id: number, itemId: number): Promise<void>;
}
const dates = (alias: string) => `DATE_FORMAT(${alias}.created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS created,
  DATE_FORMAT(${alias}.updated_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS updated`;
function listDto(row: RowDataPacket): ShoppingList {
  return { id: row.id, name: row.name, createdAt: row.created, updatedAt: row.updated };
}
export async function readListItems(connection: PoolConnection, listId: number): Promise<ListItem[]> {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT i.id, i.product_id, i.quantity, ${dates('i')},
    p.id AS catalog_product_id, p.name, p.brand, p.variant, p.size, p.unit, p.pack_quantity, p.category, p.image_url, p.is_active
    FROM shopping_list_items i LEFT JOIN products p ON p.id = i.product_id
    WHERE i.shopping_list_id = ? ORDER BY i.id`, [listId]);
  return rows.map(row => {
    if (row.catalog_product_id == null) throw new Error('Invalid shopping list product reference');
    return {
      id: row.id, productId: row.product_id, quantity: row.quantity, createdAt: row.created, updatedAt: row.updated,
      product: { id: row.product_id, name: row.name, brand: row.brand, variant: row.variant,
        size: Number(row.size), unit: row.unit, packQuantity: row.pack_quantity, category: row.category,
        imageUrl: row.image_url, isActive: Boolean(row.is_active) },
    };
  });
}
const missing = () => new HttpError(404, 'Shopping list or item not found');

export function createShoppingListRepository(database: Pool = pool): ShoppingListRepository {
  // Parent-row lock serializes every mutation and detail read for a list. This
  // also prevents deletion races and makes duplicate increments/cap checks atomic.
  async function owned<T>(userId: number, id: number,
    action: (connection: PoolConnection, list: ShoppingList) => Promise<T>): Promise<T> {
    const connection = await database.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<RowDataPacket[]>(`SELECT l.id, l.name, ${dates('l')}
        FROM shopping_lists l WHERE l.id = ? AND l.user_id = ? FOR UPDATE`, [id, userId]);
      if (!rows.length) throw missing();
      const result = await action(connection, listDto(rows[0]));
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async function touch(connection: PoolConnection, id: number) {
    await connection.execute('UPDATE shopping_lists SET updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [id]);
  }
  async function findItem(connection: PoolConnection, id: number, itemId: number): Promise<ListItem> {
    const item = (await readListItems(connection, id)).find(item => item.id === itemId);
    if (!item) throw missing();
    return item;
  }
  return {
    async list(userId) {
      const [rows] = await database.execute<RowDataPacket[]>(`SELECT l.id, l.name, ${dates('l')}
        FROM shopping_lists l WHERE l.user_id = ? ORDER BY l.id`, [userId]);
      return rows.map(listDto);
    },
    async create(userId, name) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute<ResultSetHeader>(
          'INSERT INTO shopping_lists (user_id, name) VALUES (?, ?)', [userId, name]);
        const [[row]] = await connection.execute<RowDataPacket[]>(`SELECT l.id, l.name, ${dates('l')}
          FROM shopping_lists l WHERE l.id = ?`, [result.insertId]);
        await connection.commit();
        return listDto(row);
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    get: (userId, id) => owned(userId, id, async (connection, list) => ({ ...list, items: await readListItems(connection, id) })),
    rename: (userId, id, name) => owned(userId, id, async connection => {
      await connection.execute('UPDATE shopping_lists SET name = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [name, id]);
      const [[row]] = await connection.execute<RowDataPacket[]>(`SELECT l.id, l.name, ${dates('l')}
        FROM shopping_lists l WHERE l.id = ?`, [id]);
      return listDto(row);
    }),
    remove: (userId, id) => owned(userId, id, async connection => {
      await connection.execute('DELETE FROM shopping_lists WHERE id = ?', [id]);
    }),
    addItem: (userId, id, productId, quantity) => owned(userId, id, async connection => {
      // Shared lock prevents activity changes/deletion until this addition commits.
      const [products] = await connection.execute<RowDataPacket[]>(
        'SELECT id, is_active FROM products WHERE id = ? FOR SHARE', [productId]);
      if (!products.length) throw new HttpError(404, 'Product not found');
      if (!products[0].is_active) throw new HttpError(400, 'Cannot add an inactive product');
      const [existing] = await connection.execute<RowDataPacket[]>(
        'SELECT id, quantity FROM shopping_list_items WHERE shopping_list_id = ? AND product_id = ? FOR UPDATE', [id, productId]);
      const total = (existing[0]?.quantity ?? 0) + quantity;
      if (total > MAX_QUANTITY) throw new HttpError(400, `Combined quantity exceeds ${MAX_QUANTITY}`);
      let itemId: number;
      if (existing.length) {
        itemId = existing[0].id;
        await connection.execute('UPDATE shopping_list_items SET quantity = ? WHERE id = ?', [total, itemId]);
      } else {
        const [result] = await connection.execute<ResultSetHeader>(
          'INSERT INTO shopping_list_items (shopping_list_id, product_id, quantity) VALUES (?, ?, ?)', [id, productId, total]);
        itemId = result.insertId;
      }
      await touch(connection, id);
      return findItem(connection, id, itemId);
    }),
    setQuantity: (userId, id, itemId, quantity) => owned(userId, id, async connection => {
      await findItem(connection, id, itemId);
      await connection.execute('UPDATE shopping_list_items SET quantity = ? WHERE id = ? AND shopping_list_id = ?', [quantity, itemId, id]);
      await touch(connection, id);
      return findItem(connection, id, itemId);
    }),
    removeItem: (userId, id, itemId) => owned(userId, id, async connection => {
      const [result] = await connection.execute<ResultSetHeader>(
        'DELETE FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?', [itemId, id]);
      if (!result.affectedRows) throw missing();
      await touch(connection, id);
    }),
  };
}
