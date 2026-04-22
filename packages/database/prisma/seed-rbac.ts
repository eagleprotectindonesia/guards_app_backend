import { prisma } from '../src';

async function main() {
  console.log('Seeding RBAC permissions...');

  const resources = [
    'employees',
    'sites',
    'offices',
    'office-work-schedules',
    'shifts',
    'shift-types',
    'attendance',
    'checkins',
    'alerts',
    'changelogs',
    'admins',
    'roles',
    'system-settings',
    'dashboard',
    'departments',
    'designations',
    'leave-requests',
    'holiday-calendars',
  ];

  const actions = ['view', 'create', 'edit', 'delete'];

  const permissionsToCreate = [];

  for (const resource of resources) {
    for (const action of actions) {
      permissionsToCreate.push({
        resource,
        action,
        code: `${resource}:${action}`,
        description: `Can ${action} ${resource}`,
      });
    }
  }

  // Use upsert to avoid duplicates
  for (const entry of permissionsToCreate) {
    await (prisma.permission as any).upsert({
      where: { code: entry.code },
      update: {},
      create: entry,
    });
  }

  console.log('Permissions seeded.');

  // Create Roles
  console.log('Creating system roles...');

  // Super Admin: All permissions
  const allPermissions = await (prisma.permission as any).findMany();
  const superAdminRole = await (prisma.role as any).upsert({
    where: { name: 'Super Admin' },
    update: {
      isSystem: true,
      policy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
      },
      permissions: {
        set: allPermissions.map((p: any) => ({ id: p.id })),
      },
    },
    create: {
      name: 'Super Admin',
      isSystem: true,
      description: 'Full access to all system features. Bypasses all permission checks.',
      policy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
      },
      permissions: {
        connect: allPermissions.map((p: any) => ({ id: p.id })),
      },
    },
  });
  console.log('Role "Super Admin" ready.');

  // Default Admin: View only + some edits
  const adminPermissions = await (prisma.permission as any).findMany({
    where: {
      code: {
        in: [
          'dashboard:view',
          'employees:view',
          'employees:create',
          'employees:edit',
          'office-work-schedules:view',
          'office-work-schedules:create',
          'office-work-schedules:edit',
          'sites:view',
          'sites:create',
          'sites:edit',
          'shifts:view',
          'shifts:create',
          'shifts:edit',
          'attendance:view',
          'checkins:view',
          'alerts:view',
          'leave-requests:view',
          'leave-requests:create',
          'leave-requests:edit',
          'holiday-calendars:view',
          'holiday-calendars:create',
          'holiday-calendars:edit',
        ],
      },
    },
  });

  const adminRole = await (prisma.role as any).upsert({
    where: { name: 'Admin' },
    update: {
      isSystem: true,
      policy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
      },
      permissions: {
        set: adminPermissions.map((p: any) => ({ id: p.id })),
      },
    },
    create: {
      name: 'Admin',
      isSystem: true,
      description: 'Standard administrative access.',
      policy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
      },
      permissions: {
        connect: adminPermissions.map((p: any) => ({ id: p.id })),
      },
    },
  });
  console.log('Role "Admin" ready.');

  // Migrate existing admins
  console.log('Migrating existing admins to new roles...');
  const existingAdmins = await (prisma.admin as any).findMany({
    where: { roleId: null },
  });

  for (const admin of existingAdmins) {
    let targetRoleId = adminRole.id;
    if (admin.role === 'superadmin') {
      targetRoleId = superAdminRole.id;
    }

    await (prisma.admin as any).update({
      where: { id: admin.id },
      data: { roleId: targetRoleId },
    });
    console.log(`Migrated admin ${admin.email} to ${admin.role === 'superadmin' ? 'Super Admin' : 'Admin'}`);
  }

  console.log('RBAC Seeding and Migration Complete.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async e => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
