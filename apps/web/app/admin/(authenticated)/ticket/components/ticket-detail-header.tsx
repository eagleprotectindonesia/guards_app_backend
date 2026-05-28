import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Pencil, MoreHorizontal } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@repo/shared';
import { badgeClass, formatDate } from './ticket-dashboard-utils';
import type { TicketDetail, TicketListItem } from './ticket-dashboard-types';

type TicketDetailHeaderProps = {
  ticket: TicketDetail;
  activeTab: 'details' | 'discussion' | 'attachments' | 'history';
  onBack: () => void;
  onUpdateStatus: (status: TicketListItem['status']) => void;
  onTabChange: (tab: 'details' | 'discussion' | 'attachments' | 'history') => void;
};

const STATUS_ACTIONS: Array<{ label: string; status: TicketListItem['status'] }> = [
  { label: 'Acknowledge', status: 'ACKNOWLEDGED' },
  { label: 'Waiting Information', status: 'WAITING_INFORMATION' },
  { label: 'In Progress', status: 'IN_PROGRESS' },
  { label: 'Mark Solved', status: 'SOLVED' },
  { label: 'Cannot Resolve', status: 'CANNOT_RESOLVE' },
  { label: 'Close / Cancel', status: 'CLOSED' },
];

export function TicketDetailHeader({ ticket, activeTab, onBack, onUpdateStatus, onTabChange }: TicketDetailHeaderProps) {
  return (
    <>
      <div className="p-5 border-b border-[#1F222F]/60 bg-[#12141C]">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-[#5B3BF5] hover:bg-[#4d32cf] text-white border-transparent flex items-center gap-1.5 px-3.5 h-9 font-semibold text-xs rounded-lg transition-colors"
              onClick={() => toast.success('Edit ticket details functionality is available.')}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Ticket
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#1F222F] bg-transparent text-white hover:bg-zinc-800/50 h-9 px-3.5 text-xs rounded-lg flex items-center gap-1 font-semibold"
                >
                  <MoreHorizontal className="w-4 h-4" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#12141C] border-[#1F222F] text-zinc-200">
                {STATUS_ACTIONS.map(action => (
                  <DropdownMenuItem
                    key={action.status}
                    onClick={() => onUpdateStatus(action.status)}
                    className="hover:bg-purple-500/10 hover:text-white focus:bg-purple-500/10 focus:text-white cursor-pointer"
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-white tracking-wide">{ticket.code}</h1>
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
        </div>
        <p className="text-zinc-400 text-sm mt-2 font-medium tracking-wide">{ticket.title}</p>
      </div>

      <div className="p-5 bg-[#0B0C10]/40 border-b border-[#1F222F]/40">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#151821] border border-[#1F222F]/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Created By</span>
            <span className="text-sm font-semibold text-zinc-200 block truncate">{ticket.submitterAdmin?.name || 'System'}</span>
          </div>

          <div className="bg-[#151821] border border-[#1F222F]/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Created Date</span>
            <span className="text-sm font-semibold text-zinc-200 block truncate">{formatDate(ticket.createdAt)}</span>
          </div>

          <div className="bg-[#151821] border border-[#1F222F]/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Client Name</span>
            <span className="text-sm font-semibold text-zinc-200 block truncate">{ticket.clientName || '-'}</span>
          </div>

          <div className="bg-[#151821] border border-[#1F222F]/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Client Location</span>
            <span className="text-sm font-semibold text-zinc-200 block truncate" title={ticket.clientLocation}>
              {ticket.clientLocation || '-'}
            </span>
          </div>

          <div className="bg-[#151821] border border-[#1F222F]/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Department</span>
            <span className="text-sm font-semibold text-zinc-200 block truncate">{ticket.departmentRole?.name || '-'}</span>
          </div>

          <div className="bg-[#151821] border border-[#1F222F]/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Assigned To</span>
            <span className="text-sm font-semibold text-zinc-200 block truncate" title={ticket.assignedRoles?.map(r => r.role.name).join(', ')}>
              {ticket.assignedRoles?.map(r => r.role.name).join(', ') || '-'}
            </span>
          </div>

          <div className="bg-[#151821] border border-[#1F222F]/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Client Contact</span>
            <span className="text-sm font-semibold text-zinc-200 block truncate">{ticket.clientContact || '-'}</span>
          </div>

          <div className="bg-[#151821] border border-[#1F222F]/45 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Status</span>
            <span className="text-sm font-semibold text-zinc-200 block truncate">{ticket.status.replace('_', ' ')}</span>
          </div>
        </div>
      </div>

      <div className="px-5 border-b border-[#1F222F]/60 flex items-center bg-[#12141C] shrink-0">
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
                  isActive ? 'border-purple-500 text-purple-400 font-extrabold' : 'border-transparent text-zinc-400 hover:text-zinc-200'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
