'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, User, Paperclip, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAdminChat } from '@/hooks/use-admin-chat';
import { ConversationList } from '../components/chat/conversation-list';
import { ChatMessageList } from '../components/chat/message-list';
import { ChatAttachmentPreviews } from '../components/chat/attachment-previews';

export function AdminChatClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeIdParam = searchParams.get('employeeId');

  const onSelectConversation = useCallback(
    (employeeId: string) => {
      router.push(`/admin/chat?employeeId=${employeeId}`, { scroll: false });
    },
    [router]
  );

  const chatOptions = React.useMemo(
    () => ({
      initialEmployeeId: employeeIdParam,
      onSelectConversation,
    }),
    [employeeIdParam, onSelectConversation]
  );

  const {
    conversations,
    filteredConversations,
    activeEmployeeId,
    messages,
    inputText,
    searchTerm,
    isLoading,
    isUploading,
    isOptimizing,
    previews,
    typingEmployees,
    isConnected,
    setSearchTerm,
    handleSelectConversation,
    handleSendMessage,
    handleFileChange,
    removeFile,
    handleInputChange,
    fetchConversations,
  } = useAdminChat(chatOptions);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const activeEmployee = conversations.find(c => c.employeeId === activeEmployeeId);

  return (
    <div className="flex h-[calc(100vh-180px)] bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      {/* Sidebar: Conversation List */}
      <ConversationList
        conversations={filteredConversations}
        activeEmployeeId={activeEmployeeId}
        onSelect={handleSelectConversation}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        typingEmployees={typingEmployees}
        className="w-1/3 border-r border-border shrink-0"
      />

      {/* Main: Active Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-muted/5">
        {activeEmployeeId ? (
          <>
            {/* Active Chat Header */}
            <div className="p-4 border-b border-border bg-card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <User className="text-blue-600 dark:text-blue-400" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{activeEmployee?.employeeName || 'Chat'}</h3>
                  <div className="flex items-center gap-1.5">
                    {/* <div className={cn('w-2 h-2 rounded-full', isConnected ? 'bg-green-500' : 'bg-gray-400')} /> */}
                    <span className="text-xs text-muted-foreground">
                      {typingEmployees[activeEmployeeId] ? (
                        <span className="text-green-600 dark:text-green-400 font-medium animate-pulse">typing...</span>
                      ) : null}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ChatMessageList
              messages={messages}
              isLoading={isLoading}
              typingEmployeeName={typingEmployees[activeEmployeeId] ? activeEmployee?.employeeName : undefined}
              className="flex-1 overflow-y-auto"
            />

            {/* Previews Area */}
            <ChatAttachmentPreviews previews={previews} onRemove={removeFile} />

            {/* Footer Input */}
            <div className="p-4 bg-card border-t border-border shrink-0">
              <form onSubmit={handleSendMessage} className="flex items-end gap-3 max-w-4xl mx-auto">
                <div className="flex-1 bg-muted/50 rounded-2xl border border-border focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all flex items-end p-2 px-4 gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={e => handleFileChange(Array.from(e.target.files || []))}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={previews.length >= 4 || isUploading || isOptimizing}
                    className="mb-1 text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-50 shrink-0 p-1"
                  >
                    {isOptimizing ? <Loader2 size={22} className="animate-spin" /> : <Paperclip size={22} />}
                  </button>

                  <textarea
                    rows={1}
                    value={inputText}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                      handleInputChange(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={isUploading || isOptimizing}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-foreground py-2 resize-none max-h-[120px] placeholder:text-muted-foreground/50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={(!inputText.trim() && previews.length === 0) || !isConnected || isUploading || isOptimizing}
                  className="bg-blue-600 text-white p-3 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-all shadow-md shrink-0 mb-1"
                >
                  {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </form>
              <p className="text-[10px] text-center text-muted-foreground mt-2">
                Press Enter to send, Shift + Enter for new line
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
            <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mb-6">
              <MessageSquare size={40} className="opacity-20" />
            </div>
            <h3 className="text-xl font-medium text-foreground mb-2">Your Messages</h3>
            <p className="max-w-xs mx-auto text-sm">
              Select an employee from the sidebar to view your conversation history or start a new chat.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}