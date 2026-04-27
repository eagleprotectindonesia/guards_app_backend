type AnnouncementLike = { id: string };

export function calculateUnreadAnnouncementCount(announcements: AnnouncementLike[], seenIds: string[]) {
  if (announcements.length === 0) return 0;

  const seenIdSet = new Set(seenIds);
  return announcements.reduce((count, item) => count + (seenIdSet.has(item.id) ? 0 : 1), 0);
}

export function mergeSeenAnnouncementIds(currentSeenIds: string[], announcements: AnnouncementLike[]) {
  const currentIds = announcements.map(item => item.id);
  return Array.from(new Set([...currentSeenIds, ...currentIds]));
}
