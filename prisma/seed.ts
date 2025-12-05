import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Site
  const site = await prisma.site.create({
    data: {
      name: 'Headquarters',
      clientName: 'Headquarters Owner',
      timeZone: 'America/New_York',
    },
  });
  console.log('Created Site:', site.id);

  // 2. Create Guard
  const guard = await prisma.guard.create({
    data: {
      name: 'John Guard',
      phone: '+15551234567', // Ensure unique phone number
    },
  });
  console.log('Created Guard:', guard.id);

  // 3. Create Admin
  const admin = await prisma.admin.create({
    data: {
      name: 'Admin User',
      email: 'admin@example.com',
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

  const nightShiftType = await prisma.shiftType.create({
    data: {
      name: 'Night Shift',
      startTime: '22:00',
      endTime: '06:00', // Overnight shift
    },
  });
  console.log('Created Night Shift Type:', nightShiftType.id);

  // 5. Create a Shift for today
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day for date field

  // Calculate startsAt and endsAt for morning shift
  const morningStartsAt = new Date(today);
  morningStartsAt.setHours(8, 0, 0, 0); // 08:00 AM

  const morningEndsAt = new Date(today);
  morningEndsAt.setHours(16, 0, 0, 0); // 04:00 PM

  const shiftToday = await prisma.shift.create({
    data: {
      siteId: site.id,
      shiftTypeId: morningShiftType.id,
      guardId: guard.id,
      date: today,
      startsAt: morningStartsAt,
      endsAt: morningEndsAt,
      status: 'scheduled',
      requiredCheckinIntervalMins: 60,
      graceMinutes: 15,
    },
  });
  console.log('Created Shift for today:', shiftToday.id);

  // 6. Create an overnight shift for today/tomorrow
  const nightShiftStartsAt = new Date(today);
  nightShiftStartsAt.setHours(22, 0, 0, 0); // 10:00 PM today

  const nightShiftEndsAt = new Date(today);
  nightShiftEndsAt.setDate(nightShiftEndsAt.getDate() + 1); // Next day
  nightShiftEndsAt.setHours(6, 0, 0, 0); // 06:00 AM next day

  const overnightShift = await prisma.shift.create({
    data: {
      siteId: site.id,
      shiftTypeId: nightShiftType.id,
      guardId: guard.id,
      date: today, // Shift's 'date' is the start date
      startsAt: nightShiftStartsAt,
      endsAt: nightShiftEndsAt,
      status: 'scheduled',
      requiredCheckinIntervalMins: 60,
      graceMinutes: 15,
    },
  });
  console.log('Created Overnight Shift:', overnightShift.id);

  console.log('\n--- SEED COMPLETE ---');
  console.log(`Guard ID (Use this in Guard UI): ${guard.id}`);
  console.log(`Admin Email (Use this for Admin login): ${admin.email}`);
  console.log(`Site ID (Use this in Admin Dashboard): ${site.id}`);
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
