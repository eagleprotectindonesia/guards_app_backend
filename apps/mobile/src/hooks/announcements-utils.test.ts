import { calculateUnreadAnnouncementCount, mergeSeenAnnouncementIds } from './announcements-utils';

describe('announcements utils', () => {
  test('calculates unread across mixed announcement kinds by id', () => {
    const announcements = [
      { id: 'holiday:1' },
      { id: 'office_memo:1' },
      { id: 'office_memo:2' },
    ];

    expect(calculateUnreadAnnouncementCount(announcements, ['office_memo:1'])).toBe(2);
    expect(calculateUnreadAnnouncementCount(announcements, ['holiday:1', 'office_memo:1', 'office_memo:2'])).toBe(0);
  });

  test('merges and deduplicates seen ids with current announcements', () => {
    const announcements = [{ id: 'holiday:1' }, { id: 'office_memo:1' }, { id: 'holiday:1' }];

    expect(mergeSeenAnnouncementIds(['office_memo:1', 'legacy:2'], announcements)).toEqual([
      'office_memo:1',
      'legacy:2',
      'holiday:1',
    ]);
  });
});
