import { NextResponse } from 'next/server';
import { 
  fetchExternalEmployees, 
  upsertEmployeeFromExternal, 
  deactivateEmployeesNotIn,
  prisma
} from '@repo/database';
import { hashPassword } from '@repo/shared';
import { EmployeeRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    console.log('[ManualSync] Starting manual employee sync...');

    // 1. Fetch from external API
    const externalEmployees = await fetchExternalEmployees();
    const externalIds = externalEmployees.map(e => e.id);
    
    // 2. Fetch existing employees
    const existingEmployees = await prisma.employee.findMany({
      where: { id: { in: externalIds } },
      select: { id: true }
    });
    const existingIds = new Set(existingEmployees.map(e => e.id));

    let addedCount = 0;
    let updatedCount = 0;

    for (const ext of externalEmployees) {
      const role: EmployeeRole = ext.office_id ? 'office' : 'on_site';

      if (!existingIds.has(ext.id)) {
        const defaultPassword = ext.personnel_id || '123456'; 
        const hashedPassword = await hashPassword(defaultPassword);
        
        await upsertEmployeeFromExternal({
          ...ext,
          employeeNumber: ext.employee_number,
          personnelId: ext.personnel_id,
          fullName: ext.full_name,
          jobTitle: ext.job_title,
          phone: '', 
          password: hashedPassword,
          role,
        });
        addedCount++;
      } else {
        await upsertEmployeeFromExternal({
          ...ext,
          employeeNumber: ext.employee_number,
          personnelId: ext.personnel_id,
          fullName: ext.full_name,
          jobTitle: ext.job_title,
          role,
          phone: '', 
        });
        updatedCount++;
      }
    }

    // 3. Deactivate those not in external list
    const { deactivatedCount } = await deactivateEmployeesNotIn(externalIds);

    return NextResponse.json({
      success: true,
      added: addedCount,
      updated: updatedCount,
      deactivated: deactivatedCount
    });
  } catch (error) {
    console.error('[ManualSync] Failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync employees' },
      { status: 500 }
    );
  }
}
