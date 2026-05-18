'use client';

import { useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '../context/session-context';
import { useAdminNavigationPending } from '../context/admin-navigation-pending-context';
import { useAdminUnifiedChatInbox } from '@/hooks/use-admin-unified-chat-inbox';
import { buildConversationUrl, parseConversationSelection } from '@/lib/chat/conversation-selection';
import { UnifiedConversationList } from '../components/chat/unified-conversation-list';
import { GroupCreateDialog } from '../components/chat/group-create-dialog';
import { GroupMemberManager } from '../components/chat/group-member-manager';
import { DirectChatPane } from '../components/chat/direct-chat-pane';
import { GroupChatPane } from '../components/chat/group-chat-pane';
import ChatExport from '../components/chat/chat-export';
import { ChatMessage } from '@/types/chat';

export function AdminChatClient() {
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isMemberManagerOpen, setIsMemberManagerOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { startNavigation } = useAdminNavigationPending();
  const selectionFromUrl = useMemo(
    () => parseConversationSelection(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const { userId, hasPermission } = useSession();
  const canCreateChat = hasPermission('chat:create');
  const currentQuery = searchParams.toString();
  const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;

  const chatOptions = useMemo(
    () => ({
      initialEmployeeId: selectionFromUrl?.kind === 'direct' ? selectionFromUrl.id : null,
      initialDraft: null,
      onSelectConversation: (employeeId: string | null) => {
        const nextUrl = buildConversationUrl(employeeId ? { kind: 'direct', id: employeeId } : null);
        if (nextUrl !== currentUrl) {
          startNavigation(nextUrl);
          router.replace(nextUrl, { scroll: false });
        }
      },
    }),
    [currentUrl, router, selectionFromUrl, startNavigation]
  );

  const unifiedChat = useAdminUnifiedChatInbox(chatOptions);
  const groupChat = unifiedChat.groupChat;
  const directChat = unifiedChat.directChat;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeEmployee = directChat.conversations.find(c => c.employeeId === directChat.activeEmployeeId);
  const currentLock = directChat.activeEmployeeId ? directChat.conversationLocks[directChat.activeEmployeeId] : null;
  const isLockedByOther = !!(currentLock && currentLock.lockedBy !== userId);

  const exportTargets = useMemo(
    () => unifiedChat.items.map(item => ({ kind: item.kind, id: item.id, title: item.title })),
    [unifiedChat.items]
  );

  return (
    <div className="flex h-[calc(100vh-180px)] bg-card rounded-xl shadow-sm border border-border overflow-hidden relative">
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
        onSelect={selection => {
          unifiedChat.selectConversation(selection);
          const nextUrl = buildConversationUrl(selection);
          if (nextUrl !== currentUrl) {
            startNavigation(nextUrl);
            router.replace(nextUrl, { scroll: false });
          }
        }}
        onSearchChange={unifiedChat.setSearchTerm}
        onStartChat={employeeId => {
          unifiedChat.selectConversation({ kind: 'direct', id: employeeId });
          const nextUrl = buildConversationUrl({ kind: 'direct', id: employeeId });
          if (nextUrl !== currentUrl) {
            startNavigation(nextUrl);
            router.replace(nextUrl, { scroll: false });
          }
        }}
        onViewChange={unifiedChat.setActiveView}
        onKindFilterChange={unifiedChat.setKindFilter}
        onLoadMore={unifiedChat.loadMore}
        onArchive={item => {
          void unifiedChat.archiveItem(item);
        }}
        onUnarchive={item => {
          void unifiedChat.unarchiveItem(item);
        }}
        onCreateGroup={() => setIsCreateGroupOpen(true)}
        onExport={() => setIsExportOpen(true)}
        isExportDisabled={!unifiedChat.selectedConversation}
        exportDisabledReason="Select a conversation first"
        className="w-1/3 border-r border-border shrink-0"
      />

      <div className="flex-1 flex flex-col overflow-hidden bg-muted/5">
        {!unifiedChat.selectedConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
            <h3 className="text-xl font-medium text-foreground mb-2">Messages</h3>
            <p className="max-w-xs mx-auto text-sm">Select a conversation from the inbox to start chatting.</p>
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
            onOpenMembers={() => setIsMemberManagerOpen(true)}
            onRenameGroup={groupChat.renameActiveGroup}
            onInputChange={groupChat.setInputText}
            onSendMessage={() => {
              void groupChat.sendMessage();
            }}
            onFileChange={files => {
              void groupChat.handleFileChange(files);
            }}
            onRemoveFile={groupChat.removeFile}
            fileInputRef={fileInputRef}
          />
        )}
      </div>

      <ChatExport
        targets={exportTargets}
        initialTarget={unifiedChat.selectedConversation}
        isOpen={isExportOpen}
        onOpenChange={setIsExportOpen}
        hideTrigger
      />

      <GroupCreateDialog
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        title={groupChat.createGroupTitle}
        onTitleChange={groupChat.setCreateGroupTitle}
        description={groupChat.createGroupDescription}
        onDescriptionChange={groupChat.setCreateGroupDescription}
        employeeDirectory={groupChat.employeeDirectory}
        adminDirectory={groupChat.adminDirectory}
        selectedEmployeeIds={groupChat.selectedEmployeeIds}
        onSelectedEmployeeIdsChange={groupChat.setSelectedEmployeeIds}
        selectedAdminIds={groupChat.selectedAdminIds}
        onSelectedAdminIdsChange={groupChat.setSelectedAdminIds}
        onCreate={async () => {
          await groupChat.createGroup();
          setIsCreateGroupOpen(false);
        }}
        isLoading={groupChat.isManagingMembers}
      />

      <GroupMemberManager
        isOpen={isMemberManagerOpen}
        onClose={() => setIsMemberManagerOpen(false)}
        groupTitle={groupChat.activeGroup?.title || ''}
        members={groupChat.members}
        isMembersLoading={groupChat.isMembersLoading}
        availableEmployees={groupChat.availableEmployees}
        availableAdmins={groupChat.availableAdmins}
        selectedEmployeeIds={groupChat.selectedEmployeeIds}
        onSelectedEmployeeIdsChange={groupChat.setSelectedEmployeeIds}
        selectedAdminIds={groupChat.selectedAdminIds}
        onSelectedAdminIdsChange={groupChat.setSelectedAdminIds}
        onAddMembers={groupChat.addSelectedMembers}
        onRemoveMember={groupChat.removeMember}
        isManaging={groupChat.isManagingMembers}
        canManage={canCreateChat}
        canDisband={false}
        onDisbandGroup={groupChat.disbandGroup}
        isDisbandingGroup={groupChat.isDisbandingGroup}
      />
    </div>
  );
}
