import { Job } from 'bullmq';

/**
 * Legacy processor for employee status checks.
 * In the new external sync architecture, status is managed by the sync processor.
 * This processor is kept as a no-op to avoid breaking existing configurations.
 */
export class EmployeeStatusProcessor {
  async process(job: Job) {
    console.log(`[EmployeeStatusProcessor] Maintenance tick (Job ${job.id}) - No-op (Status managed by Sync)`);
    return { ok: true };
  }
}