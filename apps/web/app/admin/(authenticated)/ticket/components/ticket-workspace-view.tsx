'use client';

import { type ChangeEvent, useRef, useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/components/socket-provider';
import { useSocketEvent } from '@/hooks/use-socket-event';
import { Card } from '@/components/ui/card';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import {
  addTicketMessageAction,
  addTicketMessageWithAttachmentsAction,
  claimTicketAction,
  createTicketAttachmentUploadUrlAction,
  getTicketDetailAction,
  updateTicketStatusAction,
} from '../actions';
import { uploadFileWithPresignedPost } from '@/lib/s3-presigned-post-upload';
import { TicketListPanel } from './ticket-list-panel';
import { TicketDetailHeader } from './ticket-detail-header';
import { TicketTabContent } from './ticket-tab-content';
import type { TicketDetailResult, TicketListItem } from './ticket-dashboard-types';

type Props = {
  initialView: string;
  initialSearch: string;
  requestedTicketId?: string;
  initialItems: TicketListItem[];
  initialHasMore: boolean;
  initialDetail: TicketDetailResult | null;
};

export function TicketWorkspaceView({ initialView, initialItems, requestedTicketId, initialDetail }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const initialSelectedId = requestedTicketId ?? initialItems[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const { socket } = useSocket();

  // Subscribe/unsubscribe to the ticket room based on the selected ticket
  useEffect(() => {
    if (!socket || !selectedId) return;

    socket.emit('subscribe_ticket', selectedId);

    return () => {
      socket.emit('unsubscribe_ticket', selectedId);
    };
  }, [socket, selectedId]);

  // Handle real-time ticket events
  useSocketEvent('ticket_created', () => {
    refreshWorkspace();
  });

  useSocketEvent('ticket_status_updated', payload => {
    const { ticketId } = payload;
    if (ticketId === selectedId) {
      refreshSelectedTicketDetail(ticketId);
    }
    refreshWorkspace();
  });

  useSocketEvent('ticket_message_added', payload => {
    const { ticketId } = payload;
    if (ticketId === selectedId) {
      refreshSelectedTicketDetail(ticketId);
    }
  });

  const { data: detail = null, isLoading: isDetailLoading } = useQuery<TicketDetailResult | null>({
    queryKey: ['ticket', selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      return getTicketDetailAction(selectedId);
    },
    enabled: !!selectedId,
    initialData: selectedId && initialDetail && selectedId === initialDetail.ticket.id ? initialDetail : undefined,
  });

  const syncSelectedIdToUrl = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('ticket', id);
    } else {
      params.delete('ticket');
    }
    startTransition(() => {
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };
  const [message, setMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'discussion' | 'attachments' | 'history'>('discussion');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleSelectTicket(id: string | null) {
    setSelectedId(id);
    setMessage('');
    setSelectedFiles([]);
    setActiveTab('discussion');
    syncSelectedIdToUrl(id);
  }

  function refreshWorkspace() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function refreshSelectedTicketDetail(ticketId: string) {
    await queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
  }

  const selectedTicket = detail?.ticket ?? null;
  const history = detail?.history ?? [];

  function validateFile(file: File) {
    const maxSize = 10 * 1024 * 1024;
    const allowed = file.type.startsWith('image/') || file.type.startsWith('video/') || file.type === 'application/pdf';
    if (!allowed) {
      return `Unsupported file type: ${file.name}`;
    }
    if (file.size > maxSize) {
      return `File too large (max 10MB): ${file.name}`;
    }
    return null;
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const nextValid: File[] = [];
    for (const file of files) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        continue;
      }
      nextValid.push(file);
    }
    setSelectedFiles(prev => [...prev, ...nextValid]);
    event.currentTarget.value = '';
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function submitMessage() {
    if (!selectedId || !message.trim()) return;
    if (isSendingMessage) return;
    setIsSendingMessage(true);
    try {
      if (selectedFiles.length === 0) {
        await addTicketMessageAction({ ticketId: selectedId, body: message.trim() });
      } else {
        const uploaded = await Promise.all(
          selectedFiles.map(async file => {
            const uploadPolicy = await createTicketAttachmentUploadUrlAction({
              ticketId: selectedId,
              fileName: file.name,
              contentType: file.type,
              fileSize: file.size,
            });
            await uploadFileWithPresignedPost(uploadPolicy, file);

            return {
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              s3Key: uploadPolicy.key,
              s3Bucket: typeof uploadPolicy.fields['bucket'] === 'string' ? uploadPolicy.fields['bucket'] : undefined,
            };
          })
        );

        await addTicketMessageWithAttachmentsAction({
          ticketId: selectedId,
          body: message.trim(),
          attachments: uploaded,
        });
      }
      setMessage('');
      setSelectedFiles([]);
      await refreshSelectedTicketDetail(selectedId);
      refreshWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function updateStatus(status: TicketListItem['status'], cancellationNote?: string) {
    if (!selectedId) return;
    try {
      await updateTicketStatusAction({ ticketId: selectedId, status, cancellationNote });
      await refreshSelectedTicketDetail(selectedId);
      refreshWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    }
  }

  async function claimSelectedTicket() {
    if (!selectedId || isClaiming) return;
    setIsClaiming(true);
    try {
      await claimTicketAction(selectedId);
      await refreshSelectedTicketDetail(selectedId);
      refreshWorkspace();
      toast.success('Ticket claimed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to claim ticket');
    } finally {
      setIsClaiming(false);
    }
  }

  const filteredItems = initialItems.filter(
    item =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const listTitleByView: Record<string, string> = {
    all: 'All Tickets',
    my: 'My Tickets',
    unassigned: 'Unassigned Tickets',
    closed: 'Closed Tickets',
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)] -mt-2">
      <TicketListPanel
        title={listTitleByView[initialView] ?? 'Tickets'}
        items={filteredItems}
        selectedId={selectedId}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSelectTicket={handleSelectTicket}
      />

      {selectedId && (
        <Card className="col-span-8 flex flex-col bg-card border-border/60 overflow-hidden rounded-xl shadow-xl">
          {selectedTicket ? (
            <div className="h-full flex flex-col overflow-hidden">
              <TicketDetailHeader
                ticket={selectedTicket}
                activeTab={activeTab}
                onBack={() => handleSelectTicket(null)}
                onUpdateStatus={updateStatus}
                onTabChange={setActiveTab}
                canClaim={Boolean(detail?.canClaim)}
                hasClaimRole={Boolean(detail?.hasClaimRole)}
                isClaimedByCurrentUser={Boolean(detail?.isClaimedByCurrentUser)}
                canEdit={Boolean(detail?.canEdit)}
                canUseMore={Boolean(detail?.canUseMore)}
                allowedStatusActions={detail?.allowedStatusActions ?? []}
                isClaiming={isClaiming}
                onClaimTicket={claimSelectedTicket}
              />

              <div className="flex-1 min-h-0 bg-muted/10 flex flex-col">
                <TicketTabContent
                  activeTab={activeTab}
                  ticket={selectedTicket}
                  history={history}
                  message={message}
                  selectedFiles={selectedFiles}
                  isSendingMessage={isSendingMessage}
                  isPending={isPending}
                  fileInputRef={fileInputRef}
                  onMessageChange={setMessage}
                  onPickFiles={onPickFiles}
                  onRemoveSelectedFile={removeSelectedFile}
                  onSubmitMessage={submitMessage}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center bg-muted/10">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className={`h-4 w-4 ${isDetailLoading ? 'animate-spin' : ''}`} />
                <span>{isDetailLoading ? 'Loading ticket details...' : 'Select a ticket to view details.'}</span>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
