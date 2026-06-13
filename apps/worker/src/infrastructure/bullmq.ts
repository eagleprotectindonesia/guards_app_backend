import { Queue, Worker, Processor, WorkerOptions, QueueOptions, Job } from 'bullmq';
import { getBullMqConnectionOptions } from './redis';

/**
 * Creates a BullMQ Queue with standard configuration.
 */
export function createQueue<T = any, R = any, N extends string = string>(
  name: N,
  options?: Omit<QueueOptions, 'connection'>
) {
  const connection = getBullMqConnectionOptions();
  return new Queue<T, R, N>(name, {
    ...options,
    connection,
  });
}

/**
 * Creates a BullMQ Worker with standard configuration and error handling.
 */
export function createWorker<T = any, R = any, N extends string = string>(
  name: N,
  processor: Processor<T, R, N>,
  options?: Omit<WorkerOptions, 'connection'>
) {
  const connection = getBullMqConnectionOptions();
  const worker = new Worker<T, R, N>(name, processor, {
    ...options,
    connection,
  });

  worker.on('error', err => {
    console.error(`[Worker:${name}] Global error:`, err);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[Worker:${name}] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
