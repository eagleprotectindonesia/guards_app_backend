'use client';

import { Loader2, Paperclip, Send, Users } from 'lucide-react';
import { ChatMessage } from '@/types/chat';
import { ChatMessageList } from './message-list';
import { ChatAttachmentPreviews } from './attachment-previews';

type GroupChatPaneProps = {
  activeGroupId: string | null;
  activeGroupTitle?: string;
  activeGroupDescription?: string | null;
  memberCount: number;
  messages: ChatMessage[];
  isMessagesLoading: boolean;
  currentAdminId?: string | null;
  previews: string[];
  isUploading: boolean;
  inputText: string;
  canCreateChat: boolean;
  onOpenMembers: () => void;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onFileChange: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export function GroupChatPane(props: GroupChatPaneProps) {
  const {
    activeGroupId,
    activeGroupTitle,
    activeGroupDescription,
    memberCount,
    messages,
    isMessagesLoading,
    currentAdminId,
    previews,
    isUploading,
    inputText,
    canCreateChat,
    onOpenMembers,
    onInputChange,
    onSendMessage,
    onFileChange,
    onRemoveFile,
    fileInputRef,
  } = props;

  if (!activeGroupId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
        <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mb-6">
          <Users size={40} className="opacity-20" />
        </div>
        <h3 className="text-xl font-medium text-foreground mb-2">Group Messages</h3>
        <p className="max-w-xs mx-auto text-sm">Select a group from the sidebar to view the conversation.</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 border-b border-border bg-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <Users className="text-blue-600 dark:text-blue-400" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{activeGroupTitle || 'Group Chat'}</h3>
            <span className="text-xs text-muted-foreground">
              {memberCount} members
              {activeGroupDescription ? ` • ${activeGroupDescription}` : ''}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenMembers}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Users size={16} />
          Manage
        </button>
      </div>

      <ChatMessageList
        messages={messages}
        isLoading={isMessagesLoading}
        currentAdminId={currentAdminId}
        mode="group"
        className="flex-1 overflow-y-auto"
      />

      <ChatAttachmentPreviews previews={previews} onRemove={onRemoveFile} />

      <div className="p-4 bg-card border-t border-border shrink-0 relative">
        <form
          onSubmit={e => {
            e.preventDefault();
            onSendMessage();
          }}
          className="flex items-end gap-3 max-w-4xl mx-auto"
        >
          <div className="flex-1 bg-muted/50 rounded-2xl border border-border focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all flex items-end p-2 px-4 gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={e => onFileChange(Array.from(e.target.files || []))}
              accept="image/*"
              multiple
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={previews.length >= 4 || isUploading || !canCreateChat}
              className="mb-1 text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-50 shrink-0 p-1"
            >
              <Paperclip size={22} />
            </button>
            <textarea
              rows={1}
              value={inputText}
              onChange={e => {
                onInputChange(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSendMessage();
                }
              }}
              disabled={isUploading || !canCreateChat}
              placeholder={!canCreateChat ? 'Read-only mode' : 'Type a message to the group...'}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-foreground py-2 resize-none max-h-[120px] placeholder:text-muted-foreground/50"
            />
          </div>
          <button
            type="submit"
            disabled={(!inputText.trim() && previews.length === 0) || isUploading || !canCreateChat}
            className="bg-blue-600 text-white p-3 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-all shadow-md shrink-0 mb-1"
          >
            {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </form>
      </div>
    </>
  );
}
