import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database.js';
import { HttpError } from '../../middleware/errors.js';

export interface User { id: number; displayName: string; email: string }
export interface Account extends User { passwordHash: string }
export interface AuthRepository {
  register(displayName: string, email: string, hash: string): Promise<User>;
  findAccount(email: string): Promise<Account | null>;
  createSession(userId: number, tokenHash: string): Promise<string>;
  authenticate(tokenHash: string): Promise<User | null>;
  logout(tokenHash: string): Promise<void>;
}
function profile(row: RowDataPacket): User {
  return { id: row.id, displayName: row.display_name, email: row.email };
}
export function createAuthRepository(database: Pool = pool): AuthRepository {
  return {
    async register(displayName, email, hash) {
      try {
        const [result] = await database.execute<ResultSetHeader>(
          'INSERT INTO users (display_name, email, password_hash) VALUES (?, ?, ?)', [displayName, email, hash]);
        return { id: result.insertId, displayName, email };
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
          throw new HttpError(409, 'Email is already registered');
        }
        throw error;
      }
    },
    async findAccount(email) {
      const [rows] = await database.execute<RowDataPacket[]>(
        'SELECT id, display_name, email, password_hash FROM users WHERE email = ?', [email]);
      return rows.length ? { ...profile(rows[0]), passwordHash: rows[0].password_hash } : null;
    },
    async createSession(userId, tokenHash) {
      const connection = await database.getConnection();
      try {
        // Use the database clock for both storage and expiry validation.
        await connection.beginTransaction();
        const [result] = await connection.execute<ResultSetHeader>(`INSERT INTO sessions (user_id, token_hash, expires_at)
          VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 7 DAY))`, [userId, tokenHash]);
        const [[row]] = await connection.execute<RowDataPacket[]>(
          "SELECT DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS expires FROM sessions WHERE id = ?", [result.insertId]);
        await connection.commit();
        return row.expires as string;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async authenticate(tokenHash) {
      const [rows] = await database.execute<RowDataPacket[]>(`SELECT u.id, u.display_name, u.email FROM sessions s
        JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(6)`, [tokenHash]);
      return rows.length ? profile(rows[0]) : null;
    },
    async logout(tokenHash) { await database.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]); },
  };
}
