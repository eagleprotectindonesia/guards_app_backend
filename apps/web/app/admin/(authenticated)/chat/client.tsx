'use client';

import { useRef, useCallback, useMemo } from 'react';
import { ArchiveRestore, ArchiveX, MessageSquare, Send, User, Paperclip, Loader2, Lock } from 'lucide-react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { AdminChatLaunchPayload, useAdminChat } from '@/hooks/use-admin-chat';
import { useSession } from '../context/session-context';
import { ConversationList } from '../components/chat/conversation-list';
import { ChatMessageList } from '../components/chat/message-list';
import { ChatAttachmentPreviews } from '../components/chat/attachment-previews';

export function AdminChatClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const employeeIdParam = searchParams.get('employeeId');
  const employeeNameParam = searchParams.get('employeeName');
  const employeeNumberParam = searchParams.get('employeeNumber');
  const { userId, hasPermission } = useSession();
  const canCreateChat = hasPermission('chat:create');
  const currentQuery = searchParams.toString();

  const onSelectConversation = useCallback(
    (employeeId: string | null, draft?: AdminChatLaunchPayload | null) => {
      if (employeeId) {
        const params = new URLSearchParams({ employeeId });
        if (draft?.employeeName) {
          params.set('employeeName', draft.employeeName);
        }
        if (draft?.employeeNumber) {
          params.set('employeeNumber', draft.employeeNumber);
        }
        const nextQuery = params.toString();
        const nextUrl = `${pathname}?${nextQuery}`;
        const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;

        if (nextUrl !== currentUrl) {
          router.replace(nextUrl, { scroll: false });
        }
        return;
      }

      if (currentQuery) {
        router.replace(pathname, { scroll: false });
      }
    },
    [currentQuery, pathname, router]
  );

  const chatOptions = useMemo(
    () => ({
      initialEmployeeId: employeeIdParam,
      initialDraft:
        employeeIdParam && employeeNameParam
          ? {
              employeeId: employeeIdParam,
              employeeName: employeeNameParam,
              employeeNumber: employeeNumberParam,
            }
          : null,
      onSelectConversation,
    }),
    [employeeIdParam, employeeNameParam, employeeNumberParam, onSelectConversation]
  );

  const {
    conversations,
    filteredConversations,
    activeEmployeeId,
    messages,
    inputText,
    searchTerm,
    activeView,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isUploading,
    isOptimizing,
    previews,
    typingEmployees,
    conversationLocks,
    isConnected,
    setSearchTerm,
    handleViewChange,
    handleSelectConversation,
    handleSendMessage,
    handleFileChange,
    removeFile,
    handleInputChange,
    fetchNextPage,
    fetchNextConversationPage,
    hasNextConversationPage,
    isFetchingNextConversationPage,
    handleArchiveConversation,
    handleUnarchiveConversation,
  } = useAdminChat(chatOptions);

  const fileInputRef = useRef<HTMLInputElement>(null);


  const activeEmployee = conversations.find(c => c.employeeId === activeEmployeeId);

  const currentLock = activeEmployeeId ? conversationLocks[activeEmployeeId] : null;
  const isLockedByOther = !!(currentLock && currentLock.lockedBy !== userId);

  return (
    <div className="flex h-[calc(100vh-180px)] bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      {/* Sidebar: Conversation List */}
      <ConversationList
        conversations={filteredConversations}
        activeEmployeeId={activeEmployeeId}
        currentAdminId={userId}
        onSelect={handleSelectConversation}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        activeView={activeView}
        onViewChange={handleViewChange}
        typingEmployees={typingEmployees}
        className="w-1/3 border-r border-border shrink-0"
        onArchive={handleArchiveConversation}
        onUnarchive={handleUnarchiveConversation}
        onLoadMore={fetchNextConversationPage}
        hasMore={hasNextConversationPage}
        isLoadingMore={isFetchingNextConversationPage}
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
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    {activeEmployee?.employeeName || 'Chat'}{' '}
                    {activeEmployee && (
                      <span className="text-xs font-normal text-muted-foreground">
                        ({activeEmployee.employeeNumber})
                      </span>
                    )}
                    {isLockedByOther && <Lock size={14} className="text-amber-500 fill-amber-500/10" />}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {/* <div className={cn('w-2 h-2 rounded-full', isConnected ? 'bg-green-500' : 'bg-gray-400')} /> */}
                    <span className="text-xs text-muted-foreground">
                      {isLockedByOther ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Locked by another admin</span>
                      ) : typingEmployees[activeEmployeeId] ? (
                        <span className="text-green-600 dark:text-green-400 font-medium animate-pulse">typing...</span>
                      ) : null}
                    </span>
                  </div>
                </div>
              </div>
              {activeEmployee && (
                <button
                  type="button"
                  disabled={activeEmployee.isDraft}
                  onClick={() =>
                    activeEmployee.isArchived
                      ? handleUnarchiveConversation(activeEmployee.employeeId)
                      : handleArchiveConversation(activeEmployee.employeeId)
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                >
                  {activeEmployee.isArchived ? <ArchiveRestore size={16} /> : <ArchiveX size={16} />}
                  {activeEmployee.isDraft ? 'Draft' : activeEmployee.isArchived ? 'Unarchive' : 'Archive'}
                </button>
              )}
            </div>

            {/* Messages */}
            <ChatMessageList
              messages={messages}
              isLoading={isLoading}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
              currentAdminId={userId}
              typingEmployeeName={typingEmployees[activeEmployeeId] ? activeEmployee?.employeeName : undefined}
              className="flex-1 overflow-y-auto"
            />

            {/* Previews Area */}
            <ChatAttachmentPreviews previews={previews} onRemove={removeFile} />

            {/* Footer Input */}
            <div className="p-4 bg-card border-t border-border shrink-0 relative">
              {isLockedByOther && (
                <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg shadow-sm">
                    <Lock size={16} className="text-amber-600" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Another admin is currently responding...
                    </span>
                  </div>
                </div>
              )}

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
                    disabled={previews.length >= 4 || isUploading || isOptimizing || isLockedByOther || !canCreateChat}
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
                    disabled={isUploading || isOptimizing || isLockedByOther || !canCreateChat}
                    placeholder={
                      !canCreateChat
                        ? 'You do not have permission to send messages'
                        : isLockedByOther
                          ? 'Conversation locked'
                          : 'Type a message...'
                    }
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-foreground py-2 resize-none max-h-[120px] placeholder:text-muted-foreground/50"
                  />
                </div>

                <button
                  type="submit"
                    disabled={
                      (!inputText.trim() && previews.length === 0) ||
                      !isConnected ||
                      isUploading ||
                      isOptimizing ||
                      isLockedByOther ||
                      !canCreateChat
                    }
                  className="bg-blue-600 text-white p-3 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-all shadow-md shrink-0 mb-1"
                >
                  {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </form>
              {!isLockedByOther && (
                <p className="text-[10px] text-center text-muted-foreground mt-2">
                  Press Enter to send, Shift + Enter for new line
                </p>
              )}
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
