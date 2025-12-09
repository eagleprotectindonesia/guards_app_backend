import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { z } from 'zod'; // Import z for Zod validation

// Define a schema for the incoming request body
const attendanceSchema = z.object({
  shiftId: z.string().uuid(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const guard = await getAuthenticatedGuard();
  if (!guard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const guardId = guard.id;

  try {
    const json = await req.json();
    const body = attendanceSchema.parse(json);

    // 1. Fetch Shift
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { attendance: true }, // Include attendance to check if it already exists
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // 2. Validate Guard and ensure attendance hasn't been recorded
    if (shift.guardId !== guardId) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    if (shift.attendance) {
      return NextResponse.json({ error: 'Attendance already recorded for this shift' }, { status: 400 });
    }

    // 3. Record Attendance and Update Shift
    const result = await prisma.$transaction(async tx => {
      const attendance = await tx.attendance.create({
        data: {
          shiftId: shift.id,
          recordedAt: new Date(),
          status: 'present', // Assuming 'present' for initial attendance record
          // picture and metadata are optional for now, as per user request
        },
      });

      const updateData: any = {};
      if (shift.status === 'scheduled') {
        updateData.status = 'in_progress';
      }

      await tx.shift.update({
        where: { id: shift.id },
        data: {
          ...updateData,
          attendance: {
            connect: { id: attendance.id },
          },
        },
      });

      return { attendance };
    });

    return NextResponse.json({ attendance: result.attendance }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error recording attendance:', error);
    if (error instanceof z.ZodError) { // Use z.ZodError for Zod validation errors
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
