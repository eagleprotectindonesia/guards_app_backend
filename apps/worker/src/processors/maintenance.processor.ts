import { Job } from 'bullmq';
import { DATA_CLEAN_JOB_NAME, SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME, deleteOldShiftPhotoReports } from '@repo/database';
import { db as prisma } from '@repo/database';
import { deleteS3Object } from '@repo/storage';
import { ChatMessageStatus } from '@prisma/client';

const RETENTION_DAYS = 60;

export class MaintenanceProcessor {
  async process(job: Job) {
    if (job.name === DATA_CLEAN_JOB_NAME) {
      await this.clean();
    } else if (job.name === SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME) {
      await this.cleanOldShiftPhotoReports();
    }
  }

  private async clean() {
    try {
      console.log(`[MaintenanceProcessor] Running data cleaning tasks...`);
      const result = await prisma.chatMessage.updateMany({
        where: {
          status: ChatMessageStatus.draft,
          draftExpiresAt: {
            lte: new Date(),
          },
        },
        data: {
          status: ChatMessageStatus.expired,
        },
      });

      if (result.count > 0) {
        console.log(`[MaintenanceProcessor] Expired ${result.count} stale chat drafts.`);
      }
    } catch (error) {
      console.error(`[MaintenanceProcessor] Data clean error:`, error);
    }
  }

  private async cleanOldShiftPhotoReports() {
    try {
      const olderThan = new Date();
      olderThan.setDate(olderThan.getDate() - RETENTION_DAYS);
      olderThan.setHours(0, 0, 0, 0);

      console.log(`[MaintenanceProcessor] Cleaning shift photo reports older than ${olderThan.toISOString()}...`);

      const { deleted, s3Keys } = await deleteOldShiftPhotoReports(olderThan);

      let s3Deleted = 0;
      let s3Errors = 0;
      for (const key of s3Keys) {
        try {
          await deleteS3Object(key);
          s3Deleted++;
        } catch (err) {
          s3Errors++;
          console.error(`[MaintenanceProcessor] Failed to delete S3 object: ${key}`, err);
        }
      }

      if (deleted > 0 || s3Keys.length > 0) {
        console.log(
          `[MaintenanceProcessor] Deleted ${deleted} old shift photo reports ` +
          `(S3 cleaned: ${s3Deleted}, S3 errors: ${s3Errors})`
        );
      }
    } catch (error) {
      console.error(`[MaintenanceProcessor] Shift photo report clean error:`, error);
    }
  }
}
