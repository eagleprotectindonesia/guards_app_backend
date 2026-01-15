import { getActiveEmployees, updateEmployeeWithChangelog, getEffectiveStatus } from '@repo/database';
import { Job } from 'bullmq';
import { EMPLOYEE_STATUS_CHECK_JOB_NAME } from '@repo/shared';

export class EmployeeStatusProcessor {
  async process(job: Job) {
    if (job.name === EMPLOYEE_STATUS_CHECK_JOB_NAME) {
      await this.checkEmployeeStatuses();
    }
  }

  private async checkEmployeeStatuses() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`[EmployeeStatusProcessor] Running daily employee status check for ${todayStr}...`);

    try {
      const activeEmployees = await getActiveEmployees();
      let updatedCount = 0;

      for (const employee of activeEmployees) {
        const shouldBeActive = getEffectiveStatus(true, employee.joinDate, employee.leftDate);

        if (!shouldBeActive) {
          console.log(`[EmployeeStatusProcessor] Deactivating employee ${employee.firstName} ${employee.lastName} (${employee.id})`);
          
          await updateEmployeeWithChangelog(
            employee.id,
            { status: false },
            null // System update, no adminId
          );
          updatedCount++;
        }
      }

      console.log(`[EmployeeStatusProcessor] Daily employee status check complete. Updated ${updatedCount} employees.`);
    } catch (error) {
      console.error(`[EmployeeStatusProcessor] Error checking employee statuses:`, error);
      throw error;
    }
  }
}