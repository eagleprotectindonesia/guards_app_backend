'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, X, Paperclip, Camera, Video } from 'lucide-react';
import { format } from 'date-fns';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import { useSocket } from '@/components/socket-provider';
import { useProfile } from '../hooks/use-employee-queries';
import { useChatMessages, ChatMessage } from '../hooks/use-chat-queries';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '@/components/ui/dialog';
import { cn, isVideoFile } from '@/lib/utils';
import { TFunction } from 'i18next';
import { uploadToS3 } from '@/lib/upload';
import { toast } from 'react-hot-toast';
import { optimizeImage } from '@/lib/image-utils';

export default function ChatPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();
  const { data: profile } = useProfile();
  const employeeId = profile?.id;

  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const hasInitialScrolled = useRef(false);
  const pendingReadIds = useRef<Set<string>>(new Set());
  const readTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useChatMessages(employeeId);

  const messages = useMemo(() => {
    const allMessages = data?.pages.flat() || [];
    // Sort by date ascending for display
    return [...allMessages].reverse();
  }, [data]);

  const lastMessageId = useMemo(() => (messages.length > 0 ? messages[messages.length - 1].id : null), [messages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  const flushMarkRead = useCallback(() => {
    if (pendingReadIds.current.size === 0 || !socket || !employeeId) return;

    socket.emit('mark_read', {
      employeeId,
      messageIds: Array.from(pendingReadIds.current),
    });
    pendingReadIds.current.clear();
  }, [socket, employeeId]);

  const queueMarkRead = useCallback(
    (id: string) => {
      pendingReadIds.current.add(id);
      if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
      readTimeoutRef.current = setTimeout(flushMarkRead, 500);
    },
    [flushMarkRead]
  );

  // Socket setup
  useEffect(() => {
    if (!socket || !employeeId) return;

    const handleNewMessage = (message: ChatMessage) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(['chat', 'messages', employeeId], old => {
        if (!old || !old.pages || old.pages.length === 0) return old;

        // Avoid duplicates
        const alreadyExists = old.pages.some(page => page.some(m => m.id === message.id));
        if (alreadyExists) return old;

        return {
          ...old,
          pages: [[message, ...old.pages[0]], ...old.pages.slice(1)],
          pageParams: old.pageParams,
        };
      });

      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
    };

    const handleMessagesRead = (data: { messageIds: string[] }) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(['chat', 'messages', employeeId], old => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map(page =>
            page.map(msg => (data.messageIds.includes(msg.id) ? { ...msg, readAt: new Date().toISOString() } : msg))
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
    };

    const handleError = (error: unknown) => {
      console.error('Socket error:', error);
    };

    socket.on('new_message', handleNewMessage);
    socket.on('messages_read', handleMessagesRead);
    socket.on('error', handleError);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('messages_read', handleMessagesRead);
      socket.off('error', handleError);
      if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
    };
  }, [socket, employeeId, queryClient]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 1. Initial scroll to bottom when data first arrives
  useEffect(() => {
    if (!isLoading && messages.length > 0 && !hasInitialScrolled.current) {
      scrollToBottom('auto');
      hasInitialScrolled.current = true;
    }
  }, [isLoading, messages.length, scrollToBottom]);

  // 2. Handle new messages arriving at the bottom
  useEffect(() => {
    if (hasInitialScrolled.current && lastMessageId) {
      const scrollArea = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        // Only scroll if user is already near the bottom (within 150px)
        const isNearBottom = scrollArea.scrollHeight - scrollArea.scrollTop <= scrollArea.clientHeight + 150;

        if (isNearBottom) {
          scrollToBottom('smooth');
        }
      }
    }
  }, [lastMessageId, scrollToBottom]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (validFiles.length !== files.length) {
      toast.error(t('chat.error_invalid_files', 'Only image and video files are allowed'));
    }

    if (validFiles.length === 0) return;

    setIsOptimizing(true);
    try {
      // Only optimize images, leave videos as is
      const processedFiles = await Promise.all(
        validFiles.map(file => (file.type.startsWith('image/') ? optimizeImage(file) : Promise.resolve(file)))
      );

      const currentFiles = [...selectedFiles, ...processedFiles].slice(0, 4);
      setSelectedFiles(currentFiles);

      const newPreviews = processedFiles.map(file => URL.createObjectURL(file));
      setPreviews(prev => [...prev, ...newPreviews].slice(0, 4));
    } catch (error) {
      console.error('File processing failed:', error);
      toast.error(t('chat.processing_failed', 'Failed to process files'));
    } finally {
      setIsOptimizing(false);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && selectedFiles.length === 0) || !socket || !isConnected || !employeeId || isUploading)
      return;

    setIsUploading(true);
    try {
      let attachments: string[] = [];

      if (selectedFiles.length > 0) {
        const uploadPromises = selectedFiles.map(file => uploadToS3(file, 'chat'));
        const results = await Promise.all(uploadPromises);
        attachments = results.map(r => r.key);
      }

      socket.emit('send_message', {
        content: inputText.trim(),
        attachments,
      });

      setInputText('');
      setSelectedFiles([]);
      previews.forEach(url => URL.revokeObjectURL(url));
      setPreviews([]);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error(t('chat.send_failed', 'Failed to send message'));
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-gray-50 overflow-hidden relative">
      <div className="bg-white px-4 py-3 border-b border-gray-200 shadow-sm flex-none">
        <h1 className="text-lg font-semibold text-gray-900">{t('chat.title', 'Admin Support')}</h1>
        <div className="flex items-center gap-1.5">
          <div className={cn('h-2 w-2 rounded-full', isConnected ? 'bg-green-500' : 'bg-red-500')} />
          <span className="text-xs text-gray-500">
            {isConnected ? t('chat.connected', 'Online') : t('chat.disconnected', 'Disconnected')}
          </span>
        </div>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1">
        <div className="flex flex-col space-y-4 p-4 pb-24">
          <div ref={observerTarget} className="h-4 w-full flex items-center justify-center">
            {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {messages.map(message => (
            <ChatMessageItem
              key={message.id}
              message={message}
              onVisible={queueMarkRead}
              onImageClick={setViewerImage}
              t={t}
            />
          ))}
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </ScrollArea>

      <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-col gap-2">
        {previews.length > 0 && (
          <div className="flex gap-2 p-2 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-x-auto">
            {previews.map((url, i) => (
              <div key={i} className="relative h-16 w-16 shrink-0">
                {selectedFiles[i]?.type.startsWith('video/') ? (
                  <div className="h-full w-full bg-gray-100 rounded-xl border border-gray-100 flex items-center justify-center">
                    <Video className="h-6 w-6 text-gray-400" />
                  </div>
                ) : (
                  <img
                    src={url}
                    alt="Preview"
                    className="h-full w-full object-cover rounded-xl border border-gray-100"
                  />
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={handleSendMessage}
          className="flex items-center gap-2 bg-white p-1.5 rounded-full shadow-xl border border-gray-100"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*,video/*"
            multiple
            className="hidden"
          />
          <input
            type="file"
            ref={cameraInputRef}
            onChange={handleFileChange}
            accept="image/*"
            capture="environment"
            className="hidden"
          />
          <div className="flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={selectedFiles.length >= 4 || isUploading || isOptimizing}
              className="rounded-full h-9 w-6 shrink-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => cameraInputRef.current?.click()}
              disabled={selectedFiles.length >= 4 || isUploading || isOptimizing}
              className="rounded-full h-9 w-6 shrink-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            >
              {isOptimizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            </Button>
          </div>

          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={t('chat.placeholder', 'Type a message...')}
            className="flex-1 px-2 py-2 bg-transparent border-none text-sm focus:ring-0 outline-none"
            disabled={isUploading || isOptimizing}
          />
          <Button
            type="submit"
            disabled={(!inputText.trim() && selectedFiles.length === 0) || !isConnected || isUploading || isOptimizing}
            size="icon"
            className="rounded-full h-10 w-10 shrink-0 bg-blue-600 hover:bg-blue-700 shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
      </div>

      <Dialog open={!!viewerImage} onOpenChange={open => !open && setViewerImage(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-none [&>button[data-slot=dialog-close]]:bg-black/50 [&>button[data-slot=dialog-close]]:text-white [&>button[data-slot=dialog-close]]:hover:bg-black/70 [&>button[data-slot=dialog-close]]:rounded-full [&>button[data-slot=dialog-close]]:p-2 [&>button[data-slot=dialog-close]]:top-4 [&>button[data-slot=dialog-close]]:right-4 [&>button[data-slot=dialog-close]]:opacity-100 [&>button[data-slot=dialog-close]_svg]:size-6">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('chat.image_viewer', 'Image Viewer')}</DialogTitle>
          </DialogHeader>
          {viewerImage && (
            <div className="relative flex items-center justify-center min-h-[50vh]">
              <img
                src={viewerImage}
                alt="Full size"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChatMessageItem({
  message,
  onVisible,
  onImageClick,
  t,
}: {
  message: ChatMessage;
  onVisible: (id: string) => void;
  onImageClick: (url: string) => void;
  t: TFunction<'translation', undefined>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isMe = message.sender === 'guard' || message.sender === 'employee';

  useEffect(() => {
    // Only observe admin messages that aren't read yet
    if (isMe || message.readAt) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible(message.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [message.id, isMe, message.readAt, onVisible]);

  return (
    <div ref={ref} className={cn('flex flex-col max-w-[80%]', isMe ? 'self-end items-end' : 'self-start items-start')}>
      {!isMe && (
        <span className="text-[10px] text-gray-500 mb-1 ml-1 font-medium">{message.admin?.name || 'Admin'}</span>
      )}
      <div
        className={cn(
          'px-4 py-2.5 rounded-2xl text-sm shadow-sm',
          isMe
            ? 'bg-blue-600 text-white rounded-tr-none'
            : 'bg-white text-gray-900 border border-gray-100 rounded-tl-none'
        )}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn('grid gap-1.5 mb-2', message.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {message.attachments.map((url, i) => {
              if (isVideoFile(url)) {
                return (
                  <video
                    key={i}
                    src={url}
                    controls
                    className="w-full aspect-video object-cover rounded-xl"
                  />
                );
              }
              return (
                <img
                  key={i}
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="w-full aspect-video object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => onImageClick(url)}
                />
              );
            })}
          </div>
        )}
        <p className="whitespace-pre-wrap wrap-break-word">{message.content}</p>
      </div>
      <div className="flex items-center mt-1 gap-1 px-1">
        <span className="text-[10px] text-gray-400">{format(new Date(message.createdAt), 'HH:mm')}</span>
        {isMe && message.readAt && (
          <span className="text-[10px] text-blue-500 font-medium">{t('chat.read', 'Read')}</span>
        )}
      </div>
    </div>
  );
}
