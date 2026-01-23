'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/components/socket-provider';
import { MessageSquare, X, Send, User, Search, Paperclip, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn, isVideoFile } from '@/lib/utils';
import { uploadToS3 } from '@/lib/upload';
import { optimizeImage } from '@/lib/image-utils';
import { toast } from 'react-hot-toast';

interface Conversation {
  employeeId: string;
  employeeName: string;
  lastMessage: {
    content: string;
    sender: string;
    createdAt: string;
  };
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  employeeId: string;
  adminId?: string | null;
  sender: 'admin' | 'employee';
  content: string;
  attachments: string[];
  createdAt: string;
  readAt?: string | null;
}

export default function FloatingChatWidget() {
  const { socket, isConnected } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeemployeeId, setActiveemployeeId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [typingEmployees, setTypingEmployees] = useState<Record<string, boolean>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listen for external open chat events
  useEffect(() => {
    const handleOpenChat = (e: CustomEvent<{ employeeId: string }>) => {
      setIsOpen(true);
      handleSelectConversation(e.detail.employeeId);
    };
    window.addEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
    return () => window.removeEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
  }, [socket]);
  // Fetch conversations list
  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/shared/chat/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    }
  };
  const handleSelectConversation = async (employeeId: string) => {
    setActiveemployeeId(employeeId);
    setIsLoading(true);

    // Optimistically clear unread count locally
    setConversations(prev => prev.map(c => (c.employeeId === employeeId ? { ...c, unreadCount: 0 } : c)));

    try {
      const res = await fetch(`/api/shared/chat/${employeeId}`);
      if (res.ok) {
        const data = await res.json();
        const reversed: ChatMessage[] = data.reverse();
        setMessages(reversed);
        if (socket) {
          const unreadIds = reversed
            .filter((m: ChatMessage) => m.sender === 'employee' && !m.readAt)
            .map((m: ChatMessage) => m.id);
          if (unreadIds.length > 0) {
            socket.emit('mark_read', { employeeId, messageIds: unreadIds });
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages', err);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen]);

  useEffect(() => {
    if (socket) {
      socket.on('new_message', (message: ChatMessage) => {
        // If it's for current active conversation, add it
        if (activeemployeeId === message.employeeId) {
          setMessages(prev => [...prev, message]);

          // Mark as read if we are looking at it
          if (message.sender === 'employee') {
            socket.emit('mark_read', { employeeId: message.employeeId, messageIds: [message.id] });
          }
        }

        // Update conversations state locally for immediate feedback
        setConversations(prev => {
          const index = prev.findIndex(c => c.employeeId === message.employeeId);
          if (index === -1) {
            // New conversation, need full refresh to get names etc
            fetchConversations();
            return prev;
          }

          const updated = [...prev];
          const conv = updated[index];
          const isCurrentlyViewing = activeemployeeId === message.employeeId;

          updated[index] = {
            ...conv,
            lastMessage: {
              content: message.content,
              sender: message.sender,
              createdAt: message.createdAt,
            },
            unreadCount: isCurrentlyViewing || message.sender === 'admin' ? conv.unreadCount : conv.unreadCount + 1,
          };

          // Move to top of list
          const [moved] = updated.splice(index, 1);
          updated.unshift(moved);

          return updated;
        });
      });

      socket.on('messages_read', (data: { employeeId: string; messageIds?: string[] }) => {
        // Update local state to reflect that messages were read
        setConversations(prev => prev.map(c => (c.employeeId === data.employeeId ? { ...c, unreadCount: 0 } : c)));

        // Update individual messages if they were read by the employee
        if (activeemployeeId === data.employeeId && data.messageIds) {
          setMessages(prev =>
            prev.map(m => (data.messageIds?.includes(m.id) ? { ...m, readAt: new Date().toISOString() } : m))
          );
        }
      });

      socket.on('typing', (data: { employeeId: string; isTyping: boolean }) => {
        setTypingEmployees(prev => ({ ...prev, [data.employeeId]: data.isTyping }));
      });

      return () => {
        socket.off('new_message');
        socket.off('messages_read');
        socket.off('typing');
      };
    }
  }, [socket, activeemployeeId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingEmployees]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length !== files.length) {
      toast.error('Only image files are allowed in this chat');
    }

    if (imageFiles.length === 0) return;

    setIsOptimizing(true);
    try {
      const processedFiles = await Promise.all(
        imageFiles.map(file => optimizeImage(file))
      );

      const currentFiles = [...selectedFiles, ...processedFiles].slice(0, 4);
      setSelectedFiles(currentFiles);

      const newPreviews = processedFiles.map(file => URL.createObjectURL(file));
      setPreviews(prev => [...prev, ...newPreviews].slice(0, 4));
    } catch (error) {
      console.error('File processing failed:', error);
      toast.error('Failed to process images');
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
    if ((!inputText.trim() && selectedFiles.length === 0) || !activeemployeeId || !socket || isUploading) return;

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
        employeeId: activeemployeeId,
        attachments,
      });

      setInputText('');
      setSelectedFiles([]);
      previews.forEach(url => URL.revokeObjectURL(url));
      setPreviews([]);

      // Stop typing
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit('typing', { employeeId: activeemployeeId, isTyping: false });
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (socket && activeemployeeId) {
      socket.emit('typing', { employeeId: activeemployeeId, isTyping: true });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { employeeId: activeemployeeId, isTyping: false });
      }, 3000);
    }
  };

  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  const filteredConversations = conversations.filter(conv =>
    conv.employeeName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[650px] h-[500px] bg-card rounded-lg shadow-2xl border border-border flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="bg-blue-600 dark:bg-blue-700 text-white p-3 flex items-center justify-between shrink-0">
            <h3 className="font-semibold">Chat Support</h3>
            <button onClick={() => setIsOpen(false)} className="hover:bg-blue-700 dark:hover:bg-blue-800 p-1 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 flex overflow-hidden bg-muted/50">
            {/* Sidebar: Conversation List */}
            <div className="w-1/3 border-r border-border flex flex-col bg-card">
              <div className="p-2 border-b border-border bg-muted/30">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input
                    type="text"
                    placeholder="Search employee..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-background border border-border rounded-md pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground/50"
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {filteredConversations.length === 0 ? (
                  <div className="text-center text-muted-foreground mt-10 text-sm px-4">
                    {searchTerm ? 'No employees found' : 'No conversations yet'}
                  </div>
                ) : (
                  filteredConversations.map(conv => (
                    <button
                      key={conv.employeeId}
                      onClick={() => handleSelectConversation(conv.employeeId)}
                      className={cn(
                        'w-full text-left p-3 border-b border-border/50 hover:bg-muted transition-all flex items-center gap-3 relative',
                        activeemployeeId === conv.employeeId && 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600 dark:border-l-blue-500'
                      )}
                    >
                      <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center shrink-0 relative">
                        <User className="text-muted-foreground" size={16} />
                        {typingEmployees[conv.employeeId] && (
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-card rounded-full animate-pulse" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <p className="font-medium text-foreground text-sm truncate">{conv.employeeName}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {typingEmployees[conv.employeeId] ? (
                            <span className="text-green-600 dark:text-green-400 font-medium italic">typing...</span>
                          ) : (
                            <>
                              {conv.lastMessage.sender === 'admin' ? 'You: ' : ''}
                              {conv.lastMessage.content}
                            </>
                          )}
                        </p>
                      </div>
                      {conv.unreadCount > 0 && (
                        <div className="absolute top-3 right-2 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                          {conv.unreadCount}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Main: Active Chat Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
              {activeemployeeId ? (
                <>
                  {/* Active Chat Header */}
                  <div className="p-2 px-4 border-b border-border bg-card flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <User className="text-blue-600 dark:text-blue-400" size={16} />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm leading-tight text-foreground">
                        {conversations.find(c => c.employeeId === activeemployeeId)?.employeeName}
                      </span>
                      {typingEmployees[activeemployeeId] && (
                        <span className="text-[10px] text-green-600 dark:text-green-400 animate-pulse">typing...</span>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
                    {isLoading ? (
                      <div className="flex justify-center mt-10">
                        <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                      </div>
                    ) : (
                      messages.map(msg => (
                        <div
                          key={msg.id}
                          className={cn(
                            'flex flex-col max-w-[85%]',
                            msg.sender === 'admin' ? 'ml-auto items-end' : 'mr-auto items-start'
                          )}
                        >
                          <div
                            className={cn(
                              'p-2 rounded-xl text-sm',
                              msg.sender === 'admin'
                                ? 'bg-blue-600 dark:bg-blue-700 text-white rounded-tr-none'
                                : 'bg-card border border-border text-foreground rounded-tl-none'
                            )}
                          >
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className={cn(
                                "grid gap-1 mb-2",
                                msg.attachments.length === 1 ? "grid-cols-1" : "grid-cols-2"
                              )}>
                                {msg.attachments.map((url, i) => {
                                  if (isVideoFile(url)) {
                                    return (
                                      <video
                                        key={i}
                                        src={url}
                                        controls
                                        className="w-full aspect-video object-cover rounded-lg"
                                      />
                                    );
                                  }
                                  return (
                                    <img
                                      key={i}
                                      src={url}
                                      alt={`Attachment ${i + 1}`}
                                      className="w-full aspect-video object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() => window.open(url, '_blank')}
                                    />
                                  );
                                })}
                              </div>
                            )}
                            {msg.content}
                          </div>
                          <div className="flex items-center gap-1 px-1 mt-1">
                            <span className="text-[9px] text-muted-foreground/60">{format(new Date(msg.createdAt), 'HH:mm')}</span>
                            {msg.sender === 'admin' && (
                              <span className={cn('text-[9px]', msg.readAt ? 'text-blue-500 dark:text-blue-400' : 'text-muted-foreground/30')}>
                                {msg.readAt ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Previews Area */}
                  {previews.length > 0 && (
                    <div className="px-4 py-2 bg-card border-t border-border flex gap-2 overflow-x-auto shrink-0">
                      {previews.map((url, i) => (
                        <div key={i} className="relative h-12 w-12 shrink-0">
                          <img
                            src={url}
                            alt="Preview"
                            className="h-full w-full object-cover rounded-md border border-border"
                          />
                          <button
                            onClick={() => removeFile(i)}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer Input */}
                  <form
                    onSubmit={handleSendMessage}
                    className="p-3 bg-card border-t border-border flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={selectedFiles.length >= 4 || isUploading || isOptimizing}
                      className="text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isOptimizing ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
                    </button>
                    <input
                      type="text"
                      value={inputText}
                      onChange={handleInputChange}
                      disabled={isUploading || isOptimizing}
                      placeholder="Type a message..."
                      className="flex-1 bg-muted rounded-full px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-muted-foreground/50"
                    />
                    <button
                      type="submit"
                      disabled={(!inputText.trim() && selectedFiles.length === 0) || !isConnected || isUploading || isOptimizing}
                      className="bg-blue-600 dark:bg-blue-700 text-white p-2 rounded-full disabled:opacity-50 hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors shrink-0"
                    >
                      {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                  <MessageSquare size={48} className="mb-4 opacity-10" />
                  <p className="text-sm">Select a employee from the list to start chatting</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 relative border border-border/50',
          isOpen ? 'bg-card text-foreground rotate-90' : 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-600'
        )}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}

        {!isOpen && totalUnread > 0 && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold border-2 border-white dark:border-slate-900">
            {totalUnread}
          </div>
        )}

        {!isConnected && !isOpen && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-gray-400 rounded-full border-2 border-white dark:border-slate-900" />
        )}
      </button>
    </div>
  );
}
