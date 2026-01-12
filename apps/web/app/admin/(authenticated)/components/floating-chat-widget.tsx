'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/components/socket-provider';
import { MessageSquare, X, Send, User } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Conversation {
  guardId: string;
  guardName: string;
  lastMessage: {
    content: string;
    sender: string;
    createdAt: string;
  };
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  guardId: string;
  adminId?: string | null;
  sender: 'admin' | 'guard';
  content: string;
  createdAt: string;
  readAt?: string | null;
}

export default function FloatingChatWidget() {
  const { socket, isConnected } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeGuardId, setActiveGuardId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [typingGuards, setTypingGuards] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for external open chat events
  useEffect(() => {
    const handleOpenChat = (e: CustomEvent<{ guardId: string }>) => {
      setIsOpen(true);
      handleSelectConversation(e.detail.guardId);
    };
    window.addEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
    return () => window.removeEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
  }, [socket]);
  // Fetch conversations list
  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    }
  };
  const handleSelectConversation = async (guardId: string) => {
    setActiveGuardId(guardId);
    setIsLoading(true);

    // Optimistically clear unread count locally
    setConversations(prev => prev.map(c => (c.guardId === guardId ? { ...c, unreadCount: 0 } : c)));

    try {
      const res = await fetch(`/api/chat/${guardId}`);
      if (res.ok) {
        const data = await res.json();
        const reversed: ChatMessage[] = data.reverse();
        setMessages(reversed);
        if (socket) {
          const unreadIds = reversed
            .filter((m: ChatMessage) => m.sender === 'guard' && !m.readAt)
            .map((m: ChatMessage) => m.id);
          if (unreadIds.length > 0) {
            socket.emit('mark_read', { guardId, messageIds: unreadIds });
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
        if (activeGuardId === message.guardId) {
          setMessages(prev => [...prev, message]);

          // Mark as read if we are looking at it
          if (message.sender === 'guard') {
            socket.emit('mark_read', { guardId: message.guardId, messageIds: [message.id] });
          }
        }

        // Update conversations state locally for immediate feedback
        setConversations(prev => {
          const index = prev.findIndex(c => c.guardId === message.guardId);
          if (index === -1) {
            // New conversation, need full refresh to get names etc
            fetchConversations();
            return prev;
          }

          const updated = [...prev];
          const conv = updated[index];
          const isCurrentlyViewing = activeGuardId === message.guardId;

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

      socket.on('messages_read', (data: { guardId: string; messageIds?: string[] }) => {
        // Update local state to reflect that messages were read
        setConversations(prev => prev.map(c => (c.guardId === data.guardId ? { ...c, unreadCount: 0 } : c)));

        // Update individual messages if they were read by the guard
        if (activeGuardId === data.guardId && data.messageIds) {
          setMessages(prev =>
            prev.map(m => (data.messageIds?.includes(m.id) ? { ...m, readAt: new Date().toISOString() } : m))
          );
        }
      });

      socket.on('typing', (data: { guardId: string; isTyping: boolean }) => {
        setTypingGuards(prev => ({ ...prev, [data.guardId]: data.isTyping }));
      });

      return () => {
        socket.off('new_message');
        socket.off('messages_read');
        socket.off('typing');
      };
    }
  }, [socket, activeGuardId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingGuards]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeGuardId || !socket) return;

    socket.emit('send_message', {
      content: inputText.trim(),
      guardId: activeGuardId,
    });

    setInputText('');

    // Stop typing
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing', { guardId: activeGuardId, isTyping: false });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (socket && activeGuardId) {
      socket.emit('typing', { guardId: activeGuardId, isTyping: true });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { guardId: activeGuardId, isTyping: false });
      }, 3000);
    }
  };

  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

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
            <div className="w-1/3 border-r border-border overflow-y-auto bg-card">
              {conversations.length === 0 ? (
                <div className="text-center text-muted-foreground mt-10 text-sm px-4">No conversations yet</div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.guardId}
                    onClick={() => handleSelectConversation(conv.guardId)}
                    className={cn(
                      'w-full text-left p-3 border-b border-border/50 hover:bg-muted transition-all flex items-center gap-3 relative',
                      activeGuardId === conv.guardId && 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600 dark:border-l-blue-500'
                    )}
                  >
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center shrink-0 relative">
                      <User className="text-muted-foreground" size={16} />
                      {typingGuards[conv.guardId] && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-card rounded-full animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="font-medium text-foreground text-sm truncate">{conv.guardName}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {typingGuards[conv.guardId] ? (
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

            {/* Main: Active Chat Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
              {activeGuardId ? (
                <>
                  {/* Active Chat Header */}
                  <div className="p-2 px-4 border-b border-border bg-card flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <User className="text-blue-600 dark:text-blue-400" size={16} />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm leading-tight text-foreground">
                        {conversations.find(c => c.guardId === activeGuardId)?.guardName}
                      </span>
                      {typingGuards[activeGuardId] && (
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

                  {/* Footer Input */}
                  <form
                    onSubmit={handleSendMessage}
                    className="p-3 bg-card border-t border-border flex gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      value={inputText}
                      onChange={handleInputChange}
                      placeholder="Type a message..."
                      className="flex-1 bg-muted rounded-full px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-muted-foreground/50"
                    />
                    <button
                      type="submit"
                      disabled={!inputText.trim()}
                      className="bg-blue-600 dark:bg-blue-700 text-white p-2 rounded-full disabled:opacity-50 hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                  <MessageSquare size={48} className="mb-4 opacity-10" />
                  <p className="text-sm">Select a guard from the list to start chatting</p>
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
