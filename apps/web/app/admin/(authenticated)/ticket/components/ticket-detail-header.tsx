import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { X, MoreHorizontal, Clock } from 'lucide-react';
import { cn } from '@repo/shared';
import { badgeClass, formatDate } from './ticket-dashboard-utils';
import type { TicketDetail, TicketListItem } from './ticket-dashboard-types';

type TicketDetailHeaderProps = {
  ticket: TicketDetail;
  activeTab: 'details' | 'discussion' | 'attachments' | 'history';
  onBack: () => void;
  onUpdateStatus: (status: TicketListItem['status'], cancellationNote?: string) => void;
  onTabChange: (tab: 'details' | 'discussion' | 'attachments' | 'history') => void;
  canClaim: boolean;
  hasClaimRole: boolean;
  isClaimedByCurrentUser: boolean;
  canEdit: boolean;
  canUseMore: boolean;
  allowedStatusActions: TicketListItem['status'][];
  isClaiming: boolean;
  onClaimTicket: () => void;
};

function statusActionLabel(status: TicketListItem['status']) {
  if (status === 'WAITING_INFORMATION') return 'Waiting Information';
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'SOLVED') return 'Mark Solved';
  if (status === 'CANNOT_RESOLVE') return 'Cannot Resolve';
  if (status === 'CLOSED') return 'Close Ticket';
  if (status === 'CANCELLED') return 'Cancel Ticket';
  if (status === 'ACKNOWLEDGED') return 'Acknowledge';
  return status.replace('_', ' ');
}

function formatResolutionDeadline(createdAt: string | Date, resolutionTargetHours: number) {
  const createdAtDate = new Date(createdAt);
  const deadline = new Date(createdAtDate.getTime() + resolutionTargetHours * 60 * 60 * 1000);
  return formatDate(deadline);
}

export function TicketDetailHeader({
  ticket,
  activeTab,
  onBack,
  onUpdateStatus,
  onTabChange,
  canClaim,
  hasClaimRole,
  isClaimedByCurrentUser,
  canUseMore,
  allowedStatusActions,
  isClaiming,
  onClaimTicket,
}: TicketDetailHeaderProps) {
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState('');

  const policy = ticket.departmentRole?.policy;
  let departmentName = ticket.departmentRole?.name || '-';
  if (policy && typeof policy === 'object' && !Array.isArray(policy)) {
    const ticketDept = (policy as Record<string, unknown>).ticketDepartment;
    if (typeof ticketDept === 'string' && ticketDept.trim().length > 0) {
      departmentName = ticketDept;
    }
  }

  return (
    <>
      <div className="p-5 border-b border-border/60 bg-card">
        <div className="flex items-center justify-between mb-3">
          <div />

          <div className="flex items-center gap-2">
            {(hasClaimRole || isClaimedByCurrentUser) && (
              <Button
                variant="outline"
                size="sm"
                className="border-border bg-transparent text-foreground hover:bg-accent h-9 px-3.5 text-xs rounded-lg font-semibold"
                disabled={!canClaim || isClaiming || isClaimedByCurrentUser}
                onClick={onClaimTicket}
              >
                {isClaiming
                  ? 'Claiming...'
                  : isClaimedByCurrentUser
                    ? 'Claimed By You'
                    : (ticket.assignedAdmin?.id || ticket.assignedEmployee?.id)
                      ? 'Re-claim Ticket'
                      : 'Claim Ticket'}
              </Button>
            )}
            {/* {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white border-transparent flex items-center gap-1.5 px-3.5 h-9 font-semibold text-xs rounded-lg transition-colors"
                onClick={() => toast.success('Edit ticket details functionality is available.')}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Ticket
              </Button>
            )} */}

            {['CLOSED', 'CANCELLED'].includes(ticket.status) ? (
              allowedStatusActions.includes('ACKNOWLEDGED') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border bg-transparent text-foreground hover:bg-accent h-9 px-3.5 text-xs rounded-lg font-semibold"
                  onClick={() => onUpdateStatus('ACKNOWLEDGED')}
                >
                  Reopen Ticket
                </Button>
              )
            ) : (
              canUseMore && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border bg-transparent text-foreground hover:bg-accent h-9 px-3.5 text-xs rounded-lg flex items-center gap-1 font-semibold"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border text-foreground">
                    {allowedStatusActions.map(status => (
                      <DropdownMenuItem
                        key={status}
                        onClick={() => {
                          if (status === 'CANCELLED') {
                            setIsCancelDialogOpen(true);
                          } else {
                            onUpdateStatus(status);
                          }
                        }}
                        className="hover:bg-purple-500/10 hover:text-foreground focus:bg-purple-500/10 focus:text-foreground cursor-pointer"
                      >
                        {statusActionLabel(status)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-border bg-transparent text-foreground hover:bg-accent h-9 w-9 p-0 rounded-lg"
              onClick={onBack}
              aria-label="Close detail"
              title="Close detail"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground tracking-wide">{ticket.code}</h1>
          <span
            className={cn(
              'text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider',
              ticket.priority === 'HIGH'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                : ticket.priority === 'MEDIUM'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            )}
          >
            {ticket.priority}
          </span>
          <span
            className={cn(
              'text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider',
              badgeClass(ticket.status)
            )}
          >
            {ticket.status.replace('_', ' ')}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <Clock className="h-3.5 w-3.5" />
            Due {formatResolutionDeadline(ticket.createdAt, ticket.resolutionTargetHours)}
          </span>
        </div>
        <p className="text-muted-foreground text-sm mt-2 font-medium tracking-wide">{ticket.title}</p>
      </div>

      <div className="p-5 bg-muted/30 border-b border-border/40">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/20 border border-border/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Created By
            </span>
            <span className="text-sm font-semibold text-foreground block truncate">
              {ticket.submitterAdmin?.name || 'System'}
            </span>
          </div>

          <div className="bg-muted/20 border border-border/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Created Date
            </span>
            <span className="text-sm font-semibold text-foreground block truncate">{formatDate(ticket.createdAt)}</span>
          </div>

          <div className="bg-muted/20 border border-border/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Client Name
            </span>
            <span className="text-sm font-semibold text-foreground block truncate">{ticket.clientName || '-'}</span>
          </div>

          <div className="bg-muted/20 border border-border/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Client Location
            </span>
            <span className="text-sm font-semibold text-foreground block truncate" title={ticket.clientLocation}>
              {ticket.clientLocation || '-'}
            </span>
          </div>

          <div className="bg-muted/20 border border-border/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Department
            </span>
            <span className="text-sm font-semibold text-foreground block truncate">{departmentName}</span>
          </div>

          <div className="bg-muted/20 border border-border/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Assigned To
            </span>
            <span className="text-sm font-semibold text-foreground block truncate">
              {ticket.assignedAdmin?.name || ticket.assignedEmployee?.fullName || '-'}
            </span>
          </div>

          <div className="bg-muted/20 border border-border/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Client Contact
            </span>
            <span className="text-sm font-semibold text-foreground block truncate">{ticket.clientContact || '-'}</span>
          </div>

          <div className="bg-muted/20 border border-border/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Status
            </span>
            <span className="text-sm font-semibold text-foreground block truncate">
              {ticket.status.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 border-b border-border/60 flex items-center bg-card shrink-0">
        <div className="flex gap-6">
          {(['details', 'discussion', 'attachments', 'history'] as const).map(tabKey => {
            const isActive = activeTab === tabKey;
            let label = tabKey.charAt(0).toUpperCase() + tabKey.slice(1);
            if (tabKey === 'attachments') {
              const count = ticket.attachments?.length || 0;
              label = `Attachments (${count})`;
            }
            return (
              <button
                key={tabKey}
                onClick={() => onTabChange(tabKey)}
                className={cn(
                  'py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all relative',
                  isActive
                    ? 'border-purple-500 text-purple-500 font-extrabold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Cancel Ticket</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label htmlFor="cancel-note" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Reason for Cancellation <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="cancel-note"
              value={cancelNote}
              onChange={e => setCancelNote(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none placeholder:text-muted-foreground text-sm"
              placeholder="Please provide a reason for cancelling this ticket..."
              required
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsCancelDialogOpen(false);
                setCancelNote('');
              }}
              className="border-border bg-transparent text-foreground hover:bg-accent text-xs font-semibold rounded-lg h-9"
            >
              Cancel
            </Button>
            <Button
              disabled={!cancelNote.trim()}
              onClick={() => {
                onUpdateStatus('CANCELLED', cancelNote);
                setIsCancelDialogOpen(false);
                setCancelNote('');
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg h-9"
            >
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
