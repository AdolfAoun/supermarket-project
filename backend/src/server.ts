import { createApp } from './app.js';
import { checkDatabase, pool } from './config/database.js';
import { env } from './config/env.js';

const server = createApp(checkDatabase, env.corsOrigins).listen(env.port, env.host, () => {
  console.log(`Backend listening on ${env.host}:${env.port}`);
});
server.on('error', () => {
  console.error('Backend could not start. Check HOST, PORT and port availability.');
  process.exitCode = 1;
  void pool.end();
});
function shutdown() {
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(() => {
    void pool.end().finally(() => clearTimeout(timeout));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
