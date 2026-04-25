import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { storage } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { calculateUnreadAnnouncementCount, mergeSeenAnnouncementIds } from './announcements-utils';

type AnnouncementHolidayType = 'holiday' | 'week_off' | 'emergency' | 'special_working_day';
type AnnouncementMemoScope = 'all' | 'department';

type MobileHolidayAnnouncement = {
  id: string;
  kind: 'holiday';
  title: string;
  message: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  meta: {
    holidayEntryId: string;
    holidayType: AnnouncementHolidayType;
    isPaid: boolean;
    affectsAttendance: boolean;
    notificationRequired: boolean;
    scope: 'all' | 'department';
  };
};

type MobileOfficeMemoAnnouncement = {
  id: string;
  kind: 'office_memo';
  title: string;
  message: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  meta: {
    officeMemoId: string;
    scope: AnnouncementMemoScope;
  };
};

export type MobileAnnouncement = MobileHolidayAnnouncement | MobileOfficeMemoAnnouncement;

type AnnouncementsResponse = {
  announcements: MobileAnnouncement[];
};

const ANNOUNCEMENTS_SEEN_KEY_PREFIX = 'announcements_seen_v1';

function getAnnouncementSeenStorageKey(employeeId: string) {
  return `${ANNOUNCEMENTS_SEEN_KEY_PREFIX}:${employeeId}`;
}

export function useAnnouncements() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery<AnnouncementsResponse>({
    queryKey: queryKeys.announcements.list,
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await client.get('/api/employee/my/announcements');
      return response.data;
    },
    refetchInterval: 60000,
  });

  const announcements = data?.announcements ?? [];
  const seenQueryKey = ['announcements', 'seen', user?.id] as const;

  const { data: seenIds = [] } = useQuery<string[]>({
    queryKey: seenQueryKey,
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [];
      const raw = await storage.getItem(getAnnouncementSeenStorageKey(user.id));
      return Array.isArray(raw) ? raw.filter(value => typeof value === 'string') : [];
    },
    staleTime: Infinity,
  });

  const unreadCount = useMemo(() => {
    return calculateUnreadAnnouncementCount(announcements, seenIds);
  }, [announcements, seenIds]);

  const markCurrentAsSeen = useCallback(async () => {
    if (!user?.id || announcements.length === 0) return;

    const merged = mergeSeenAnnouncementIds(seenIds, announcements);
    if (merged.length === seenIds.length) return;

    await storage.setItem(getAnnouncementSeenStorageKey(user.id), merged);
    queryClient.setQueryData(seenQueryKey, merged);
  }, [announcements, queryClient, seenIds, seenQueryKey, user?.id]);

  return {
    announcements,
    unreadCount,
    isLoading,
    refetch,
    isRefetching,
    markCurrentAsSeen,
  };
}
