'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { addTicketMessageAction, getTicketDetailAction, updateTicketStatusAction } from '../actions';
import { toast } from 'react-hot-toast';

type TicketListItem = {
  id: string;
  code: string;
  title: string;
  clientName: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'NEW' | 'ACKNOWLEDGED' | 'WAITING_INFORMATION' | 'IN_PROGRESS' | 'SOLVED' | 'CLOSED' | 'CANNOT_RESOLVE';
  createdAt: string;
};

type TicketMessage = {
  id: string;
  body: string;
  admin?: { name?: string | null } | null;
};

type TicketDetail = {
  id: string;
  code: string;
  title: string;
  description: string;
  clientName: string;
  clientContact: string;
  clientLocation: string;
  status: TicketListItem['status'];
  messages: TicketMessage[];
};

type TicketHistoryItem = {
  id: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  actor?: { name?: string | null } | null;
};

type TicketDetailResult = {
  ticket: TicketDetail;
  history: TicketHistoryItem[];
};

type Props = {
  initialView: string;
  initialSearch: string;
  requestedTicketId?: string;
  initialItems: TicketListItem[];
  initialHasMore: boolean;
};

const STATUS_ACTIONS: Array<{ label: string; status: TicketListItem['status'] }> = [
  { label: 'Acknowledge', status: 'ACKNOWLEDGED' },
  { label: 'Waiting Information', status: 'WAITING_INFORMATION' },
  { label: 'In Progress', status: 'IN_PROGRESS' },
  { label: 'Mark Solved', status: 'SOLVED' },
  { label: 'Cannot Resolve', status: 'CANNOT_RESOLVE' },
  { label: 'Close / Cancel', status: 'CLOSED' },
];

function badgeClass(status: string) {
  if (status === 'NEW') return 'bg-blue-500/20 text-blue-300';
  if (status === 'IN_PROGRESS') return 'bg-amber-500/20 text-amber-300';
  if (status === 'WAITING_INFORMATION') return 'bg-purple-500/20 text-purple-300';
  if (status === 'SOLVED') return 'bg-emerald-500/20 text-emerald-300';
  if (status === 'CLOSED') return 'bg-slate-500/30 text-slate-200';
  if (status === 'CANNOT_RESOLVE') return 'bg-rose-500/20 text-rose-300';
  return 'bg-cyan-500/20 text-cyan-300';
}

export function TicketDashboardView({ initialItems, requestedTicketId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(requestedTicketId ?? initialItems[0]?.id ?? null);
  const [detail, setDetail] = useState<TicketDetailResult | null>(null);
  const [message, setMessage] = useState('');

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

  const selectedTicket = detail?.ticket?.id === selectedId ? detail.ticket : null;
  const history = detail?.history ?? [];

  async function submitMessage() {
    if (!selectedId || !message.trim()) return;
    try {
      await addTicketMessageAction({ ticketId: selectedId, body: message.trim() });
      setMessage('');
      const next = await getTicketDetailAction(selectedId);
      setDetail(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
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

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-180px)]">
      <Card className="col-span-4 p-3 bg-card/80 border-border/50">
        <h2 className="text-lg font-semibold mb-3">All Tickets</h2>
        <ScrollArea className="h-[calc(100vh-260px)] pr-2">
          <div className="space-y-2">
            {initialItems.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left rounded-lg border p-3 transition ${
                  selectedId === item.id ? 'border-purple-500 bg-purple-500/10' : 'border-border hover:bg-accent/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{item.code}</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${badgeClass(item.priority)}`}>{item.priority}</span>
                </div>
                <p className="font-medium mt-1">{item.title}</p>
                <p className="text-sm text-muted-foreground mt-1">Client: {item.clientName}</p>
                <div className="mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${badgeClass(item.status)}`}>{item.status}</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      <Card className="col-span-8 p-4 bg-card/80 border-border/50">
        {!selectedTicket ? (
          <div className="h-full grid place-items-center text-muted-foreground">Select a ticket to view details.</div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold">{selectedTicket.code}</h2>
                <p className="text-muted-foreground mt-1">{selectedTicket.title}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">More</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {STATUS_ACTIONS.map(action => (
                    <DropdownMenuItem key={action.status} onClick={() => updateStatus(action.status)}>
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <Card className="p-3 bg-background/50 border-border/50">
                <p className="text-xs text-muted-foreground">Client Name</p>
                <p className="font-medium">{selectedTicket.clientName}</p>
              </Card>
              <Card className="p-3 bg-background/50 border-border/50">
                <p className="text-xs text-muted-foreground">Client Contact</p>
                <p className="font-medium">{selectedTicket.clientContact}</p>
              </Card>
              <Card className="p-3 bg-background/50 border-border/50">
                <p className="text-xs text-muted-foreground">Client Location</p>
                <p className="font-medium">{selectedTicket.clientLocation}</p>
              </Card>
              <Card className="p-3 bg-background/50 border-border/50">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="font-medium">{selectedTicket.status}</p>
              </Card>
            </div>

            <Card className="mt-4 p-3 bg-background/50 border-border/50">
              <p className="text-sm font-medium mb-2">Description</p>
              <p className="text-sm text-muted-foreground">{selectedTicket.description}</p>
            </Card>

            <div className="grid grid-cols-2 gap-3 mt-4 min-h-0 flex-1">
              <Card className="p-3 bg-background/50 border-border/50 min-h-0">
                <p className="text-sm font-medium mb-2">Discussion</p>
                <ScrollArea className="h-56">
                  <div className="space-y-2">
                    {selectedTicket.messages.map((msg: TicketMessage) => (
                      <div key={msg.id} className="rounded border border-border/60 p-2">
                        <p className="text-sm font-medium">{msg.admin?.name ?? 'Admin'}</p>
                        <p className="text-sm text-muted-foreground mt-1">{msg.body}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Type your message..."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                  />
                  <Button onClick={submitMessage} disabled={isPending}>
                    Send
                  </Button>
                </div>
              </Card>

              <Card className="p-3 bg-background/50 border-border/50 min-h-0">
                <p className="text-sm font-medium mb-2">History</p>
                <ScrollArea className="h-[320px]">
                  <div className="space-y-2">
                    {history.map((item: TicketHistoryItem) => (
                      <div key={item.id} className="rounded border border-border/60 p-2">
                        <p className="text-sm">
                          <span className="font-medium">{item.actor?.name ?? 'System'}</span> {item.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.fromValue ? `${item.fromValue} -> ${item.toValue}` : item.toValue ?? '-'}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
