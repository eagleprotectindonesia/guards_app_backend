import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Filter, ArrowUpDown } from 'lucide-react';
import { cn } from '@repo/shared';
import { badgeClass } from './ticket-dashboard-utils';
import type { TicketListItem } from './ticket-dashboard-types';

type TicketListPanelProps = {
  items: TicketListItem[];
  selectedId: string | null;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSelectTicket: (ticketId: string) => void;
};

export function TicketListPanel({ items, selectedId, searchTerm, onSearchTermChange, onSelectTicket }: TicketListPanelProps) {
  return (
    <Card className="col-span-4 flex flex-col bg-[#12141C] border-[#1F222F]/60 overflow-hidden rounded-xl shadow-xl">
      <div className="p-4 border-b border-[#1F222F]/60 flex items-center justify-between bg-[#12141C]/50 backdrop-blur-sm">
        <h2 className="text-lg font-bold text-white tracking-wide">All Tickets</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-zinc-800/50">
            <Filter className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-zinc-800/50">
            <ArrowUpDown className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-3 border-b border-[#1F222F]/40 bg-[#12141C]">
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full rounded-lg border border-[#1F222F] bg-[#0B0C10] pl-10 pr-4 py-2 text-sm text-white placeholder-muted-foreground focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={e => onSearchTermChange(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2.5">
          {items.map(item => {
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTicket(item.id)}
                className={cn(
                  'w-full text-left rounded-xl border p-3.5 transition-all duration-200 relative overflow-hidden group',
                  isSelected
                    ? 'border-purple-500 bg-purple-500/5 shadow-[0_0_15px_rgba(168,85,247,0.05)]'
                    : 'border-[#1F222F]/60 bg-transparent hover:border-purple-500/40 hover:bg-white/[0.01]'
                )}
              >
                {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500" />}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-500 tracking-wider group-hover:text-zinc-400 transition-colors">
                    {item.code}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase',
                      item.priority === 'HIGH'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : item.priority === 'MEDIUM'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    )}
                  >
                    {item.priority}
                  </span>
                </div>

                <p className="font-semibold text-sm text-zinc-100 mt-2 tracking-wide leading-snug group-hover:text-white transition-colors">
                  {item.title}
                </p>

                <p className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1.5">
                  <span className="text-zinc-600">Client:</span> {item.clientName}
                </p>

                <div className="mt-3 flex items-center justify-between">
                  <span
                    className={cn(
                      'text-[10px] font-bold px-2.5 py-0.5 rounded-md tracking-wider uppercase border',
                      badgeClass(item.status)
                    )}
                  >
                    {item.status.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-zinc-500 tabular-nums">
                    {new Date(item.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
