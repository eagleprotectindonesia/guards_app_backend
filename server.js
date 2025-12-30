// server.js
import http from 'node:http';
import next from 'next';

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || '0.0.0.0';

// Always production in Docker
const dev = false;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  /**
   * 🔥 CRITICAL TIMEOUTS 🔥
   * These prevent POST deadlocks forever
   */
  server.requestTimeout = 15_000; // total request time
  server.headersTimeout = 16_000; // must be > requestTimeout
  server.keepAliveTimeout = 5_000; // avoid socket pile‑up

  /**
   * Optional but recommended hardening
   */
  server.maxHeadersCount = 1000;

  server.listen(Number(port), hostname, () => {
    console.log(`✅ Next.js 16 server running on http://${hostname}:${port}`);
  });
});
