import mysql, { type Pool } from 'mysql2';
import { env } from './env.js';

const sessionSql = `SET SESSION
  sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES', 'NO_ZERO_DATE', 'NO_ZERO_IN_DATE'),
  time_zone = '+00:00'`;

// Configure before returning the connection, including when reusing one. A
// fire-and-forget async pool event would not make borrowers await initialization.
export function configurePoolSessions(databasePool: Pick<Pool, 'getConnection'>): void {
  const acquire = databasePool.getConnection.bind(databasePool);
  databasePool.getConnection = callback => {
    acquire((error, connection) => {
      if (error) { callback(error, connection); return; }
      connection.query({ sql: sessionSql, timeout: 5000 }, error => {
        if (error) {
          connection.destroy();
          callback(error, connection);
          return;
        }
        callback(null, connection);
      });
    });
  };
}

// Lazy connections let the process health endpoint work while MySQL is down.
const databasePool = mysql.createPool({
  ...env.db,
  timezone: 'Z', // mysql2 Date encoding/decoding matches the server's UTC session.
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 10,
  connectTimeout: 5000,
});
configurePoolSessions(databasePool);
export const pool = databasePool.promise();

export async function checkDatabase(): Promise<void> {
  if (!env.db.password) throw new Error('Database password is not configured');
  await pool.query({ sql: 'SELECT 1', timeout: 5000 });
}
