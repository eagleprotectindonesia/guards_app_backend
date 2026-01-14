import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const INITIAL_PERMISSIONS = [
  { action: 'view', resource: 'guards', code: 'guards:view', description: 'Can view guards' },
  { action: 'create', resource: 'guards', code: 'guards:create', description: 'Can create guards' },
  { action: 'edit', resource: 'guards', code: 'guards:edit', description: 'Can edit guards' },
  { action: 'delete', resource: 'guards', code: 'guards:delete', description: 'Can delete guards' },
  { action: 'view', resource: 'sites', code: 'sites:view', description: 'Can view sites' },
  { action: 'create', resource: 'sites', code: 'sites:create', description: 'Can create sites' },
  { action: 'edit', resource: 'sites', code: 'sites:edit', description: 'Can edit sites' },
  { action: 'delete', resource: 'sites', code: 'sites:delete', description: 'Can delete sites' },
  { action: 'view', resource: 'shifts', code: 'shifts:view', description: 'Can view shifts' },
  { action: 'create', resource: 'shifts', code: 'shifts:create', description: 'Can create shifts' },
  { action: 'edit', resource: 'shifts', code: 'shifts:edit', description: 'Can edit shifts' },
  { action: 'delete', resource: 'shifts', code: 'shifts:delete', description: 'Can delete shifts' },
  { action: 'view', resource: 'alerts', code: 'alerts:view', description: 'Can view alerts' },
  { action: 'edit', resource: 'alerts', code: 'alerts:edit', description: 'Can acknowledge and resolve alerts' },
  {
    action: 'view',
    resource: 'dashboard',
    code: 'dashboard:view',
    description: 'Can view admin dashboard',
  },
  { action: 'view', resource: 'roles', code: 'roles:view', description: 'Can view roles' },
  { action: 'create', resource: 'roles', code: 'roles:create', description: 'Can create roles' },
  { action: 'edit', resource: 'roles', code: 'roles:edit', description: 'Can edit roles' },
  { action: 'delete', resource: 'roles', code: 'roles:delete', description: 'Can delete roles' },
  { action: 'view', resource: 'chat', code: 'chat:view', description: 'Can view chat messages' },
  { action: 'create', resource: 'chat', code: 'chat:create', description: 'Can send chat messages' },
];

export async function POST() {
  try {
    const email = process.env.INITIAL_ADMIN_EMAIL;
    const password = process.env.INITIAL_ADMIN_PASSWORD;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_PASSWORD not set in environment' },
        { status: 500 }
      );
    }

    // Use a transaction to ensure RBAC initialization and migration are atomic
    const result = await prisma.$transaction(async tx => {
      // 1. Upsert all initial permissions
      const permissions = await Promise.all(
        INITIAL_PERMISSIONS.map(p =>
          tx.permission.upsert({
            where: { code: p.code },
            update: p,
            create: p,
          })
        )
      );

      // 2. Upsert core roles
      const superadminRole = await tx.role.upsert({
        where: { name: 'superadmin' },
        update: {
          permissions: {
            connect: permissions.map(p => ({ id: p.id })),
          },
        },
        create: {
          name: 'superadmin',
          description: 'Full system access',
          isSystem: true,
          permissions: {
            connect: permissions.map(p => ({ id: p.id })),
          },
        },
      });

      const adminRole = await tx.role.upsert({
        where: { name: 'admin' },
        update: {
          permissions: {
            connect: permissions.filter(p => !p.code.startsWith('roles:')).map(p => ({ id: p.id })),
          },
        },
        create: {
          name: 'admin',
          description: 'Standard administrative access',
          isSystem: true,
          permissions: {
            connect: permissions.filter(p => !p.code.startsWith('roles:')).map(p => ({ id: p.id })),
          },
        },
      });

      // 3. Migrate existing admins who are missing a roleId
      const migratedSuperAdmins = await tx.admin.updateMany({
        where: { role: 'superadmin', roleId: null },
        data: { roleId: superadminRole.id },
      });

      const migratedAdmins = await tx.admin.updateMany({
        where: { role: 'admin', roleId: null },
        data: { roleId: adminRole.id },
      });

      // 4. Check if the specific initial admin exists
      const existingAdmin = await tx.admin.findUnique({
        where: { email },
      });

      if (existingAdmin) {
        return {
          status: 200,
          message: 'Admin already exists. RBAC initialized and existing admins migrated.',
          email: existingAdmin.email,
          migratedCount: migratedSuperAdmins.count + migratedAdmins.count,
        };
      }

      // 5. Create the initial admin if it doesn't exist
      const hashedPassword = await bcrypt.hash(password, 10);
      const newAdmin = await tx.admin.create({
        data: {
          name: 'System Admin',
          email,
          hashedPassword,
          role: 'superadmin',
          roleId: superadminRole.id,
        },
      });

      return {
        status: 201,
        message: 'Successfully created initial admin and initialized RBAC.',
        email: newAdmin.email,
      };
    });

    return NextResponse.json(result, { status: result.status });
  } catch (error: unknown) {
    console.error('Initial setup error:', error);
    return NextResponse.json({ error: 'Internal server error', details: (error as Error).message }, { status: 500 });
  }
}
