'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Filter, ArrowUpDown } from 'lucide-react';
import { cn } from '@repo/shared';
import { badgeClass } from './ticket-dashboard-utils';
import type { TicketListItem } from './ticket-dashboard-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

type TicketListPanelProps = {
  title: string;
  items: TicketListItem[];
  selectedId: string | null;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSelectTicket: (ticketId: string) => void;
};

function formatTicketDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) {
    return timeStr;
  }
  
  const dateStrFormatted = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
  
  return `${dateStrFormatted}, ${timeStr}`;
}

export function TicketListPanel({
  title,
  items,
  selectedId,
  searchTerm,
  onSearchTermChange,
  onSelectTicket,
}: TicketListPanelProps) {
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [selectedPriorities, setSelectedPriorities] = useState<('LOW' | 'MEDIUM' | 'HIGH')[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const filteredAndSortedItems = [...items]
    .filter(item => {
      if (selectedPriorities.length === 0) return true;
      return selectedPriorities.includes(item.priority);
    })
    .sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

  return (
    <>
      <Card className="col-span-4 flex flex-col bg-card border-border/60 overflow-hidden rounded-xl shadow-xl">
        <div className="p-4 border-b border-border/60 flex items-center justify-between bg-card/50 backdrop-blur-sm">
          <h2 className="text-lg font-bold text-foreground tracking-wide">{title}</h2>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFilterOpen(true)}
              className={cn(
                'h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent',
                selectedPriorities.length > 0 && 'text-purple-500 bg-purple-500/10 hover:text-purple-400 hover:bg-purple-500/20'
              )}
              title="Filter by priority"
            >
              <Filter className="w-4 h-4" />
            </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
            className={cn(
              'h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent',
              sortOrder === 'asc' && 'text-purple-500 bg-purple-500/10 hover:text-purple-400 hover:bg-purple-500/20'
            )}
            title={sortOrder === 'desc' ? 'Sorted by: Newest first' : 'Sorted by: Oldest first'}
          >
            <ArrowUpDown className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-3 border-b border-border/40 bg-card">
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={e => onSearchTermChange(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2.5">
          {filteredAndSortedItems.map(item => {
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTicket(item.id)}
                className={cn(
                  'w-full text-left rounded-xl border p-3.5 transition-all duration-200 relative overflow-hidden group',
                  isSelected
                    ? 'border-purple-500 bg-purple-500/5 shadow-[0_0_15px_rgba(168,85,247,0.05)]'
                    : 'border-border/60 bg-transparent hover:border-purple-500/40 hover:bg-accent/20'
                )}
              >
                {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500" />}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground tracking-wider group-hover:text-muted-foreground/80 transition-colors">
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

                <p className="font-semibold text-sm text-foreground mt-2 tracking-wide leading-snug group-hover:text-foreground/90 transition-colors">
                  {item.title}
                </p>

                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                  <span className="text-muted-foreground/60">Client:</span> {item.clientName}
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
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {formatTicketDate(item.createdAt)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </Card>

    <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
      <DialogContent className="sm:max-w-[350px] bg-card border-border/60 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-wide">Filter by Priority</DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="flex flex-col gap-3">
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map(priority => {
              const isChecked = selectedPriorities.includes(priority);
              return (
                <label
                  key={priority}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/5 hover:bg-accent/20 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={`priority-filter-${priority}`}
                      checked={isChecked}
                      onCheckedChange={checked => {
                        if (checked) {
                          setSelectedPriorities(prev => [...prev, priority]);
                        } else {
                          setSelectedPriorities(prev => prev.filter(p => p !== priority));
                        }
                      }}
                    />
                    <span className="text-sm font-medium">
                      {priority.charAt(0) + priority.slice(1).toLowerCase()} Priority
                    </span>
                  </div>
                  
                  <span
                    className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase',
                      priority === 'HIGH'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : priority === 'MEDIUM'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    )}
                  >
                    {priority}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        
        <div className="flex justify-between gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedPriorities([])}
            disabled={selectedPriorities.length === 0}
            className="text-xs"
          >
            Clear Filters
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setIsFilterOpen(false)}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-4"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
