import { createServer } from 'http';
import { initRealtimeSocket } from '@repo/realtime';

const port = Number(process.env.REALTIME_PORT || 3001);
const shouldEnableSystemSubscribers = process.env.ENABLE_REALTIME_SYSTEM_SUBSCRIBERS !== 'false';

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

initRealtimeSocket(server, { enableSystemSubscribers: shouldEnableSystemSubscribers });

server.listen(port, () => {
  console.log(`[realtime] listening on http://localhost:${port}`);
  console.log(`[realtime] system subscribers ${shouldEnableSystemSubscribers ? 'enabled' : 'disabled'}`);
});
