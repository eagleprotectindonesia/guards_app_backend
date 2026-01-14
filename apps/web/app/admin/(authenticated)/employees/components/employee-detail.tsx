import { Serialized } from '@/lib/utils';
import { Employee } from '@prisma/client';

type Props = {
  employee: Serialized<Employee>;
};

const formatDate = (date: string | null) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function EmployeeDetail({ employee }: Props) {
  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">Employee Details</h1>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Name Field */}
          <div>
            <label className="block font-medium text-foreground mb-1">Full Name</label>
            <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
              {employee.name}
            </div>
          </div>

          {/* Phone Field */}
          <div>
            <label className="block font-medium text-foreground mb-1">Phone Number</label>
            <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
              {employee.phone || 'N/A'}
            </div>
          </div>

          {/* Employee ID Field */}
          <div>
            <label className="block font-medium text-foreground mb-1">Employee ID</label>
            <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
              {employee.id}
            </div>
          </div>

          {/* Employee Code Field */}
          <div>
            <label className="block font-medium text-foreground mb-1">Employee Code</label>
            <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
              {employee.employeeCode || employee.employeeCode}
            </div>
          </div>

          {/* Status Field */}
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

          {/* Join Date Field */}
          <div>
            <label className="block font-medium text-foreground mb-1">Join Date</label>
            <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
              {formatDate(employee.joinDate)}
            </div>
          </div>

          {/* Left Date Field */}
          <div>
            <label className="block font-medium text-foreground mb-1">Left Date</label>
            <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
              {formatDate(employee.leftDate)}
            </div>
          </div>

          {/* Note Field */}
          <div className="md:col-span-2">
            <label className="block font-medium text-foreground mb-1">Note</label>
            <div className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-foreground min-h-12">
              {employee.note || 'No note provided'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
