'use client';

import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { useSocket } from '@/components/socket-provider';
import { useSocketEvent } from './use-socket-event';
import { uploadToS3 } from '@/lib/upload';
import { optimizeImage } from '@/lib/image-utils';
import { toast } from 'react-hot-toast';
import { ChatInboxItem } from '@repo/types';
import { useChatNotificationAudio } from '@/hooks/admin-chat/use-chat-notification-audio';

type GroupListItem = {
  participant: { id: string; role: string; unreadCount: number };
  group: {
    id: string;
    title: string;
    description?: string | null;
    groupShiftId?: string | null;
    lastMessageAt?: string | null;
    lastMessageSenderName?: string | null;
    lastMessageContent?: string | null;
  };
};

type GroupMessage = {
  id: string;
  groupId: string;
  senderParticipantId: string;
  senderType: 'admin' | 'employee';
  adminId: string | null;
  employeeId: string | null;
  senderName: string;
  senderEmployeeNumber?: string | null;
  content: string;
  attachments: string[];
  latitude?: number | null;
  longitude?: number | null;
  readAt?: string | null;
  createdAt: string;
};

type GroupMember = {
  id: string;
  groupId: string;
  participantType: 'admin' | 'employee';
  adminId: string | null;
  employeeId: string | null;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'left' | 'removed';
  displayName: string;
  displayEmail: string | null;
  displayEmployeeNumber: string | null;
};

type DirectoryEmployee = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
};

type DirectoryAdmin = {
  id: string;
  name: string;
  email: string;
};

async function parseErrorResponse(response: Response, fallbackMessage: string) {
  const body = await response.json().catch(() => null);
  return body?.error || fallbackMessage;
}

function clearUnreadInGroupPages(
  old: InfiniteData<{ groups: GroupListItem[]; nextCursor: string | null }> | undefined,
  groupId: string,
  removeFromList: boolean
) {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map(page => ({
      ...page,
      groups: page.groups
        .map(item =>
          item.group.id === groupId
            ? { ...item, participant: { ...item.participant, unreadCount: 0 } }
            : item
        )
        .filter(item => (removeFromList ? item.group.id !== groupId : true)),
    })),
  };
}

interface UseAdminGroupChatOptions {
  currentAdminId?: string | null;
  isChatVisible?: boolean;
}

export function useAdminGroupChat(options: UseAdminGroupChatOptions = {}) {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const { playNotificationSound } = useChatNotificationAudio();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<'inbox' | 'unread' | 'archived'>('inbox');
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isManagingMembers, setIsManagingMembers] = useState(false);
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [createGroupTitle, setCreateGroupTitle] = useState('');
  const [createGroupDescription, setCreateGroupDescription] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);

  const groupsQuery = useInfiniteQuery({
    queryKey: ['admin', 'group-chat', 'groups', activeView, searchTerm],
    queryFn: async ({ pageParam }) => {
      const url = new URL('/api/shared/group-chat', window.location.origin);
      url.searchParams.set('limit', '20');
      url.searchParams.set('view', activeView);
      if (searchTerm.trim()) {
        url.searchParams.set('search', searchTerm.trim());
      }
      if (pageParam) url.searchParams.set('cursor', pageParam as string);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch groups');
      return res.json() as Promise<{ groups: GroupListItem[]; nextCursor: string | null }>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  });

  const groupDetailsQuery = useQuery({
    queryKey: ['admin', 'group-chat', 'group', activeGroupId],
    queryFn: async () => {
      if (!activeGroupId) return null;
      const res = await fetch(`/api/shared/group-chat/${activeGroupId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch group');
      return res.json() as Promise<GroupListItem['group']>;
    },
    enabled: !!activeGroupId,
  });

  const membersQuery = useQuery({
    queryKey: ['admin', 'group-chat', 'members', activeGroupId],
    queryFn: async () => {
      if (!activeGroupId) return [] as GroupMember[];
      const res = await fetch(`/api/shared/group-chat/${activeGroupId}/members`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch members');
      const body = (await res.json()) as { participants: GroupMember[] };
      return body.participants;
    },
    enabled: !!activeGroupId,
  });

  const employeesQuery = useQuery({
    queryKey: ['admin', 'group-chat', 'employee-directory'],
    queryFn: async () => {
      const res = await fetch('/api/admin/employees', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch employees');
      const employees = (await res.json()) as Array<{ id: string; fullName: string; employeeNumber?: string | null }>;
      return employees.map(employee => ({
        id: employee.id,
        fullName: employee.fullName,
        employeeNumber: employee.employeeNumber ?? null,
      })) as DirectoryEmployee[];
    },
  });

  const adminsQuery = useQuery({
    queryKey: ['admin', 'group-chat', 'admin-directory'],
    queryFn: async () => {
      const res = await fetch('/api/admin/admins', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch admins');
      return (await res.json()) as DirectoryAdmin[];
    },
  });

  const messagesQuery = useInfiniteQuery({
    queryKey: ['admin', 'group-chat', 'messages', activeGroupId],
    queryFn: async ({ pageParam }) => {
      if (!activeGroupId) return [] as GroupMessage[];
      const url = new URL(`/api/shared/group-chat/${activeGroupId}/messages`, window.location.origin);
      url.searchParams.set('limit', '20');
      if (pageParam) url.searchParams.set('cursor', pageParam as string);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch group messages');
      return res.json() as Promise<GroupMessage[]>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.length < 20 ? undefined : last[last.length - 1].id),
    enabled: !!activeGroupId,
  });

  const groups = useMemo(() => groupsQuery.data?.pages.flatMap(p => p.groups) ?? [], [groupsQuery.data]);
  const inboxItems = useMemo<ChatInboxItem[]>(
    () =>
      groups.map(item => ({
        kind: 'group',
        id: item.group.id,
        title: item.group.title,
        subtitle: item.group.description ?? undefined,
        groupShiftId: item.group.groupShiftId ?? null,
        unreadCount: item.participant.unreadCount,
        isMuted: false,
        isArchived: false,
        lastMessage: item.group.lastMessageContent
          ? {
              content: item.group.lastMessageContent,
              senderName: item.group.lastMessageSenderName ?? 'Unknown',
              createdAt: item.group.lastMessageAt ?? new Date(0).toISOString(),
            }
          : null,
      })),
    [groups]
  );
  const messages = useMemo(() => (messagesQuery.data?.pages.flat() ?? []).reverse(), [messagesQuery.data]);
  const activeGroup = groupDetailsQuery.data;
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
  const admins = useMemo(() => adminsQuery.data ?? [], [adminsQuery.data]);

  const activeEmployeeSet = useMemo(
    () => new Set(members.filter(member => member.participantType === 'employee').map(member => member.employeeId).filter(Boolean) as string[]),
    [members]
  );
  const activeAdminSet = useMemo(
    () => new Set(members.filter(member => member.participantType === 'admin').map(member => member.adminId).filter(Boolean) as string[]),
    [members]
  );

  const availableEmployees = useMemo(
    () => employees.filter(employee => !activeEmployeeSet.has(employee.id)),
    [employees, activeEmployeeSet]
  );
  const availableAdmins = useMemo(() => admins.filter(admin => !activeAdminSet.has(admin.id)), [admins, activeAdminSet]);

  const handleFileChange = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      const processed = await Promise.all(imageFiles.map(f => optimizeImage(f)));
      const next = [...selectedFiles, ...processed].slice(0, 4);
      setSelectedFiles(next);
      const urls = processed.map(file => URL.createObjectURL(file));
      setPreviews(prev => [...prev, ...urls].slice(0, 4));
    },
    [selectedFiles]
  );

  const removeFile = useCallback(
    (index: number) => {
      URL.revokeObjectURL(previews[index]);
      setSelectedFiles(prev => prev.filter((_, i) => i !== index));
      setPreviews(prev => prev.filter((_, i) => i !== index));
    },
    [previews]
  );

  const sendMessage = useCallback(async () => {
    if (!socket || !activeGroupId || (!inputText.trim() && selectedFiles.length === 0) || isUploading) return;
    setIsUploading(true);
    try {
      let attachments: string[] = [];
      let messageId: string | undefined;
      if (selectedFiles.length > 0) {
        const draftRes = await fetch(`/api/shared/group-chat/${activeGroupId}/draft`, { method: 'POST' });
        const draft = (await draftRes.json()) as { messageId: string };
        messageId = draft.messageId;
        const uploads = await Promise.all(
          selectedFiles.map(file =>
            uploadToS3(file, { folder: 'group-chat', conversationId: activeGroupId, messageId, fileType: 'image' })
          )
        );
        attachments = uploads.map(x => x.key);
      }
      socket.emit('group_send_message', { groupId: activeGroupId, content: inputText.trim(), attachments, messageId });
      setInputText('');
      previews.forEach(URL.revokeObjectURL);
      setPreviews([]);
      setSelectedFiles([]);
    } catch {
      toast.error('Failed to send group message');
    } finally {
      setIsUploading(false);
    }
  }, [socket, activeGroupId, inputText, selectedFiles, isUploading, previews]);

  const createGroup = useCallback(async () => {
    const title = createGroupTitle.trim();
    if (!title) {
      toast.error('Group title is required');
      return;
    }

    setIsManagingMembers(true);
    try {
      const response = await fetch('/api/shared/group-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: createGroupDescription.trim() || null,
          employeeIds: selectedEmployeeIds,
          adminIds: selectedAdminIds,
        }),
      });

      if (!response.ok) {
        toast.error(await parseErrorResponse(response, 'Failed to create group'));
        return;
      }

      const group = (await response.json()) as { id: string };
      setCreateGroupTitle('');
      setCreateGroupDescription('');
      setSelectedEmployeeIds([]);
      setSelectedAdminIds([]);
      setActiveGroupId(group.id);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'groups'] });
    } catch {
      toast.error('Failed to create group');
    } finally {
      setIsManagingMembers(false);
    }
  }, [createGroupDescription, createGroupTitle, queryClient, selectedAdminIds, selectedEmployeeIds]);

  const addSelectedMembers = useCallback(async () => {
    if (!activeGroupId) return;

    const employeeIds = selectedEmployeeIds.filter(id => !activeEmployeeSet.has(id));
    const adminIds = selectedAdminIds.filter(id => !activeAdminSet.has(id));
    if (employeeIds.length === 0 && adminIds.length === 0) {
      toast.error('Select members to add');
      return;
    }

    setIsManagingMembers(true);
    try {
      const response = await fetch(`/api/shared/group-chat/${activeGroupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeIds, adminIds }),
      });

      if (!response.ok) {
        toast.error(await parseErrorResponse(response, 'Failed to add members'));
        return;
      }

      setSelectedEmployeeIds([]);
      setSelectedAdminIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'groups'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'members', activeGroupId] }),
      ]);
    } catch {
      toast.error('Failed to add members');
    } finally {
      setIsManagingMembers(false);
    }
  }, [activeAdminSet, activeEmployeeSet, activeGroupId, queryClient, selectedAdminIds, selectedEmployeeIds]);

  const removeMember = useCallback(
    async (participantId: string) => {
      if (!activeGroupId) return;

      setIsManagingMembers(true);
      try {
        const response = await fetch(`/api/shared/group-chat/${activeGroupId}/members/${participantId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          toast.error(await parseErrorResponse(response, 'Failed to remove member'));
          return;
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'groups'] }),
          queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'members', activeGroupId] }),
        ]);
      } catch {
        toast.error('Failed to remove member');
      } finally {
        setIsManagingMembers(false);
      }
    },
    [activeGroupId, queryClient]
  );

  const archiveGroup = useCallback(async (groupId: string) => {
    const response = await fetch(`/api/shared/group-chat/${groupId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: true }),
    });
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response, 'Failed to archive group'));
    }
    await queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'groups'] });
  }, [queryClient]);

  const markGroupAsReadOptimistic = useCallback(
    async (groupId: string) => {
      queryClient.setQueriesData<InfiniteData<{ groups: GroupListItem[]; nextCursor: string | null }>>(
        { queryKey: ['admin', 'group-chat', 'groups'] },
        old => clearUnreadInGroupPages(old, groupId, activeView === 'unread')
      );

      if (socket) {
        socket.emit('group_mark_read', { groupId });
        return;
      }

      await fetch(`/api/shared/group-chat/${groupId}/read`, { method: 'POST' });
    },
    [activeView, queryClient, socket]
  );

  const unarchiveGroup = useCallback(async (groupId: string) => {
    const response = await fetch(`/api/shared/group-chat/${groupId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: false }),
    });
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response, 'Failed to unarchive group'));
    }
    await queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'groups'] });
  }, [queryClient]);

  const disbandGroup = useCallback(async () => {
    toast.error('Disband group is no longer available from this flow');
    return false;
  }, []);

  const renameActiveGroup = useCallback(
    async (title: string) => {
      if (!activeGroupId) return false;
      const nextTitle = title.trim();
      if (!nextTitle) {
        toast.error('Group title is required');
        return false;
      }

      setIsRenamingGroup(true);
      try {
        const response = await fetch(`/api/shared/group-chat/${activeGroupId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: nextTitle }),
        });
        if (!response.ok) {
          toast.error(await parseErrorResponse(response, 'Failed to update group name'));
          return false;
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'groups'] }),
          queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'group', activeGroupId] }),
        ]);
        return true;
      } catch {
        toast.error('Failed to update group name');
        return false;
      } finally {
        setIsRenamingGroup(false);
      }
    },
    [activeGroupId, queryClient]
  );

  const leaveActiveGroup = useCallback(async () => {
    if (!activeGroupId) return false;
    try {
      const response = await fetch(`/api/shared/group-chat/${activeGroupId}/leave`, { method: 'POST' });
      if (!response.ok) {
        toast.error(await parseErrorResponse(response, 'Failed to leave group'));
        return false;
      }
      setActiveGroupId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'groups'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'members', activeGroupId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'messages', activeGroupId] }),
      ]);
      return true;
    } catch {
      toast.error('Failed to leave group');
      return false;
    }
  }, [activeGroupId, queryClient]);

  useSocketEvent('group_new_message', message => {
    const isFromCurrentAdmin =
      message.senderType === 'admin' &&
      !!options.currentAdminId &&
      message.adminId === options.currentAdminId;
    if (!isFromCurrentAdmin) {
      playNotificationSound();
    }

    queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'groups'] });
    if (message.groupId !== activeGroupId) return;
    queryClient.setQueryData<InfiniteData<GroupMessage[]>>(['admin', 'group-chat', 'messages', activeGroupId], old => {
      if (!old) return { pages: [[message as GroupMessage]], pageParams: [undefined] };
      return { ...old, pages: [[message as GroupMessage, ...old.pages[0]], ...old.pages.slice(1)] };
    });
    if (options.isChatVisible ?? true) {
      socket?.emit('group_mark_read', { groupId: message.groupId, messageIds: [message.id] });
    }
  });

  useSocketEvent('group_messages_read', payload => {
    const currentGroup = groups.find(item => item.group.id === payload.groupId);
    if (!currentGroup) return;
    if (currentGroup.participant.id !== payload.participantId) return;

    queryClient.setQueriesData<InfiniteData<{ groups: GroupListItem[]; nextCursor: string | null }>>(
      { queryKey: ['admin', 'group-chat', 'groups'] },
      old => clearUnreadInGroupPages(old, payload.groupId, activeView === 'unread')
    );
  });

  return {
    isConnected,
    groups,
    inboxItems,
    activeGroup,
    members,
    messages,
    activeGroupId,
    setActiveGroupId,
    searchTerm,
    setSearchTerm,
    activeView,
    setActiveView,
    inputText,
    setInputText,
    previews,
    isUploading,
    isManagingMembers,
    isRenamingGroup,
    createGroupTitle,
    setCreateGroupTitle,
    createGroupDescription,
    setCreateGroupDescription,
    selectedEmployeeIds,
    setSelectedEmployeeIds,
    selectedAdminIds,
    setSelectedAdminIds,
    employeeDirectory: employees,
    adminDirectory: admins,
    availableEmployees,
    availableAdmins,
    handleFileChange,
    removeFile,
    sendMessage,
    createGroup,
    addSelectedMembers,
    removeMember,
    archiveGroup,
    unarchiveGroup,
    markGroupAsReadOptimistic,
    disbandGroup,
    renameActiveGroup,
    leaveActiveGroup,
    fetchNextGroups: groupsQuery.fetchNextPage,
    hasNextGroups: groupsQuery.hasNextPage,
    isFetchingNextGroups: groupsQuery.isFetchingNextPage,
    isGroupsLoading: groupsQuery.isLoading,
    isMembersLoading: membersQuery.isLoading,
    isMessagesLoading: messagesQuery.isLoading,
  };
}
