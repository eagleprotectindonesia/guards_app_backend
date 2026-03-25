import type { Serialized } from '@/lib/server-utils';
import { EmployeeWithRelations } from '@repo/database';

type Props = {
  employee: Serialized<EmployeeWithRelations>;
};

export default function EmployeeDetail({ employee }: Props) {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <label className="block font-medium text-foreground mb-1">Full Name</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
            {employee.fullName}
          </div>
        </div>

        <div>
          <label className="block font-medium text-foreground mb-1">Nickname</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
            {employee.nickname || '-'}
          </div>
        </div>

        <div>
          <label className="block font-medium text-foreground mb-1">Phone Number</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
            {employee.phone || 'N/A'}
          </div>
        </div>

        <div>
          <label className="block font-medium text-foreground mb-1">System ID</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center font-mono">
            {employee.id}
          </div>
        </div>

        <div>
          <label className="block font-medium text-foreground mb-1">Employee Number</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
            {employee.employeeNumber || '-'}
          </div>
        </div>

        <div>
          <label className="block font-medium text-foreground mb-1">Personnel ID</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center font-mono">
            {employee.personnelId || '-'}
          </div>
        </div>

        <div>
          <label className="block font-medium text-foreground mb-1">Job Title</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
            {employee.jobTitle || '-'}
          </div>
        </div>

        <div>
          <label className="block font-medium text-foreground mb-1">Department</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
            {employee.department || '-'}
          </div>
        </div>

        <div>
          <label className="block font-medium text-foreground mb-1">Role</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center capitalize">
            {employee.role?.replace('_', ' ') || '-'}
          </div>
        </div>

        <div>
          <label className="block font-medium text-foreground mb-1">Status</label>
          <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
            <span
              className={`inline-flex items-center ${employee.status ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              <span
                className={`w-2 h-2 rounded-full mr-2 ${employee.status ? 'bg-green-600 dark:bg-green-400' : 'bg-red-600 dark:bg-red-400'}`}
              ></span>
              {employee.status ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block font-medium text-foreground mb-1">Note</label>
          <div className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-foreground min-h-12">
            {employee.note || 'No note provided'}
          </div>
        </div>
      </div>
    </div>
  );
}
