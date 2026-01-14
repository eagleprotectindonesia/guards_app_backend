import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const INITIAL_PERMISSIONS = [
  { action: 'view', resource: 'guards', code: 'guards:view', description: 'Can view guards' },
  { action: 'manage', resource: 'guards', code: 'guards:manage', description: 'Can create, edit, and delete guards' },
  { action: 'view', resource: 'sites', code: 'sites:view', description: 'Can view sites' },
  { action: 'manage', resource: 'sites', code: 'sites:manage', description: 'Can create, edit, and delete sites' },
  { action: 'view', resource: 'shifts', code: 'shifts:view', description: 'Can view shifts' },
  { action: 'manage', resource: 'shifts', code: 'shifts:manage', description: 'Can create, edit, and delete shifts' },
  { action: 'view', resource: 'alerts', code: 'alerts:view', description: 'Can view alerts' },
  { action: 'manage', resource: 'alerts', code: 'alerts:manage', description: 'Can acknowledge and resolve alerts' },
  { action: 'view', resource: 'admin_dashboard', code: 'admin_dashboard:view', description: 'Can view admin dashboard' },
  { action: 'manage', resource: 'rbac', code: 'rbac:manage', description: 'Can manage roles and permissions' },
  { action: 'view', resource: 'chat', code: 'chat:view', description: 'Can view chat messages' },
  { action: 'send', resource: 'chat', code: 'chat:send', description: 'Can send chat messages' },
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
    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert all initial permissions
      const permissions = await Promise.all(
        INITIAL_PERMISSIONS.map((p) =>
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
            connect: permissions.map((p) => ({ id: p.id })),
          },
        },
        create: {
          name: 'superadmin',
          description: 'Full system access',
          isSystem: true,
          permissions: {
            connect: permissions.map((p) => ({ id: p.id })),
          },
        },
      });

      const adminRole = await tx.role.upsert({
        where: { name: 'admin' },
        update: {
          permissions: {
            connect: permissions
              .filter((p) => !['rbac:manage'].includes(p.code))
              .map((p) => ({ id: p.id })),
          },
        },
        create: {
          name: 'admin',
          description: 'Standard administrative access',
          isSystem: true,
          permissions: {
            connect: permissions
              .filter((p) => !['rbac:manage'].includes(p.code))
              .map((p) => ({ id: p.id })),
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