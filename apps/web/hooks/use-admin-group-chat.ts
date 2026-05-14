'use client';

import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { useSocket } from '@/components/socket-provider';
import { useSocketEvent } from './use-socket-event';
import { uploadToS3 } from '@/lib/upload';
import { optimizeImage } from '@/lib/image-utils';
import { toast } from 'react-hot-toast';

type GroupListItem = {
  participant: { id: string; role: string; unreadCount: number };
  group: { id: string; title: string; lastMessageAt?: string | null; lastMessageSenderName?: string | null; lastMessageContent?: string | null };
};

type GroupMessage = {
  id: string;
  groupId: string;
  senderType: 'admin' | 'employee';
  senderName: string;
  content: string;
  attachments: string[];
  createdAt: string;
};

export function useAdminGroupChat() {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const groupsQuery = useInfiniteQuery({
    queryKey: ['admin', 'group-chat', 'groups', 'inbox', searchTerm],
    queryFn: async ({ pageParam }) => {
      const url = new URL('/api/shared/group-chat', window.location.origin);
      url.searchParams.set('limit', '20');
      if (pageParam) url.searchParams.set('cursor', pageParam as string);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch groups');
      return res.json() as Promise<{ groups: GroupListItem[]; nextCursor: string | null }>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
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
  const messages = useMemo(() => (messagesQuery.data?.pages.flat() ?? []).reverse(), [messagesQuery.data]);

  const handleFileChange = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const processed = await Promise.all(imageFiles.map(f => optimizeImage(f)));
    const next = [...selectedFiles, ...processed].slice(0, 4);
    setSelectedFiles(next);
    const urls = processed.map(file => URL.createObjectURL(file));
    setPreviews(prev => [...prev, ...urls].slice(0, 4));
  }, [selectedFiles]);

  const removeFile = useCallback((index: number) => {
    URL.revokeObjectURL(previews[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  }, [previews]);

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

  useSocketEvent('group_new_message', message => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'group-chat', 'groups'] });
    if (message.groupId !== activeGroupId) return;
    queryClient.setQueryData<InfiniteData<GroupMessage[]>>(['admin', 'group-chat', 'messages', activeGroupId], old => {
      if (!old) return { pages: [[message as GroupMessage]], pageParams: [undefined] };
      return { ...old, pages: [[message as GroupMessage, ...old.pages[0]], ...old.pages.slice(1)] };
    });
    socket?.emit('group_mark_read', { groupId: message.groupId, messageIds: [message.id] });
  });

  return {
    isConnected,
    groups,
    messages,
    activeGroupId,
    setActiveGroupId,
    searchTerm,
    setSearchTerm,
    inputText,
    setInputText,
    previews,
    isUploading,
    handleFileChange,
    removeFile,
    sendMessage,
    fetchNextGroups: groupsQuery.fetchNextPage,
    hasNextGroups: groupsQuery.hasNextPage,
    isGroupsLoading: groupsQuery.isLoading,
    isMessagesLoading: messagesQuery.isLoading,
  };
}
