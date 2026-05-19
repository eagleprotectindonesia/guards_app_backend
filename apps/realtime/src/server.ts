import { createServer } from 'http';
import { initRealtimeSocket } from '@repo/realtime';

const port = Number(process.env.REALTIME_PORT || 3001);
const shouldEnableSystemSubscribers = process.env.ENABLE_REALTIME_SYSTEM_SUBSCRIBERS !== 'false';
const SHUTDOWN_TIMEOUT_MS = 5000;

const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('OK');
    return;
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('Not Found');
});

const cleanupTasks: Array<() => void | Promise<void>> = [];
const io = initRealtimeSocket(server, {
  enableSystemSubscribers: shouldEnableSystemSubscribers,
  registerCleanup: cleanup => cleanupTasks.push(cleanup),
});

let isShuttingDown = false;

const shutdown = async (signal: string, exitCode = 0) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[realtime] received ${signal}, shutting down...`);

  const forceExitTimer = setTimeout(() => {
    console.error('[realtime] forced shutdown timeout reached');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  await new Promise<void>(resolve => {
    io.close(() => resolve());
  });
  await new Promise<void>(resolve => {
    server.close(() => resolve());
  });
  await Promise.allSettled(cleanupTasks.map(cleanup => cleanup()));

  clearTimeout(forceExitTimer);
  console.log('[realtime] graceful shutdown complete.');
  process.exit(exitCode);
};

server.listen(port, () => {
  console.log(`[realtime] listening on http://localhost:${port}`);
  console.log(`[realtime] system subscribers ${shouldEnableSystemSubscribers ? 'enabled' : 'disabled'}`);
});

server.on('error', error => {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`[realtime] port ${port} is already in use`);
    void shutdown('EADDRINUSE', 1);
    return;
  }
  console.error('[realtime] server error:', error);
  void shutdown('SERVER_ERROR', 1);
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGUSR2', () => {
  void shutdown('SIGUSR2');
});
