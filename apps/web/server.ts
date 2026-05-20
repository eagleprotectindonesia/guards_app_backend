import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'node:url';
import next from 'next';
import { initRealtimeSocket } from '@repo/realtime';

const isProd = process.env.NODE_ENV === 'production';
const dev = !isProd;
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const useHttps = process.argv.includes('--https');

const app = next({
  dev,
  hostname,
  port,
  turbopack: dev,
});

const handle = app.getRequestHandler();

async function start() {
  await app.prepare();

  const requestListener = async (req: Parameters<typeof handle>[0], res: Parameters<typeof handle>[1]) => {
    try {
      const parsedUrl = parse(req.url || '', true);
      await handle(req, res, parsedUrl);
    } catch (error) {
      console.error('Error occurred handling', req.url, error);
      res.statusCode = 500;
      res.end('internal server error');
    }
  };

  const server = useHttps
    ? createHttpsServer(
        {
          key: readFileSync(join(process.cwd(), 'certificates', 'localhost-key.pem')),
          cert: readFileSync(join(process.cwd(), 'certificates', 'localhost.pem')),
        },
        requestListener
      )
    : createHttpServer(requestListener);

  const io = initRealtimeSocket(server, {
    enableSystemSubscribers: true,
  });

  const shutdown = (signal: string) => {
    console.log(`[web] received ${signal}, shutting down...`);
    io.close(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  server.listen(port, hostname, () => {
    const protocol = useHttps ? 'https' : 'http';
    console.log(`> Custom web dev server ready on ${protocol}://${hostname}:${port}`);
  });
}

start().catch(error => {
  console.error('Failed to start custom web server', error);
  process.exit(1);
});
