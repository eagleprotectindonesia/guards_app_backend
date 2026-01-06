import path from 'path';
import dotenv from 'dotenv';

// Load root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { SchedulingWorker } from './workers/scheduling-worker';
import { MaintenanceWorker } from './workers/maintenance-worker';

const workers = [new SchedulingWorker(), new MaintenanceWorker()];

async function start() {
  console.log('Starting workers...');
  // We don't await start() to block, but start() returns a Promise that resolves when the worker is *initialized* and the loop *started*.
  // The loop itself runs in the background.
  await Promise.all(workers.map(w => w.start()));
  console.log('All workers started.');
}

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down workers...`);
  await Promise.all(workers.map(w => w.stop(signal)));
  console.log('All workers stopped.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch(err => {
  console.error('Error starting workers:', err);
  process.exit(1);
});
