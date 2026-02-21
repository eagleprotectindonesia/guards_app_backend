'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, X, Paperclip, Camera, Video, Check, CheckCheck, MapPin } from 'lucide-react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import { useSocket } from '@/components/socket-provider';
import { useProfile } from '../hooks/use-employee-queries';
import { useChatMessages, ChatMessage } from '../hooks/use-chat-queries';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '@/components/ui/dialog';
import { cn, isVideoFile } from '@/lib/utils';
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
    const sorted = [...allMessages].reverse();

    if (sorted.length === 0) return [];

    const result: (ChatMessage | { type: 'date'; date: string; id: string })[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const previous = sorted[i - 1];

      if (!previous || !isSameDay(new Date(current.createdAt), new Date(previous.createdAt))) {
        result.push({
          type: 'date',
          date: current.createdAt,
          id: `date-${current.id}`,
        });
      }
      result.push(current);
    }
    return result;
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
      toast.error(t('chat.error_invalid_files'));
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
      toast.error(t('chat.processing_failed'));
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
      toast.error(t('chat.send_failed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleShareLocation = async () => {
    if (!socket || !isConnected || !employeeId || isUploading) return;

    if (!navigator.geolocation) {
      toast.error(t('chat.location_not_supported', 'Geolocation is not supported by your browser'));
      return;
    }

    setIsUploading(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        socket.emit('send_message', {
          content: '',
          attachments: [],
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setIsUploading(false);
      },
      error => {
        console.error('Error getting location:', error);
        toast.error(t('chat.location_error', 'Unable to fetch your location.'));
        setIsUploading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-[#121212] relative text-slate-300">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="bg-[#181818]/80 backdrop-blur-md px-6 py-4 border-b border-white/5 shadow-lg flex-none z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-900 to-red-600 flex items-center justify-center border border-white/10 shadow-lg shadow-red-900/20">
            <span className="font-bold text-white text-lg">E</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight leading-none mb-1">{t('chat.title')}</h1>
            <div className="flex items-center gap-1.5">
              <div
                className={cn('h-1.5 w-1.5 rounded-full animate-pulse', isConnected ? 'bg-emerald-500' : 'bg-red-500')}
              />
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">
                {isConnected ? t('chat.status_active') : t('chat.status_offline')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 z-10">
        <div className="flex flex-col space-y-6 p-6 pb-28 max-w-4xl mx-auto w-full">
          <div ref={observerTarget} className="h-4 w-full flex items-center justify-center">
            {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
          </div>

          {messages.map(item => {
            if ('type' in item && item.type === 'date') {
              let dateLabel = format(new Date(item.date), 'MMMM d, yyyy');
              if (isToday(new Date(item.date))) dateLabel = t('chat.today');
              else if (isYesterday(new Date(item.date))) dateLabel = t('chat.yesterday');

              return (
                <div key={item.id} className="flex justify-center my-6 sticky top-0 z-10 py-2">
                  <span className="px-4 py-1.5 bg-[#181818]/80 backdrop-blur-md rounded-full text-[11px] font-semibold text-gray-400 border border-white/5 uppercase tracking-wider shadow-lg">
                    {dateLabel}
                  </span>
                </div>
              );
            }

            const message = item as ChatMessage;
            return (
              <ChatMessageItem
                key={message.id}
                message={message}
                onVisible={queueMarkRead}
                onImageClick={setViewerImage}
              />
            );
          })}
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </ScrollArea>

      <div className="absolute bottom-6 left-4 right-4 z-20 flex flex-col gap-3 max-w-4xl mx-auto">
        {previews.length > 0 && (
          <div className="flex gap-3 p-3 bg-[#1e1e1e]/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/5 overflow-x-auto">
            {previews.map((url, i) => (
              <div key={i} className="relative h-20 w-20 shrink-0">
                {selectedFiles[i]?.type.startsWith('video/') ? (
                  <div className="h-full w-full bg-black/40 rounded-xl border border-white/5 flex items-center justify-center">
                    <Video className="h-8 w-8 text-neutral-500" />
                  </div>
                ) : (
                  <img
                    src={url}
                    alt="Preview"
                    className="h-full w-full object-cover rounded-xl border border-white/10"
                  />
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-lg hover:bg-red-700 transition-all border border-black/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={handleSendMessage}
          className="flex items-center  bg-[#181818]/95 backdrop-blur-2xl px-3 py-2.5 rounded-[2rem] shadow-2xl border border-white/10 max-w-full"
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
          <div className="flex items-center shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={selectedFiles.length >= 4 || isUploading || isOptimizing}
              className="rounded-full h-9 w-6 shrink-0 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => cameraInputRef.current?.click()}
              disabled={selectedFiles.length >= 4 || isUploading || isOptimizing}
              className="rounded-full h-9 w-6 shrink-0 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isOptimizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleShareLocation}
              disabled={isUploading || isOptimizing}
              className="rounded-full h-9 w-6 shrink-0 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <MapPin className="h-5 w-5" />
            </Button>
          </div>

          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={t('chat.placeholder')}
            className="flex-1 min-w-0 px-3 py-2 bg-transparent border-none text-sm text-white focus:ring-0 outline-none placeholder:text-neutral-600"
            disabled={isUploading || isOptimizing}
          />
          <Button
            type="submit"
            disabled={(!inputText.trim() && selectedFiles.length === 0) || !isConnected || isUploading || isOptimizing}
            size="icon"
            className="rounded-full h-11 w-11 shrink-0 bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 shadow-lg shadow-red-900/40 border border-red-500/20 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale"
          >
            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-0.5" />}
          </Button>
        </form>
      </div>

      <Dialog open={!!viewerImage} onOpenChange={open => !open && setViewerImage(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-none [&>button[data-slot=dialog-close]]:bg-black/50 [&>button[data-slot=dialog-close]]:text-white [&>button[data-slot=dialog-close]]:hover:bg-black/70 [&>button[data-slot=dialog-close]]:rounded-full [&>button[data-slot=dialog-close]]:p-2 [&>button[data-slot=dialog-close]]:top-4 [&>button[data-slot=dialog-close]]:right-4 [&>button[data-slot=dialog-close]]:opacity-100 [&>button[data-slot=dialog-close]_svg]:size-6">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('chat.image_viewer')}</DialogTitle>
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
}: {
  message: ChatMessage;
  onVisible: (id: string) => void;
  onImageClick: (url: string) => void;
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
    <div ref={ref} className={cn('flex flex-col max-w-[85%]', isMe ? 'self-end items-end' : 'self-start items-start')}>
      {!isMe && (
        <span className="text-[10px] text-neutral-500 mb-1.5 ml-1 font-bold uppercase tracking-wider">
          {message.admin?.name || 'Admin'}
        </span>
      )}
      <div
        className={cn(
          'px-5 py-3 rounded-2xl text-sm transition-all duration-300 backdrop-blur-md border shadow-2xl relative overflow-hidden group',
          isMe
            ? 'bg-red-900/20 text-white border-red-500/20 rounded-tr-sm'
            : 'bg-neutral-800/60 text-neutral-200 border-white/5 rounded-tl-sm'
        )}
      >
        {isMe && (
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn('grid gap-2 mb-3', message.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {message.attachments.map((url, i) => {
              if (isVideoFile(url)) {
                return (
                  <video
                    key={i}
                    src={url}
                    controls
                    className="w-full aspect-video object-cover rounded-xl border border-white/10"
                  />
                );
              }
              return (
                <img
                  key={i}
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="w-full aspect-video object-cover rounded-xl cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all border border-white/10"
                  onClick={() => onImageClick(url)}
                />
              );
            })}
          </div>
        )}
        {message.latitude && message.longitude && (
          <a
            href={`https://maps.google.com/?q=${message.latitude},${message.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl mb-2 flex-1 border transition-all hover:opacity-90 max-w-xs',
              isMe
                ? 'bg-red-950/40 border-red-500/30 text-white hover:bg-red-950/60'
                : 'bg-neutral-900/60 border-white/5 text-neutral-200 hover:bg-neutral-800'
            )}
          >
            <div className={cn('p-2 rounded-full shrink-0', isMe ? 'bg-red-500/20' : 'bg-neutral-700/50')}>
              <MapPin size={20} className={isMe ? 'text-red-400' : 'text-neutral-400'} />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-[14px]">Shared Location</span>
              <span className="text-[11px] opacity-70 mt-0.5 pointer-events-none">Click to open map</span>
            </div>
          </a>
        )}
        {message.content ? <p className="whitespace-pre-wrap break-words relative z-10">{message.content}</p> : null}
      </div>
      <div className="flex items-center mt-1.5 gap-2 px-1">
        <span className="text-[10px] font-medium text-neutral-600">{format(new Date(message.createdAt), 'HH:mm')}</span>
        {isMe && (
          <div className="flex items-center gap-0.5">
            {message.readAt ? (
              <CheckCheck className="h-3 w-3 text-red-500" />
            ) : (
              <Check className="h-3 w-3 text-neutral-600" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
