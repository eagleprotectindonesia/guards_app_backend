import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { getAdminIdFromToken } from '@/lib/admin-auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const adminId = await getAdminIdFromToken();

  if (!adminId) {
      return NextResponse.json({ error: 'Unauthorized: No admin found' }, { status: 401 });
  }

  let outcome = 'resolve';
  let note = '';

  try {
    // Attempt to parse body if present
    const json = await req.json();
    if (json.outcome) outcome = json.outcome;
    if (json.note) note = json.note;
  } catch (e) {
    // No body or invalid JSON, default to 'resolve'
  }

  try {
    const alert = await prisma.alert.findUnique({ 
        where: { id },
        include: { shift: true } 
    });

    if (!alert) {
        return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    if (outcome === 'forgive') {
        // FORGIVE: Soft Delete (Mark as forgiven) and decrement missed count
        const updatedAlert = await prisma.$transaction(async tx => {
            const a = await tx.alert.update({ 
                where: { id },
                data: {
                    resolvedAt: new Date(),
                    resolvedById: adminId,
                    resolutionType: 'forgiven',
                    resolutionNote: note,
                },
                include: { shift: true }
            });
            
            // Only decrement if > 0
            if (alert.shift.missedCount > 0) {
                 await tx.shift.update({
                    where: { id: alert.shiftId },
                    data: {
                        missedCount: { decrement: 1 }
                    }
                });
            }
            return a;
        });

        // Publish update (Frontend will handle moving it to history/removing from active)
        const payload = {
            type: 'alert_updated',
            alert: updatedAlert,
        };
        await redis.publish(`alerts:site:${alert.siteId}`, JSON.stringify(payload));
        
        return NextResponse.json({ success: true, outcome: 'forgive', alert: updatedAlert });
    } else {
        // RESOLVE: Mark as resolved (standard)
        const updatedAlert = await prisma.alert.update({
        where: { id },
        data: {
            resolvedAt: new Date(),
            resolvedById: adminId,
            resolutionType: 'standard',
            resolutionNote: note,
        },
        include: { shift: true }, // Include shift to get necessary data for SSE payload
        });

        // Publish update
        const payload = {
        type: 'alert_updated',
        alert: updatedAlert,
        };
        await redis.publish(`alerts:site:${updatedAlert.siteId}`, JSON.stringify(payload));

        return NextResponse.json(updatedAlert);
    }

  } catch (error) {
    console.error('Error resolving alert:', error);
    return NextResponse.json({ error: 'Error resolving alert' }, { status: 500 });
  }
}
