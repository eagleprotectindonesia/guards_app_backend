import { RolePolicy, rolePolicySchema } from '@repo/validations';

const DEFAULT_ROLE_POLICY: RolePolicy = {
  employees: { scope: 'all' },
  attendance: { scope: 'all' },
  leaveRequests: { annualApprover: 'manager' },
};

export function normalizeRolePolicy(policy: unknown): RolePolicy {
  const parsedPolicy = rolePolicySchema.safeParse(policy);
  if (parsedPolicy.success) {
    return parsedPolicy.data;
  }

  return DEFAULT_ROLE_POLICY;
}
