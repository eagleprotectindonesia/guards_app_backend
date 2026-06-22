import path from 'path';
import dotenv from 'dotenv';

// Load root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import {
  SCHEDULING_QUEUE_NAME,
  CHECK_SHIFTS_JOB_NAME,
  MAINTENANCE_QUEUE_NAME,
  DATA_CLEAN_JOB_NAME,
  OFFICE_ABSENCE_FINALIZE_QUEUE_NAME,
  OFFICE_ABSENCE_FINALIZE_JOB_NAME,
  EMPLOYEE_STATUS_QUEUE_NAME,
  EMPLOYEE_STATUS_CHECK_JOB_NAME,
  EMPLOYEE_SYNC_QUEUE_NAME,
  EMPLOYEE_SYNC_JOB_NAME,
  EMAIL_QUEUE_NAME,
  SHIFT_REMINDER_QUEUE_NAME,
  SHIFT_REMINDER_JOB_NAME,
  SHIFT_PHOTO_REPORT_QUEUE_NAME,
  SHIFT_PHOTO_REPORT_JOB_NAME,
  SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME,
  SHIFT_ATTENDANCE_CLEAN_JOB_NAME,
} from '@repo/database';

import { createQueue, createWorker } from './infrastructure/bullmq';
import { closeRedisConnections } from './infrastructure/redis';
import { SchedulingProcessor } from './processors/scheduling.processor';
import { MaintenanceProcessor } from './processors/maintenance.processor';
import { OfficeAbsenceFinalizeProcessor } from './processors/office-absence-finalize.processor';
import { EmployeeStatusProcessor } from './processors/employee-status.processor';
import { EmployeeSyncProcessor } from './processors/employee-sync.processor';
import { EmailProcessor } from './processors/email.processor';
import { ShiftReminderProcessor } from './processors/shift-reminder.processor';
import { ShiftPhotoReportProcessor } from './processors/shift-photo-report.processor';

// Configuration
const TICK_INTERVAL_MS = 5 * 1000; // 5 seconds
const CLEAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const OFFICE_ABSENCE_FINALIZE_INTERVAL_MS = 1 * 60 * 60 * 1000;
const DAILY_CRON_PATTERN = '0 0 * * *'; // Every day at midnight
const SHIFT_REMINDER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SHIFT_PHOTO_REPORT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function start() {
  console.log('Starting BullMQ workers...');

  // 1. Initialize Processors
  const schedulingProcessor = new SchedulingProcessor();
  const maintenanceProcessor = new MaintenanceProcessor();
  const officeAbsenceFinalizeProcessor = new OfficeAbsenceFinalizeProcessor();
  const employeeStatusProcessor = new EmployeeStatusProcessor();
  const employeeSyncProcessor = new EmployeeSyncProcessor();
  const emailProcessor = new EmailProcessor();
  const shiftReminderProcessor = new ShiftReminderProcessor();
  const shiftPhotoReportProcessor = new ShiftPhotoReportProcessor();

  // 2. Initialize Queues and Add Repeatable Jobs
  const schedulingQueue = createQueue(SCHEDULING_QUEUE_NAME);
  const maintenanceQueue = createQueue(MAINTENANCE_QUEUE_NAME);
  const officeAbsenceFinalizeQueue = createQueue(OFFICE_ABSENCE_FINALIZE_QUEUE_NAME);
  const employeeStatusQueue = createQueue(EMPLOYEE_STATUS_QUEUE_NAME);
  const employeeSyncQueue = createQueue(EMPLOYEE_SYNC_QUEUE_NAME);
  const emailQueue = createQueue(EMAIL_QUEUE_NAME);
  const shiftReminderQueue = createQueue(SHIFT_REMINDER_QUEUE_NAME);
  const shiftPhotoReportQueue = createQueue(SHIFT_PHOTO_REPORT_QUEUE_NAME);

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

  await maintenanceQueue.add(
    SHIFT_ATTENDANCE_CLEAN_JOB_NAME,
    {},
    {
      repeat: { every: CLEAN_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  await maintenanceQueue.add(
    SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME,
    {},
    {
      repeat: { pattern: DAILY_CRON_PATTERN },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  await officeAbsenceFinalizeQueue.add(
    OFFICE_ABSENCE_FINALIZE_JOB_NAME,
    {},
    {
      repeat: { every: OFFICE_ABSENCE_FINALIZE_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  await employeeStatusQueue.add(
    EMPLOYEE_STATUS_CHECK_JOB_NAME,
    {},
    {
      repeat: { pattern: DAILY_CRON_PATTERN },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  await employeeSyncQueue.add(
    EMPLOYEE_SYNC_JOB_NAME,
    {},
    {
      repeat: { pattern: DAILY_CRON_PATTERN },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  await shiftReminderQueue.add(
    SHIFT_REMINDER_JOB_NAME,
    {},
    {
      repeat: { every: SHIFT_REMINDER_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  await shiftPhotoReportQueue.add(
    SHIFT_PHOTO_REPORT_JOB_NAME,
    {},
    {
      repeat: { every: SHIFT_PHOTO_REPORT_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  // 3. Initialize Workers
  const workers = [
    createWorker(SCHEDULING_QUEUE_NAME, job => schedulingProcessor.process(job)),
    createWorker(MAINTENANCE_QUEUE_NAME, job => maintenanceProcessor.process(job)),
    createWorker(OFFICE_ABSENCE_FINALIZE_QUEUE_NAME, job => officeAbsenceFinalizeProcessor.process(job)),
    createWorker(EMPLOYEE_STATUS_QUEUE_NAME, job => employeeStatusProcessor.process(job)),
    createWorker(EMPLOYEE_SYNC_QUEUE_NAME, job => employeeSyncProcessor.process(job)),
    createWorker(EMAIL_QUEUE_NAME, job => emailProcessor.process(job)),
    createWorker(SHIFT_REMINDER_QUEUE_NAME, job => shiftReminderProcessor.process(job)),
    createWorker(SHIFT_PHOTO_REPORT_QUEUE_NAME, job => shiftPhotoReportProcessor.process(job)),
  ];

  console.log('All workers started.');

  // Handle Shutdown
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.log(`Received ${signal}, shutting down...`);

    await Promise.all(workers.map(w => w.close()));
    await schedulingQueue.close();
    await maintenanceQueue.close();
    await officeAbsenceFinalizeQueue.close();
    await employeeStatusQueue.close();
    await employeeSyncQueue.close();
    await emailQueue.close();
    await shiftReminderQueue.close();
    await shiftPhotoReportQueue.close();
    await closeRedisConnections();

    console.log('Graceful shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGUSR2', () => shutdown('SIGUSR2'));
}

start().catch(err => {
  console.error('Error starting workers:', err);
  process.exit(1);
});
