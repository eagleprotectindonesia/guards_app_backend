import { type ChangeEvent, type RefObject } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { RichTextViewer } from '@/components/ui/rich-text-viewer';
import { cn } from '@repo/shared';
import { Paperclip, Send, Download, FileText, Clock, X } from 'lucide-react';
import {
  formatDate,
  formatFileSize,
  getInitialsColor,
  isImageMimeType,
  isVideoMimeType,
} from './ticket-dashboard-utils';
import type { TicketDetail, TicketHistoryItem } from './ticket-dashboard-types';

type TicketTabContentProps = {
  activeTab: 'details' | 'discussion' | 'attachments' | 'history';
  ticket: TicketDetail;
  history: TicketHistoryItem[];
  message: string;
  selectedFiles: File[];
  isSendingMessage: boolean;
  isPending: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onMessageChange: (value: string) => void;
  onPickFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveSelectedFile: (index: number) => void;
  onSubmitMessage: () => void;
};

export function TicketTabContent({
  activeTab,
  ticket,
  history,
  message,
  selectedFiles,
  isSendingMessage,
  isPending,
  fileInputRef,
  onMessageChange,
  onPickFiles,
  onRemoveSelectedFile,
  onSubmitMessage,
}: TicketTabContentProps) {
  if (activeTab === 'details') {
    return (
      <ScrollArea className="flex-1 min-h-0 p-5">
        <div className="space-y-4 max-w-3xl">
          <div className="bg-muted/20 border border-border/40 p-5 rounded-xl">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2.5">Description</h3>
            <RichTextViewer html={ticket.description} className="text-sm" fallback="No description provided." />
          </div>
        </div>
      </ScrollArea>
    );
  }

  if (activeTab === 'discussion') {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 min-h-0 p-5">
          <div className="space-y-6 pb-40">
            {ticket.messages.map(msg => {
              const initials = msg.admin?.name
                ? msg.admin.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : 'SA';
              const avatarColorClass = getInitialsColor(msg.admin?.name || 'Admin');

              return (
                <div key={msg.id} className="flex items-start gap-3.5 group">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 select-none',
                      avatarColorClass
                    )}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-xs font-bold text-foreground">{msg.admin?.name ?? 'Admin'}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(msg.createdAt)}</span>
                    </div>
                    <div className="bg-muted/10 border border-border/40 p-3.5 rounded-r-xl rounded-bl-xl text-sm text-foreground leading-relaxed max-w-2xl whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-200">
                      {msg.body}
                    </div>

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2.5 space-y-2">
                        {msg.attachments.map(att => (
                          <div key={att.id} className="w-80 space-y-2">
                            {att.publicUrl && isImageMimeType(att.mimeType) && (
                              <img
                                src={att.publicUrl}
                                alt={att.fileName}
                                className="w-full max-h-52 object-cover rounded-xl border border-border bg-background"
                              />
                            )}
                            {att.publicUrl && isVideoMimeType(att.mimeType) && (
                              <video
                                src={att.publicUrl}
                                controls
                                className="w-full max-h-52 rounded-xl border border-border bg-background"
                              />
                            )}
                            <div className="flex items-center justify-between bg-muted/10 border border-border rounded-xl p-3 hover:border-purple-500/40 transition-colors">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-foreground truncate w-44" title={att.fileName}>
                                    {att.fileName}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">{formatFileSize(att.fileSize)}</p>
                                </div>
                              </div>
                              {att.publicUrl && (
                                <a
                                  href={att.publicUrl}
                                  download
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="sticky bottom-0 z-10 p-4 border-t border-border/60 bg-card">
          <div className="max-w-5xl mx-auto space-y-2.5">
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <span className="max-w-[220px] truncate" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveSelectedFile(index)}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2.5">
              <div className="flex-1 relative flex items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,application/pdf"
                  className="hidden"
                  onChange={onPickFiles}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 text-muted-foreground hover:text-foreground hover:bg-accent h-8 w-8 rounded-lg"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <input
                  className="w-full rounded-xl border border-border bg-background pl-11 pr-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="Type your message..."
                  value={message}
                  onChange={e => onMessageChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      onSubmitMessage();
                    }
                  }}
                />
              </div>
              <Button
                onClick={onSubmitMessage}
                disabled={isPending || isSendingMessage || !message.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white h-10 w-10 p-0 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/10 transition-all active:scale-95 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'attachments') {
    return (
      <ScrollArea className="flex-1 min-h-0 p-5">
        {ticket.attachments && ticket.attachments.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {ticket.attachments.map(att => (
              <div
                key={att.id}
                className="flex items-center justify-between bg-muted/25 border border-border/40 rounded-xl p-3.5 hover:border-purple-500/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate w-40" title={att.fileName}>
                      {att.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(att.fileSize)}</p>
                  </div>
                </div>
                {att.publicUrl && (
                  <a
                    href={att.publicUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
            <FileText className="w-8 h-8 text-muted-foreground/60 mb-2" />
            <p className="text-xs">No attachments uploaded for this ticket yet.</p>
          </div>
        )}
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0 p-5">
      <div className="space-y-4">
        {history.map(item => (
          <div key={item.id} className="bg-muted/20 border border-border/40 p-4 rounded-xl flex gap-3">
            <div className="p-2 rounded-lg bg-muted/40 text-muted-foreground h-9 w-9 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">
                  <span className="text-purple-500">{item.actor?.name ?? 'System'}</span>{' '}
                  {item.action.replace('_', ' ')}
                </p>
                <span className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</span>
              </div>
              {(item.fromValue || item.toValue) && (
                <p className="text-xs text-muted-foreground mt-1.5 bg-muted/30 px-2.5 py-1.5 rounded-lg border border-border/20 font-mono inline-block">
                  {item.fromValue ? `${item.fromValue} ➔ ${item.toValue}` : (item.toValue ?? '-')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
