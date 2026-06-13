-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "cancellation_note" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6);
