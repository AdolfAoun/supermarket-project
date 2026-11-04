import mysql from 'mysql2/promise';
import { env } from './env.js';

// Lazy connections let the process health endpoint work while MySQL is down.
export const pool = mysql.createPool({
  ...env.db,
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 10,
  connectTimeout: 5000,
});

export async function checkDatabase(): Promise<void> {
  if (!env.db.password) throw new Error('Database password is not configured');
  await pool.query({ sql: 'SELECT 1', timeout: 5000 });
}
