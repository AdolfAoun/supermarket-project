import 'dotenv/config';

function port(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return value;
}

export const env = {
  priceFreshnessDays: port('PRICE_FRESHNESS_DAYS', 30),
  host: process.env.HOST ?? '127.0.0.1',
  port: port('PORT', 3000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8081')
    .split(',').map((origin) => origin.trim()).filter(Boolean),
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: port('DB_PORT', 3306),
    database: process.env.DB_NAME ?? 'supermarket_comparison',
    user: process.env.DB_USER ?? 'supermarket_app',
    password: process.env.DB_PASSWORD,
  },
};

if (env.db.user.toLowerCase() === 'root') {
  throw new Error('Configure a dedicated application database user');
}
