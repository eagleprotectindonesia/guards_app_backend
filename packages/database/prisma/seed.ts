import { prisma } from '../src';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('Seeding database...');

  // 1. Create Permissions
  console.log('Creating permissions...');
  const permissionsData = [
    { action: 'view', resource: 'employees', code: 'employees:view', description: 'Can view employees' },
    { action: 'create', resource: 'employees', code: 'employees:create', description: 'Can create employees' },
    { action: 'edit', resource: 'employees', code: 'employees:edit', description: 'Can edit employees' },
    { action: 'delete', resource: 'employees', code: 'employees:delete', description: 'Can delete employees' },
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
    { action: 'view', resource: 'dashboard', code: 'dashboard:view', description: 'Can view admin dashboard' },
    { action: 'view', resource: 'roles', code: 'roles:view', description: 'Can view roles' },
    { action: 'create', resource: 'roles', code: 'roles:create', description: 'Can create roles' },
    { action: 'edit', resource: 'roles', code: 'roles:edit', description: 'Can edit roles' },
    { action: 'delete', resource: 'roles', code: 'roles:delete', description: 'Can delete roles' },
    { action: 'view', resource: 'chat', code: 'chat:view', description: 'Can view chat messages' },
    { action: 'create', resource: 'chat', code: 'chat:create', description: 'Can send chat messages' },
  ];

  const createdPermissions = await Promise.all(
    permissionsData.map(p =>
      prisma.permission.upsert({
        where: { code: p.code },
        update: p,
        create: p,
      })
    )
  );

  // 2. Create Roles
  console.log('Creating roles...');
  const superadminRole = await prisma.role.upsert({
    where: { name: 'superadmin' },
    update: {},
    create: {
      name: 'superadmin',
      description: 'Full system access',
      isSystem: true,
      permissions: {
        connect: createdPermissions.map(p => ({ id: p.id })),
      },
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: 'Standard administrative access',
      isSystem: true,
      permissions: {
        connect: createdPermissions.filter(p => !p.code.startsWith('roles:')).map(p => ({ id: p.id })),
      },
    },
  });

  // 3. Create Sites
  const site1 = await prisma.site.upsert({
    where: { name: 'Headquarters' },
    update: {},
    create: {
      name: 'Headquarters',
      clientName: 'Headquarters Owner',
      address: 'Jl. Umalas 1 Gg. XXII, Kerobokan Kelod, Kec. Kuta Utara, Kabupaten Badung, Bali, Indonesia',
      latitude: -8.6695866,
      longitude: 115.1538065,
    },
  });
  console.log('Created Site 1:', site1.id);

  const site2 = await prisma.site.upsert({
    where: { name: 'Downtown Branch' },
    update: {},
    create: {
      name: 'Downtown Branch',
      clientName: 'Downtown Branch Owner',
      address: 'Pemogan, Denpasar Selatan, Denpasar City, Bali, Indonesia',
      latitude: -8.717255399999999,
      longitude: 115.1948445,
    },
  });
  console.log('Created Site 2:', site2.id);

  const site3 = await prisma.site.upsert({
    where: { name: 'Lilu Rental' },
    update: {},
    create: {
      name: 'Lilu Rental',
      clientName: 'Warehouse Manager',
      address: 'Jl. Mahendradatta Utara No.758, Tegal Kertha, Kec. Denpasar Bar., Kota Denpasar, Bali 80361, Indonesia',
      latitude: -8.654809799999999,
      longitude: 115.1927169,
    },
  });
  console.log('Created Site 3:', site3.id);

  // 5. Create Employees
  const employeePassword = '123456';
  const hashedEmployeePassword = await bcrypt.hash(employeePassword, 10);

  const employee1 = await prisma.employee.upsert({
    where: { id: '5129e367-9763-44a5-adf9-7d6438d90bf8' },
    update: { role: 'on_site' },
    create: {
      id: '5129e367-9763-44a5-adf9-7d6438d90bf8',
      employeeNumber: 'EP0098',
      personnelId: '0290188',
      nickname: 'Ivan',
      fullName: 'Abu Hanivan Naneng',
      jobTitle: 'Security Standby',
      department: 'Security Standby',
      phone: '+62551234567',
      hashedPassword: hashedEmployeePassword,
      role: 'on_site',
    },
  });
  console.log('Created Employee 1:', employee1.id);

  const employee2 = await prisma.employee.upsert({
    where: { id: 'b7a1eb70-6048-418d-ad8c-292b7fdfa1a3' },
    update: { role: 'on_site' },
    create: {
      id: 'b7a1eb70-6048-418d-ad8c-292b7fdfa1a3',
      employeeNumber: 'EP0047',
      personnelId: 'IT29003',
      nickname: 'Ahmad',
      fullName: 'Achmad Iman Elhaq',
      jobTitle: 'IT Tech Lead',
      department: 'IT',
      phone: '+625551234568',
      hashedPassword: hashedEmployeePassword,
      role: 'office',
    },
  });
  console.log('Created Employee 2:', employee2.id);

  // 6. Create Admin
  const adminPassword = 'password123';
  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.admin.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@example.com',
      hashedPassword: hashedAdminPassword,
      role: 'superadmin',
      roleId: superadminRole.id,
    },
  });
  console.log('Created Admin:', admin.id);

  // 6. Create Shift Types
  const morningShiftType = await prisma.shiftType.upsert({
    where: { name: 'Morning Shift' },
    update: {},
    create: {
      name: 'Morning Shift',
      startTime: '08:00',
      endTime: '16:00',
    },
  });
  console.log('Created Morning Shift Type:', morningShiftType.id);

  const afternoonShiftType = await prisma.shiftType.upsert({
    where: { name: 'Afternoon Shift' },
    update: {},
    create: {
      name: 'Afternoon Shift',
      startTime: '16:00',
      endTime: '00:00',
    },
  });
  console.log('Created Afternoon Shift Type:', afternoonShiftType.id);

  const nightShiftType = await prisma.shiftType.upsert({
    where: { name: 'Night Shift' },
    update: {},
    create: {
      name: 'Night Shift',
      startTime: '22:00',
      endTime: '06:00',
    },
  });
  console.log('Created Night Shift Type:', nightShiftType.id);

  // 7. Create shifts for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const morningStartsAt = new Date(today);
  morningStartsAt.setHours(8, 0, 0, 0);
  const morningEndsAt = new Date(today);
  morningEndsAt.setHours(16, 0, 0, 0);

  // Note: Shifts don't have a natural unique key in this seed, so we just create them if they don't exist for the day
  const existingShifts = await prisma.shift.count({
    where: { date: today },
  });

  if (existingShifts === 0) {
    const shiftToday1 = await prisma.shift.create({
      data: {
        siteId: site1.id,
        shiftTypeId: morningShiftType.id,
        employeeId: employee1.id,
        date: today,
        startsAt: morningStartsAt,
        endsAt: morningEndsAt,
        status: 'scheduled',
        requiredCheckinIntervalMins: 30,
        graceMinutes: 4,
      },
    });
    console.log('Created Shift for today (Employee 1):', shiftToday1.id);

    const afternoonStartsAt = new Date(today);
    afternoonStartsAt.setHours(16, 0, 0, 0);
    const afternoonEndsAt = new Date(today);
    afternoonEndsAt.setDate(afternoonEndsAt.getDate() + 1);
    afternoonEndsAt.setHours(0, 0, 0, 0);

    const afternoonShift = await prisma.shift.create({
      data: {
        siteId: site2.id,
        shiftTypeId: afternoonShiftType.id,
        employeeId: employee2.id,
        date: today,
        startsAt: afternoonStartsAt,
        endsAt: afternoonEndsAt,
        status: 'scheduled',
        requiredCheckinIntervalMins: 20,
        graceMinutes: 4,
      },
    });
    console.log('Created Afternoon Shift:', afternoonShift.id);

    const nightShiftStartsAt = new Date(today);
    nightShiftStartsAt.setHours(22, 0, 0, 0);
    const nightShiftEndsAt = new Date(today);
    nightShiftEndsAt.setDate(nightShiftEndsAt.getDate() + 1);
    nightShiftEndsAt.setHours(6, 0, 0, 0);

    //   const overnightShift = await prisma.shift.create({
    //     data: {
    //       siteId: site3.id,
    //       shiftTypeId: nightShiftType.id,
    //       employeeId: employee3.id,
    //       date: today,
    //       startsAt: nightShiftStartsAt,
    //       endsAt: nightShiftEndsAt,
    //       status: 'scheduled',
    //       requiredCheckinIntervalMins: 5,
    //       graceMinutes: 4,
    //     },
    //   });
    //   console.log('Created Overnight Shift:', overnightShift.id);
    // }

    // 8. Create System Settings
    console.log('Creating system settings...');
    const systemSettings = [
      { name: 'GEOFENCE_GRACE_MINUTES', value: '5', note: 'Grace period for returning to the geofence (minutes)' },
      {
        name: 'LOCATION_DISABLED_GRACE_MINUTES',
        value: '2',
        note: 'Grace period for re-enabling location services (minutes)',
      },
      {
        name: 'ENABLE_LOCATION_MONITORING',
        value: '0',
        note: 'Feature toggle to enable/disable geofencing and location monitoring (1=ON, 0=OFF)',
      },
    ];

    await Promise.all(
      systemSettings.map(setting =>
        prisma.systemSetting.upsert({
          where: { name: setting.name },
          update: {},
          create: setting,
        })
      )
    );
  }

  // 9. Seed Chat Messages
  const existingChatMessages = await prisma.chatMessage.count();
  if (existingChatMessages === 0) {
    console.log('Seeding chat messages...');

    // We will create some chat messages between Admin and Employee 1.
    // Spread them over a few days to test date separators.

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const fourDaysAgo = new Date(today);
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    await prisma.chatMessage.createMany({
      data: [
        // Five days ago
        {
          employeeId: employee1.id,
          sender: 'employee',
          content: 'Hello Admin, here are some updates from last week.',
          createdAt: new Date(fiveDaysAgo.setHours(9, 0, 0, 0)),
        },

        // Four days ago
        {
          employeeId: employee1.id,
          adminId: admin.id,
          sender: 'admin',
          content: 'Thanks, I will check them now.',
          createdAt: new Date(fourDaysAgo.setHours(11, 0, 0, 0)),
        },

        // Three days ago
        {
          employeeId: employee1.id,
          sender: 'employee',
          content: 'I will be at the downtown branch for the next check.',
          createdAt: new Date(threeDaysAgo.setHours(15, 30, 0, 0)),
        },

        // Two days ago messages
        {
          employeeId: employee1.id,
          sender: 'employee',
          content: 'Hi admin, this is a test message from a few days ago.',
          createdAt: new Date(twoDaysAgo.setHours(10, 0, 0, 0)),
        },
        {
          employeeId: employee1.id,
          adminId: admin.id,
          sender: 'admin',
          content: 'Received. Thank you!',
          createdAt: new Date(twoDaysAgo.setHours(10, 5, 0, 0)),
          readAt: new Date(twoDaysAgo.setHours(10, 5, 0, 0)),
        },

        // Yesterday messages with Location
        {
          employeeId: employee1.id,
          sender: 'employee',
          content: '',
          latitude: -8.6695866,
          longitude: 115.1538065,
          createdAt: new Date(yesterday.setHours(14, 0, 0, 0)),
        },
        {
          employeeId: employee1.id,
          adminId: admin.id,
          sender: 'admin',
          content: 'Thanks for sharing your location at Headquarters.',
          createdAt: new Date(yesterday.setHours(14, 2, 0, 0)),
        },

        // Today messages
        {
          employeeId: employee1.id,
          sender: 'employee',
          content: 'Checking in for my shift today.',
          createdAt: new Date(today.setHours(8, 0, 0, 0)),
        },
      ],
    });
  }

  console.log('\n--- SEED COMPLETE ---');
  console.log(`Admin Role ID: ${superadminRole.id}`);
  console.log(`Admin User Email: ${admin.email}`);
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
