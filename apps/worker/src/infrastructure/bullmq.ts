import { Queue, Worker, Processor, WorkerOptions, QueueOptions, Job } from 'bullmq';
import { getRedisConnection } from './redis';

/**
 * Creates a BullMQ Queue with standard configuration.
 */
export function createQueue<T = any, R = any, N extends string = string>(
  name: string,
  options?: Omit<QueueOptions, 'connection'>
): Queue<T, R, N> {
  const connection = getRedisConnection();
  return new Queue<T, R, N>(name, {
    ...options,
    connection,
  });
}

/**
 * Creates a BullMQ Worker with standard configuration and error handling.
 */
export function createWorker<T = any, R = any, N extends string = string>(
  name: string,
  processor: Processor<T, R, N>,
  options?: Omit<WorkerOptions, 'connection'>
): Worker<T, R, N> {
  const connection = getRedisConnection();
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
