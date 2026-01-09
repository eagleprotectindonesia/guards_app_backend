'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/components/socket-provider';
import { MessageSquare, X, Send, ChevronLeft, User } from 'lucide-react';
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for external open chat events
  useEffect(() => {
    const handleOpenChat = (e: CustomEvent<{ guardId: string }>) => {
      setIsOpen(true);
      setActiveGuardId(e.detail.guardId);
    };

    window.addEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
    return () => window.removeEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
  }, []);

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

  // Fetch messages for active guard
  const fetchMessages = async (guardId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/chat/${guardId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.reverse());
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
    if (activeGuardId) {
      fetchMessages(activeGuardId);

      // Mark as read
      if (socket) {
        const unreadIds = messages.filter(m => m.sender === 'guard' && !m.readAt).map(m => m.id);

        if (unreadIds.length > 0) {
          socket.emit('mark_read', { guardId: activeGuardId, messageIds: unreadIds });
        }
      }
    }
  }, [activeGuardId]);

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

        // Always refresh conversations list to show last message/badge
        fetchConversations();
      });

      socket.on('messages_read', () => {
        // Refresh conversations to update unread counts when messages are marked as read
        fetchConversations();
      });

      return () => {
        socket.off('new_message');
        socket.off('messages_read');
      };
    }
  }, [socket, activeGuardId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeGuardId || !socket) return;

    socket.emit('send_message', {
      content: inputText.trim(),
      guardId: activeGuardId,
    });

    setInputText('');
  };

  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 h-[500px] bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeGuardId && (
                <button
                  onClick={() => setActiveGuardId(null)}
                  className="p-1 hover:bg-blue-700 rounded-full transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              <h3 className="font-semibold">
                {activeGuardId ? conversations.find(c => c.guardId === activeGuardId)?.guardName : 'Messages'}
              </h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-blue-700 p-1 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-gray-50 p-4" ref={scrollRef}>
            {!activeGuardId ? (
              /* Conversation List */
              <div className="space-y-2">
                {conversations.length === 0 ? (
                  <div className="text-center text-gray-500 mt-10">No conversations yet</div>
                ) : (
                  conversations.map(conv => (
                    <button
                      key={conv.guardId}
                      onClick={() => setActiveGuardId(conv.guardId)}
                      className="w-full text-left p-3 bg-white rounded-lg border border-gray-100 hover:border-blue-300 hover:shadow-sm transition-all flex items-center gap-3 relative"
                    >
                      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="text-gray-500" size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <p className="font-medium text-gray-900 truncate">{conv.guardName}</p>
                          <span className="text-[10px] text-gray-400">
                            {format(new Date(conv.lastMessage.createdAt), 'HH:mm')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {conv.lastMessage.sender === 'admin' ? 'You: ' : ''}
                          {conv.lastMessage.content}
                        </p>
                      </div>
                      {conv.unreadCount > 0 && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                          {conv.unreadCount}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            ) : (
              /* Message List */
              <div className="space-y-3">
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
                          'p-3 rounded-2xl text-sm',
                          msg.sender === 'admin'
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                        )}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-gray-400 mt-1 px-1">
                        {format(new Date(msg.createdAt), 'HH:mm')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Footer Input */}
          {activeGuardId && (
            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-gray-200 flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="bg-blue-600 text-white p-2 rounded-full disabled:opacity-50 hover:bg-blue-700 transition-colors"
              >
                <Send size={18} />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 relative',
          isOpen ? 'bg-white text-gray-600 rotate-90' : 'bg-blue-600 text-white hover:bg-blue-700'
        )}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}

        {!isOpen && totalUnread > 0 && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold border-2 border-white">
            {totalUnread}
          </div>
        )}

        {!isConnected && !isOpen && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-gray-400 rounded-full border-2 border-white" />
        )}
      </button>
    </div>
  );
}
