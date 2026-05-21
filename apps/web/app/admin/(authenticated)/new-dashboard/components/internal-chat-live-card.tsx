import { useMemo, useState } from 'react';
import { SendHorizontal, User, Users } from 'lucide-react';
import { format, isToday } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChatInboxItem } from '@repo/types';
import { useSession } from '../../context/session-context';
import { LoadingBlock } from '../../components/loading/loading-block';
import { useAdminUnifiedChatInbox } from '@/hooks/use-admin-unified-chat-inbox';
import { buildConversationUrl, type ConversationSelection } from '@/lib/chat/conversation-selection';

export function InternalChatLiveCard() {
  const router = useRouter();
  const { userId, hasPermission } = useSession();
  const canViewChat = hasPermission('chat:view');

  const unifiedChat = useAdminUnifiedChatInbox({
    isChatVisible: false,
    currentAdminId: userId,
  });

  const topItems = useMemo(() => unifiedChat.items.slice(0, 10), [unifiedChat.items]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationSelection>(null);

  const selectedItem = useMemo(() => {
    if (!selectedConversation) return null;
    return topItems.find(item => item.kind === selectedConversation.kind && item.id === selectedConversation.id) ?? null;
  }, [selectedConversation, topItems]);

  const openSelectedConversation = () => {
    if (!selectedConversation) return;
    router.push(buildConversationUrl(selectedConversation));
  };

  const renderSubtitle = (item: ChatInboxItem) => {
    if (item.kind === 'direct') {
      return item.lastMessage ? `${item.lastMessage.senderName}: ${item.lastMessage.content}` : 'No messages yet';
    }

    return (
      item.subtitle ||
      (item.lastMessage ? `${item.lastMessage.senderName}: ${item.lastMessage.content}` : null) ||
      'No group messages yet'
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm h-90 flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Internal Chat (Live)</h3>
        <Link href="/admin/chat" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
          See All
        </Link>
      </div>

      {!canViewChat && (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No chat access
        </div>
      )}

      {canViewChat && unifiedChat.isLoading && topItems.length === 0 && (
        <div className="flex-1 space-y-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <LoadingBlock className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <LoadingBlock className="h-3 w-20" />
                  <LoadingBlock className="h-2 w-12" />
                </div>
                <LoadingBlock className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {canViewChat && !unifiedChat.isLoading && topItems.length === 0 && (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No conversations yet
        </div>
      )}

      {canViewChat && topItems.length > 0 && (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {topItems.map(item => {
              const isSelected = selectedConversation?.kind === item.kind && selectedConversation.id === item.id;
              const timestamp = item.lastMessage?.createdAt
                ? (() => {
                    const date = new Date(item.lastMessage.createdAt);
                    return isToday(date) ? format(date, 'hh:mm a') : format(date, 'MMM d');
                  })()
                : '';
              return (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  onClick={() => setSelectedConversation({ kind: item.kind, id: item.id })}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    isSelected ? 'border-blue-500/60 bg-blue-500/10' : 'border-border bg-muted/10 hover:bg-muted/20'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        item.kind === 'group'
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {item.kind === 'group' ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                        <div className="flex items-center gap-1.5">
                          {timestamp && <span className="shrink-0 text-[10px] text-muted-foreground">{timestamp}</span>}
                          {item.unreadCount > 0 && (
                            <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                              {item.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{renderSubtitle(item)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedItem && (
            <button
              type="button"
              onClick={openSelectedConversation}
              className="mt-3 flex h-10 w-full items-center justify-between rounded-lg border border-border bg-muted/15 px-3 text-sm text-muted-foreground hover:bg-muted/25"
            >
              <span className="truncate">Type a message...</span>
              <SendHorizontal className="h-4 w-4 shrink-0" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
