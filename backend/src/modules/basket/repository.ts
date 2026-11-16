import type { Pool, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database.js';
import { HttpError } from '../../middleware/errors.js';
import { readListItems, type ListDetails } from '../shopping-lists/repository.js';

export interface BasketBranch { branchId: number; branch: string; supermarketId: number; supermarket: string }
export interface BasketPrice {
  productId: number; branchId: number; originalPrice: string; originalCurrency: string; observedAt: string;
}
export interface BasketSnapshot { shoppingList: ListDetails; branches: BasketBranch[]; prices: BasketPrice[] }
export interface BasketRepository { snapshot(userId: number, listId: number): Promise<BasketSnapshot> }

export function createBasketRepository(database: Pool = pool): BasketRepository {
  return {
    async snapshot(userId, listId) {
      const connection = await database.getConnection();
      try {
        // Next transaction only; no dependence on a server's default isolation.
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.beginTransaction();
        const [lists] = await connection.execute<RowDataPacket[]>(`SELECT id, name,
          DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS created,
          DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS updated
          FROM shopping_lists WHERE id = ? AND user_id = ? FOR SHARE`, [listId, userId]);
        if (!lists.length) throw new HttpError(404, 'Shopping list or item not found');
        const row = lists[0];
        // First consistent read establishes the snapshot AFTER the owned list lock.
        const items = await readListItems(connection, listId);
        if (!items.length) throw new HttpError(400, 'Shopping list is empty');
        const shoppingList: ListDetails = { id: row.id, name: row.name, createdAt: row.created, updatedAt: row.updated, items };
        const [branches] = await connection.execute<RowDataPacket[]>(`SELECT b.id AS branch_id, b.name AS branch,
          s.id AS supermarket_id, s.name AS supermarket FROM branches b
          JOIN supermarkets s ON s.id = b.supermarket_id ORDER BY b.id`);
        // Same verified/seed policy as T02; T03-B supports both approved currencies.
        // Filter before ranking. Currency is NOT a partition: latest eligible wins
        // across USD and LBP, never the cheaper historical/currency alternative.
        const [prices] = await connection.execute<RowDataPacket[]>(`SELECT product_id, branch_id, price, currency,
          DATE_FORMAT(observed_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS observed
          FROM (
            SELECT p.product_id, p.branch_id, p.price, p.currency, p.observed_at,
              ROW_NUMBER() OVER (PARTITION BY p.product_id, p.branch_id ORDER BY p.observed_at DESC, p.id DESC) AS position
            FROM prices p JOIN shopping_list_items i ON i.product_id = p.product_id
            WHERE i.shopping_list_id = ? AND p.status = 'verified' AND p.source_type = 'seed'
              AND p.currency IN ('USD', 'LBP') AND p.price > 0
          ) ranked WHERE position = 1 ORDER BY branch_id, product_id`, [listId]);
        const result: BasketSnapshot = {
          shoppingList,
          branches: branches.map(row => ({ branchId: row.branch_id, branch: row.branch, supermarketId: row.supermarket_id, supermarket: row.supermarket })),
          prices: prices.map(row => ({ productId: row.product_id, branchId: row.branch_id,
            originalPrice: row.price, originalCurrency: row.currency, observedAt: row.observed })),
        };
        await connection.commit();
        return result;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
