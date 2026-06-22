'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MessageSquare, X, Maximize2 } from 'lucide-react';
import { cn } from '@repo/shared';
import { usePathname } from 'next/navigation';
import { useAdminUnifiedChatInbox } from '@/hooks/use-admin-unified-chat-inbox';
import { buildConversationUrl } from '@/lib/chat/conversation-selection';
import { consumeWidgetResumeState } from '@/lib/chat/widget-resume-state';
import { AdminChatLaunchPayload } from '@/hooks/use-admin-chat';
import { useSession } from '../context/session-context';
import { UnifiedConversationList } from './chat/unified-conversation-list';
import { DirectChatPane } from './chat/direct-chat-pane';
import { GroupChatPane } from './chat/group-chat-pane';
import ConfirmDialog from './confirm-dialog';
import { ChatMessage } from '@/types/chat';
import { useAdminRouter } from '../context/admin-router';

export default function FloatingChatWidget() {
  const pathname = usePathname();

  if (pathname === '/admin/chat' || pathname === '/admin/new-dashboard' || pathname === '/admin/sites-map') {
    return null;
  }

  return <FloatingChatWidgetContent />;
}

function FloatingChatWidgetContent() {
  const router = useAdminRouter();
  const [resumeState] = useState(() => consumeWidgetResumeState());
  const [isOpen, setIsOpen] = useState(() => resumeState?.isOpen ?? false);
  const { userId, hasPermission } = useSession();
  const canCreateChat = hasPermission('chat:create');

  const unifiedChat = useAdminUnifiedChatInbox({ isChatVisible: isOpen, currentAdminId: userId });
  const groupChat = unifiedChat.groupChat;
  const directChat = unifiedChat.directChat;

  const totalUnreadCount = useMemo(() => {
    const groupUnread = groupChat.inboxItems.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0);
    return directChat.adminUnreadCount + groupUnread;
  }, [directChat.adminUnreadCount, groupChat.inboxItems]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeEmployee = directChat.conversations.find(c => c.employeeId === directChat.activeEmployeeId);
  const currentLock = directChat.activeEmployeeId ? directChat.conversationLocks[directChat.activeEmployeeId] : null;
  const isLockedByOther = !!(currentLock && currentLock.lockedBy !== userId);

  const handleMaximize = () => {
    const href = buildConversationUrl(unifiedChat.selectedConversation);
    router.push(href);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleOpenChat = (e: CustomEvent<AdminChatLaunchPayload>) => {
      setIsOpen(true);
      unifiedChat.selectConversation({ kind: 'direct', id: e.detail.employeeId });
    };
    window.addEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
    return () => window.removeEventListener('open-admin-chat' as keyof WindowEventMap, handleOpenChat as EventListener);
  }, [unifiedChat]);

  useEffect(() => {
    if (!resumeState?.selection) return;
    unifiedChat.selectConversation(resumeState.selection);
  }, [resumeState, unifiedChat]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-[50vw] h-[500px] bg-card rounded-lg shadow-2xl border border-border flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
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

          <div className="flex-1 flex overflow-hidden bg-muted/50">
            <UnifiedConversationList
              items={unifiedChat.items}
              startChatCandidates={unifiedChat.startChatCandidates}
              selectedConversation={unifiedChat.selectedConversation}
              activeView={unifiedChat.activeView}
              kindFilter={unifiedChat.kindFilter}
              searchTerm={unifiedChat.searchTerm}
              isLoading={unifiedChat.isLoading}
              hasMore={unifiedChat.hasMore}
              isLoadingMore={unifiedChat.isFetchingMore}
              onSelect={unifiedChat.selectConversation}
              onStartChat={employeeId => unifiedChat.selectConversation({ kind: 'direct', id: employeeId })}
              onSearchChange={unifiedChat.setSearchTerm}
              onViewChange={unifiedChat.setActiveView}
              onKindFilterChange={unifiedChat.setKindFilter}
              onLoadMore={unifiedChat.loadMore}
              onArchive={item => {
                void unifiedChat.archiveItem(item);
              }}
              onUnarchive={item => {
                void unifiedChat.unarchiveItem(item);
              }}
              showCreateGroupButton={false}
              showExportButton={false}
              className="w-1/3 border-r border-border shrink-0"
              isWidget
            />

            <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
              {!unifiedChat.selectedConversation ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                  <MessageSquare size={48} className="mb-4 opacity-10" />
                  <p className="text-sm">Select a conversation from the list to start chatting</p>
                </div>
              ) : unifiedChat.selectedConversation.kind === 'direct' ? (
                <DirectChatPane
                  activeEmployeeId={directChat.activeEmployeeId}
                  activeEmployee={activeEmployee}
                  messages={directChat.messages}
                  isLoading={directChat.isLoading}
                  hasNextPage={directChat.hasNextPage}
                  isFetchingNextPage={directChat.isFetchingNextPage}
                  fetchNextPage={directChat.fetchNextPage}
                  currentAdminId={userId}
                  typingEmployees={directChat.typingEmployees}
                  isConnected={directChat.isConnected}
                  isLockedByOther={isLockedByOther}
                  canCreateChat={canCreateChat}
                  inputText={directChat.inputText}
                  previews={directChat.previews}
                  isUploading={directChat.isUploading}
                  isOptimizing={directChat.isOptimizing}
                  onInputChange={directChat.handleInputChange}
                  onSendMessage={() => {
                    void directChat.handleSendMessage();
                  }}
                  onFileChange={files => {
                    void directChat.handleFileChange(files);
                  }}
                  onRemoveFile={directChat.removeFile}
                  onArchive={directChat.handleArchiveConversation}
                  onUnarchive={directChat.handleUnarchiveConversation}
                  fileInputRef={fileInputRef}
                  isWidget
                />
              ) : (
                <GroupChatPane
                  activeGroupId={groupChat.activeGroupId}
                  activeGroupTitle={groupChat.activeGroup?.title}
                  activeGroupDescription={groupChat.activeGroup?.description}
                  memberCount={groupChat.members.length}
                  messages={groupChat.messages as unknown as ChatMessage[]}
                  isMessagesLoading={groupChat.isMessagesLoading}
                  currentAdminId={userId}
                  previews={groupChat.previews}
                  isUploading={groupChat.isUploading}
                  inputText={groupChat.inputText}
                  canCreateChat={canCreateChat}
                  isRenamingGroup={groupChat.isRenamingGroup}
                  onOpenMembers={() => {}}
                  onRenameGroup={groupChat.renameActiveGroup}
                  onLeaveGroup={groupChat.leaveActiveGroup}
                  onInputChange={groupChat.setInputText}
                  onSendMessage={() => {
                    void groupChat.sendMessage();
                  }}
                  onFileChange={files => {
                    void groupChat.handleFileChange(files);
                  }}
                  onRemoveFile={groupChat.removeFile}
                  fileInputRef={fileInputRef}
                  showManageButton={false}
                  isWidget
                />
              )}
            </div>
          </div>
        </div>
      )}

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

        {!isOpen && totalUnreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold border-2 border-white dark:border-slate-900">
            {totalUnreadCount}
          </div>
        )}

        {!directChat.isConnected && !isOpen && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-gray-400 rounded-full border-2 border-white dark:border-slate-900" />
        )}
      </button>

      <ConfirmDialog
        isOpen={!!directChat.pendingArchivedLaunch}
        onClose={directChat.cancelArchivedLaunch}
        onConfirm={directChat.confirmArchivedLaunch}
        title="Resume archived chat?"
        description={
          directChat.pendingArchivedLaunch
            ? `Chat with ${directChat.pendingArchivedLaunch.employeeName} is archived. Resuming will move it back to Inbox and unmute it.`
            : ''
        }
        confirmText="Resume Chat"
        variant="neutral"
      />
    </div>
  );
}
