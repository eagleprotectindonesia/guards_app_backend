import { createServer } from 'node:http';
import next from 'next';

const dev = true;
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);

const app = next({
  dev,
  hostname,
  port,
  turbopack: true,
});

const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      handle(req, res);
    }).listen(port, hostname, () => {
      console.log(`> Custom web dev server ready on http://${hostname}:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start custom web dev server', error);
    process.exit(1);
  });
