'use client';

import { type ChangeEvent, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { toast } from 'react-hot-toast';
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
};

export function TicketDashboardView({ initialView, initialItems, requestedTicketId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(requestedTicketId ?? initialItems[0]?.id ?? null);
  const [detail, setDetail] = useState<TicketDetailResult | null>(null);
  const [message, setMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'discussion' | 'attachments' | 'history'>('discussion');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    startTransition(() => {
      void getTicketDetailAction(selectedId)
        .then(result => {
          if (!cancelled) setDetail(result);
        })
        .catch(() => {
          if (!cancelled) setDetail(null);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(null);
    setDetail(null);
  }, [initialView]);

  const selectedTicket = detail?.ticket?.id === selectedId ? detail.ticket : null;
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
      const next = await getTicketDetailAction(selectedId);
      setDetail(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function updateStatus(status: TicketListItem['status']) {
    if (!selectedId) return;
    try {
      await updateTicketStatusAction({ ticketId: selectedId, status });
      const next = await getTicketDetailAction(selectedId);
      setDetail(next);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    }
  }

  async function claimSelectedTicket() {
    if (!selectedId || isClaiming) return;
    setIsClaiming(true);
    try {
      await claimTicketAction(selectedId);
      const next = await getTicketDetailAction(selectedId);
      setDetail(next);
      router.refresh();
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
        onSelectTicket={setSelectedId}
      />

      {selectedTicket && (
        <Card className="col-span-8 flex flex-col bg-[#12141C] border-[#1F222F]/60 overflow-hidden rounded-xl shadow-xl">
          <div className="h-full flex flex-col overflow-hidden">
            <TicketDetailHeader
              ticket={selectedTicket}
              activeTab={activeTab}
              onBack={() => setSelectedId(null)}
              onUpdateStatus={updateStatus}
              onTabChange={setActiveTab}
              canClaim={Boolean(detail?.canClaim)}
              isClaimedByCurrentUser={Boolean(detail?.isClaimedByCurrentUser)}
              canEdit={Boolean(detail?.canEdit)}
              canUseMore={Boolean(detail?.canUseMore)}
              allowedStatusActions={detail?.allowedStatusActions ?? []}
              isClaiming={isClaiming}
              onClaimTicket={claimSelectedTicket}
            />

            <div className="flex-1 min-h-0 bg-[#0B0C10]/20 flex flex-col">
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
        </Card>
      )}
    </div>
  );
}
