import { prisma } from '../src';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('Seeding database...');

  // 1. Create Sites
  const site1 = await prisma.site.create({
    data: {
      name: 'Headquarters',
      clientName: 'Headquarters Owner',
      address: 'Jl. Umalas 1 Gg. XXII, Kerobokan Kelod, Kec. Kuta Utara, Kabupaten Badung, Bali, Indonesia',
      latitude: -8.6695866,
      longitude: 115.1538065,
    },
  });
  console.log('Created Site 1:', site1.id);

  const site2 = await prisma.site.create({
    data: {
      name: 'Downtown Branch',
      clientName: 'Downtown Branch Owner',
      address: 'Pemogan, Denpasar Selatan, Denpasar City, Bali, Indonesia',
      latitude: -8.717255399999999,
      longitude: 115.1948445,
    },
  });
  console.log('Created Site 2:', site2.id);

  const site3 = await prisma.site.create({
    data: {
      name: 'Lilu Rental',
      clientName: 'Warehouse Manager',
      address: 'Jl. Mahendradatta Utara No.758, Tegal Kertha, Kec. Denpasar Bar., Kota Denpasar, Bali 80361, Indonesia',
      latitude: -8.654809799999999,
      longitude: 115.1927169,
    },
  });
  console.log('Created Site 3:', site3.id);

  // 2. Create Guards
  const guardPassword = '123456'; // Default password for the seeded guards
  const hashedGuardPassword = await bcrypt.hash(guardPassword, 10); // Hash the password

  const guard1 = await prisma.guard.create({
    data: {
      id: 'EMP001',
      name: 'Jackie Chan',
      phone: '+62551234567', // Ensure unique phone number
      hashedPassword: hashedGuardPassword,
      guardCode: '00001',
    },
  });
  console.log('Created Guard 1:', guard1.id);

  const guard2 = await prisma.guard.create({
    data: {
      id: 'EMP002',
      name: 'Bruce Lee',
      phone: '+625551234568', // Ensure unique phone number
      hashedPassword: hashedGuardPassword,
      guardCode: '00002',
    },
  });
  console.log('Created Guard 2:', guard2.id);

  const guard3 = await prisma.guard.create({
    data: {
      id: 'EMP003',
      name: 'Chuck Norris',
      phone: '+625551234569', // Ensure unique phone number
      hashedPassword: hashedGuardPassword,
      guardCode: '00003',
    },
  });
  console.log('Created Guard 3:', guard3.id);

  // 3. Create Admin
  const adminPassword = 'password123'; // Default password for the seeded admin
  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10); // Hash the password

  const admin = await prisma.admin.create({
    data: {
      name: 'Admin User',
      email: 'admin@example.com',
      hashedPassword: hashedAdminPassword,
      role: 'superadmin',
    },
  });
  console.log('Created Admin:', admin.id);

  // 4. Create Shift Types
  const morningShiftType = await prisma.shiftType.create({
    data: {
      name: 'Morning Shift',
      startTime: '08:00',
      endTime: '16:00',
    },
  });
  console.log('Created Morning Shift Type:', morningShiftType.id);

  const afternoonShiftType = await prisma.shiftType.create({
    data: {
      name: 'Afternoon Shift',
      startTime: '16:00',
      endTime: '00:00', // 12:00 AM (midnight)
    },
  });
  console.log('Created Afternoon Shift Type:', afternoonShiftType.id);

  const nightShiftType = await prisma.shiftType.create({
    data: {
      name: 'Night Shift',
      startTime: '22:00',
      endTime: '06:00', // Overnight shift
    },
  });
  console.log('Created Night Shift Type:', nightShiftType.id);

  // 5. Create shifts for today
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day for date field

  // Calculate startsAt and endsAt for morning shift
  const morningStartsAt = new Date(today);
  morningStartsAt.setHours(8, 0, 0, 0); // 08:00 AM

  const morningEndsAt = new Date(today);
  morningEndsAt.setHours(16, 0, 0, 0); // 04:00 PM

  const shiftToday1 = await prisma.shift.create({
    data: {
      siteId: site1.id,
      shiftTypeId: morningShiftType.id,
      guardId: guard1.id,
      date: today,
      startsAt: morningStartsAt,
      endsAt: morningEndsAt,
      status: 'scheduled',
      requiredCheckinIntervalMins: 5,
      graceMinutes: 5,
    },
  });
  console.log('Created Shift for today (Guard 1):', shiftToday1.id);

  // Afternoon shift
  const afternoonStartsAt = new Date(today);
  afternoonStartsAt.setHours(16, 0, 0, 0); // 04:00 PM

  const afternoonEndsAt = new Date(today);
  afternoonEndsAt.setDate(afternoonEndsAt.getDate() + 1); // Next day
  afternoonEndsAt.setHours(0, 0, 0, 0); // 12:00 AM (midnight)

  const afternoonShift = await prisma.shift.create({
    data: {
      siteId: site2.id,
      shiftTypeId: afternoonShiftType.id,
      guardId: guard2.id,
      date: today,
      startsAt: afternoonStartsAt,
      endsAt: afternoonEndsAt,
      status: 'scheduled',
      requiredCheckinIntervalMins: 5,
      graceMinutes: 5,
    },
  });
  console.log('Created Afternoon Shift:', afternoonShift.id);

  // Night shift
  const nightShiftStartsAt = new Date(today);
  nightShiftStartsAt.setHours(22, 0, 0, 0); // 10:00 PM today

  const nightShiftEndsAt = new Date(today);
  nightShiftEndsAt.setDate(nightShiftEndsAt.getDate() + 1); // Next day
  nightShiftEndsAt.setHours(6, 0, 0, 0); // 06:00 AM next day

  const overnightShift = await prisma.shift.create({
    data: {
      siteId: site3.id,
      shiftTypeId: nightShiftType.id,
      guardId: guard3.id,
      date: today, // Shift's 'date' is the start date
      startsAt: nightShiftStartsAt,
      endsAt: nightShiftEndsAt,
      status: 'scheduled',
      requiredCheckinIntervalMins: 5,
      graceMinutes: 5,
    },
  });
  console.log('Created Overnight Shift:', overnightShift.id);

  // Additional shifts for variety
  const morningStartsAt2 = new Date(today);
  morningStartsAt2.setHours(8, 0, 0, 0); // 08:00 AM

  const morningEndsAt2 = new Date(today);
  morningEndsAt2.setHours(16, 0, 0, 0); // 04:00 PM

  const shiftToday2 = await prisma.shift.create({
    data: {
      siteId: site2.id,
      shiftTypeId: morningShiftType.id,
      guardId: guard2.id,
      date: today,
      startsAt: morningStartsAt2,
      endsAt: morningEndsAt2,
      status: 'scheduled',
      requiredCheckinIntervalMins: 5,
      graceMinutes: 5,
    },
  });
  console.log('Created Shift for today (Guard 2):', shiftToday2.id);

  const morningStartsAt3 = new Date(today);
  morningStartsAt3.setHours(8, 0, 0, 0); // 08:00 AM

  const morningEndsAt3 = new Date(today);
  morningEndsAt3.setHours(16, 0, 0, 0); // 04:00 PM

  const shiftToday3 = await prisma.shift.create({
    data: {
      siteId: site3.id,
      shiftTypeId: morningShiftType.id,
      guardId: guard3.id,
      date: today,
      startsAt: morningStartsAt3,
      endsAt: morningEndsAt3,
      status: 'scheduled',
      requiredCheckinIntervalMins: 5,
      graceMinutes: 5,
    },
  });
  console.log('Created Shift for today (Guard 3):', shiftToday3.id);

  console.log('\n--- SEED COMPLETE ---');
  console.log(`Guard 1 ID (Use this in Guard UI): ${guard1.id}`);
  console.log(`Guard 2 ID (Use this in Guard UI): ${guard2.id}`);
  console.log(`Guard 3 ID (Use this in Guard UI): ${guard3.id}`);
  console.log(`Admin Email (Use this for Admin login): ${admin.email}`);
  console.log(`Site 1 ID (Use this in Admin Dashboard): ${site1.id}`);
  console.log(`Site 2 ID (Use this in Admin Dashboard): ${site2.id}`);
  console.log(`Site 3 ID (Use this in Admin Dashboard): ${site3.id}`);
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
