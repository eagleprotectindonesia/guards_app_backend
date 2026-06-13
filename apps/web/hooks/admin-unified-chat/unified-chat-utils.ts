import { ChatInboxItem } from '@repo/types';

export function toTimestamp(item: ChatInboxItem): number {
  const createdAt = item.lastMessage?.createdAt;
  if (!createdAt) return 0;
  const ms = new Date(createdAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function matchesSearch(item: ChatInboxItem, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  const q = searchTerm.trim().toLowerCase();
  return (
    item.title.toLowerCase().includes(q) ||
    (item.subtitle ?? '').toLowerCase().includes(q) ||
    (item.lastMessage?.content ?? '').toLowerCase().includes(q)
  );
}
