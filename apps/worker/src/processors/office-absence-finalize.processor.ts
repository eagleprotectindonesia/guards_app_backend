import { Job } from 'bullmq';
import { OFFICE_ABSENCE_FINALIZE_JOB_NAME, finalizeOfficeDailyAbsences } from '@repo/database';

export class OfficeAbsenceFinalizeProcessor {
  async process(job: Job) {
    if (job.name === OFFICE_ABSENCE_FINALIZE_JOB_NAME) {
      await this.finalizeOfficeDailyAbsences();
    }
  }

  private async finalizeOfficeDailyAbsences() {
    try {
      console.log('[OfficeAbsenceFinalizeProcessor] Running office absence finalization...');
      const result = await finalizeOfficeDailyAbsences(new Date());
      if (result.created > 0) {
        console.log(`[OfficeAbsenceFinalizeProcessor] Auto-finalized ${result.created} office absences.`);
      }
    } catch (error) {
      console.error('[OfficeAbsenceFinalizeProcessor] Finalization error:', error);
    }
  }
}
