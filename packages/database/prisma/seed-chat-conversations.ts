/**
 * One-time backfill script for the chat_conversations table.
 *
 * Run AFTER migration (pnpm turbo run db:push):
 *   npx tsx packages/database/prisma/seed-chat-conversations.ts
 *
 * This script:
 *  1. Finds the latest sent message per employee from chat_messages.
 *  2. Counts unread employee messages per employee.
 *  3. Upserts one ChatConversation row per employee.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting chat_conversations backfill...');

  // Step 1: Latest message per employee
  // Using raw query because Prisma doesn't support DISTINCT ON directly
  const latestMessages = await prisma.$queryRaw<
    Array<{
      employee_id: string;
      content: string;
      sender: 'admin' | 'employee';
      admin_id: string | null;
      created_at: Date;
    }>
  >`
    SELECT DISTINCT ON (employee_id)
      employee_id,
      content,
      sender,
      admin_id,
      created_at
    FROM chat_messages
    WHERE status = 'sent'
    ORDER BY employee_id, created_at DESC
  `;

  console.log(`Found ${latestMessages.length} conversations to backfill.`);

  // Step 2: Unread counts per employee
  const unreadCounts = await prisma.chatMessage.groupBy({
    by: ['employeeId'],
    where: {
      status: 'sent',
      sender: 'employee',
      readAt: null,
    },
    _count: { id: true },
  });

  const unreadMap = new Map(unreadCounts.map(u => [u.employeeId, u._count.id]));

  // Step 3: Upsert ChatConversation rows
  let upserted = 0;
  for (const msg of latestMessages) {
    await prisma.chatConversation.upsert({
      where: { employeeId: msg.employee_id },
      create: {
        employeeId: msg.employee_id,
        lastMessageAt: msg.created_at,
        lastMessageContent: msg.content,
        lastMessageSender: msg.sender,
        lastMessageAdminId: msg.admin_id ?? null,
        unreadCount: unreadMap.get(msg.employee_id) ?? 0,
      },
      update: {
        lastMessageAt: msg.created_at,
        lastMessageContent: msg.content,
        lastMessageSender: msg.sender,
        lastMessageAdminId: msg.admin_id ?? null,
        unreadCount: unreadMap.get(msg.employee_id) ?? 0,
      },
    });
    upserted++;
    if (upserted % 50 === 0) {
      console.log(`  Upserted ${upserted} / ${latestMessages.length}...`);
    }
  }

  console.log(`Done. Upserted ${upserted} chat_conversations rows.`);
}

main()
  .catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
