'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, User, Paperclip, Loader2, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminChat } from '@/hooks/use-admin-chat';
import { useSession } from '../context/session-context';
import { ConversationList } from './chat/conversation-list';
import { ChatMessageList } from './chat/message-list';
import { ChatAttachmentPreviews } from './chat/attachment-previews';

export default function FloatingChatWidget() {
  const pathname = usePathname();

  // Don't show the floating widget if we are on the full chat page
  if (pathname === '/admin/chat') {
    return null;
  }

  return <FloatingChatWidgetContent />;
}

function FloatingChatWidgetContent() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const { userId } = useSession();

  const {
    conversations,
    filteredConversations,
    activeEmployeeId,
    messages,
    inputText,
    searchTerm,
    filterType,
    isLoading,
    isUploading,
    isOptimizing,
    previews,
    typingEmployees,
    isConnected,
    setSearchTerm,
    setFilterType,
    handleSelectConversation,
    handleSendMessage,
    handleFileChange,
    removeFile,
    handleInputChange,
    fetchConversations,
  } = useAdminChat();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMaximize = () => {
    if (activeEmployeeId) {
      router.push(`/admin/chat?employeeId=${activeEmployeeId}`);
    } else {
      router.push('/admin/chat');
    }
    setIsOpen(false);
  };

  // Listen for external open chat events
  useEffect(() => {
    const handleOpenChat = (e: CustomEvent<{ employeeId: string }>) => {
      setIsOpen(true);
      handleSelectConversation(e.detail.employeeId);
    };
    window.addEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
    return () => window.removeEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
  }, [handleSelectConversation]);

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen, fetchConversations]);

  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
  const activeEmployee = conversations.find(c => c.employeeId === activeEmployeeId);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[650px] h-[500px] bg-card rounded-lg shadow-2xl border border-border flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="bg-blue-600 dark:bg-blue-700 text-white p-3 flex items-center justify-between shrink-0">
            <h3 className="font-semibold">Chat Support</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={handleMaximize}
                className="hover:bg-blue-700 dark:hover:bg-blue-800 p-1 rounded-full transition-colors"
                title="Open full chat"
              >
                <Maximize2 size={18} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-blue-700 dark:hover:bg-blue-800 p-1 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 flex overflow-hidden bg-muted/50">
            {/* Sidebar: Conversation List */}
            <ConversationList
              conversations={filteredConversations}
              activeEmployeeId={activeEmployeeId}
              currentAdminId={userId}
              onSelect={handleSelectConversation}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              filterType={filterType}
              onFilterChange={setFilterType}
              typingEmployees={typingEmployees}
              className="w-1/3 border-r border-border shrink-0"
              itemClassName="p-3 gap-3"
              showExportButton={false}
            />

            {/* Main: Active Chat Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
              {activeEmployeeId ? (
                <>
                  {/* Active Chat Header */}
                  <div className="p-2 px-4 border-b border-border bg-card flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <User className="text-blue-600 dark:text-blue-400" size={16} />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm leading-tight text-foreground">
                        {activeEmployee?.employeeName}
                      </span>
                      {typingEmployees[activeEmployeeId] && (
                        <span className="text-[10px] text-green-600 dark:text-green-400 animate-pulse">typing...</span>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  <ChatMessageList
                    messages={messages}
                    isLoading={isLoading}
                    currentAdminId={userId}
                    className="flex-1 overflow-y-auto scrollbar-thin"
                  />

                  {/* Previews Area */}
                  <ChatAttachmentPreviews
                    previews={previews}
                    onRemove={removeFile}
                    className="px-4 py-2 gap-2"
                    itemClassName="h-12 w-12"
                  />

                  {/* Footer Input */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className="p-3 bg-card border-t border-border flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => handleFileChange(Array.from(e.target.files || []))}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={previews.length >= 4 || isUploading || isOptimizing}
                      className="text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isOptimizing ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
                    </button>
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => handleInputChange(e.target.value)}
                      disabled={isUploading || isOptimizing}
                      placeholder="Type a message..."
                      className="flex-1 bg-muted rounded-full px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-muted-foreground/50"
                    />
                    <button
                      type="submit"
                      disabled={
                        (!inputText.trim() && previews.length === 0) || !isConnected || isUploading || isOptimizing
                      }
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
          isOpen
            ? 'bg-card text-foreground rotate-90'
            : 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-600'
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


