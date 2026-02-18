import { Job } from 'bullmq';
import { 
  fetchExternalEmployees, 
  upsertEmployeeFromExternal, 
  deactivateEmployeesNotIn,
  prisma,
} from '@repo/database';
import { hashPassword } from '@repo/shared';
import { EmployeeRole } from '@prisma/client';

export class EmployeeSyncProcessor {
  async process(job: Job) {
    console.log(`[EmployeeSyncProcessor] Starting sync job: ${job.id}`);

    try {
      // 1. Fetch from external API
      const externalEmployees = await fetchExternalEmployees();
      console.log(`[EmployeeSyncProcessor] Fetched ${externalEmployees.length} employees from external API`);

      const externalIds = externalEmployees.map(e => e.id);
      
      // 2. Fetch existing employees to avoid unnecessary hashing
      const existingEmployees = await prisma.employee.findMany({
        where: { id: { in: externalIds } },
        select: { id: true }
      });
      const existingIds = new Set(existingEmployees.map(e => e.id));

      let addedCount = 0;
      let updatedCount = 0;

      for (const ext of externalEmployees) {
        // Role mapping: office_id != null -> office, office_id == null -> on_site
        const role: EmployeeRole = ext.office_id ? 'office' : 'on_site';

        if (!existingIds.has(ext.id)) {
          // New employee: use personnel_id as default password
          const defaultPassword = ext.personnel_id || '123456'; 
          const hashedPassword = await hashPassword(defaultPassword);
          
          await upsertEmployeeFromExternal({
            id: ext.id,
            employeeNumber: ext.employee_number,
            personnelId: ext.personnel_id,
            nickname: ext.nickname,
            fullName: ext.full_name,
            jobTitle: ext.job_title,
            department: ext.department,
            phone: '', 
            password: hashedPassword,
            role,
          });
          addedCount++;
        } else {
          // Existing employee: only update profile fields
          await upsertEmployeeFromExternal({
            id: ext.id,
            employeeNumber: ext.employee_number,
            personnelId: ext.personnel_id,
            nickname: ext.nickname,
            fullName: ext.full_name,
            jobTitle: ext.job_title,
            department: ext.department,
            role,
            phone: '', 
          });
          updatedCount++;
        }
      }

      // 3. Deactivate those not in external list
      const { deactivatedCount } = await deactivateEmployeesNotIn(externalIds);

      console.log(`[EmployeeSyncProcessor] Sync completed: ${addedCount} added, ${updatedCount} updated, ${deactivatedCount} deactivated`);
      
      return {
        added: addedCount,
        updated: updatedCount,
        deactivated: deactivatedCount
      };
    } catch (error) {
      console.error('[EmployeeSyncProcessor] Sync job failed:', error);
      throw error;
    }
  }
}
