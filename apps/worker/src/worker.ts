import path from 'path';
import dotenv from 'dotenv';

// Load root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import {
  SCHEDULING_QUEUE_NAME,
  CHECK_SHIFTS_JOB_NAME,
  MAINTENANCE_QUEUE_NAME,
  DATA_CLEAN_JOB_NAME,
  GUARD_STATUS_QUEUE_NAME,
  GUARD_STATUS_CHECK_JOB_NAME,
} from '@repo/shared';

import { createQueue, createWorker } from './infrastructure/bullmq';
import { closeRedisConnections } from './infrastructure/redis';
import { SchedulingProcessor } from './processors/scheduling.processor';
import { MaintenanceProcessor } from './processors/maintenance.processor';
import { GuardStatusProcessor } from './processors/guard-status.processor';

// Configuration
const TICK_INTERVAL_MS = 5 * 1000; // 5 seconds
const CLEAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DAILY_CRON_PATTERN = '0 0 * * *'; // Every day at midnight

async function start() {
  console.log('Starting BullMQ workers...');

  // 1. Initialize Processors
  const schedulingProcessor = new SchedulingProcessor();
  const maintenanceProcessor = new MaintenanceProcessor();
  const guardStatusProcessor = new GuardStatusProcessor();

  // 2. Initialize Queues and Add Repeatable Jobs
  const schedulingQueue = createQueue(SCHEDULING_QUEUE_NAME);
  const maintenanceQueue = createQueue(MAINTENANCE_QUEUE_NAME);
  const guardStatusQueue = createQueue(GUARD_STATUS_QUEUE_NAME);

  console.log('Registering repeatable jobs...');

  await schedulingQueue.add(
    CHECK_SHIFTS_JOB_NAME,
    {},
    {
      repeat: { every: TICK_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  await maintenanceQueue.add(
    DATA_CLEAN_JOB_NAME,
    {},
    {
      repeat: { every: CLEAN_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  await guardStatusQueue.add(
    GUARD_STATUS_CHECK_JOB_NAME,
    {},
    {
      repeat: { pattern: DAILY_CRON_PATTERN },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  // 3. Initialize Workers
  const workers = [
    createWorker(SCHEDULING_QUEUE_NAME, job => schedulingProcessor.process(job)),
    createWorker(MAINTENANCE_QUEUE_NAME, job => maintenanceProcessor.process(job)),
    createWorker(GUARD_STATUS_QUEUE_NAME, job => guardStatusProcessor.process(job)),
  ];

  console.log('All workers started.');

  // Handle Shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);

    await Promise.all(workers.map(w => w.close()));
    await schedulingQueue.close();
    await maintenanceQueue.close();
    await guardStatusQueue.close();
    await closeRedisConnections();

    console.log('Graceful shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => {
  console.error('Error starting workers:', err);
  process.exit(1);
});
