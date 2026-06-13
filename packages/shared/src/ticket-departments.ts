export const TICKET_DEPARTMENT_MAPPINGS: Record<string, string[]> = {
  HR: ['HR', 'Human Resources'],
  IT: ['IT', 'IT Department', 'Information Technology'],
  CS: ['CS', 'Customer Service', 'Customer Support'],
};

export function isTicketEnabledDepartment(employeeDept: string | null | undefined): boolean {
  if (!employeeDept) return false;
  const normalizedDept = employeeDept.trim().toLowerCase();

  // Check if the employee's department matches any of our mapped names (case-insensitive)
  return Object.values(TICKET_DEPARTMENT_MAPPINGS).some(depts =>
    depts.some(dept => dept.toLowerCase() === normalizedDept)
  );
}
