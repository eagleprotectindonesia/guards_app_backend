'use client';

import { useState } from 'react';
import { ApiKey } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Key, 
  Trash2, 
  Power, 
  PowerOff, 
  Copy, 
  Check, 
  ExternalLink,
  ShieldAlert,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { createApiKey, deleteApiKey, toggleApiKeyStatus } from '../actions';

type Props = {
  initialData: Serialized<ApiKey>[];
};

export default function ApiKeyList({ initialData }: Props) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRevealModalOpen, setIsRevealModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }

    setIsPending(true);
    try {
      const result = await createApiKey(newKeyName);
      setRevealedKey(result.rawKey);
      setNewKeyName('');
      setIsCreateModalOpen(false);
      setIsRevealModalOpen(true);
      toast.success('API Key created successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create API key');
    } finally {
      setIsPending(false);
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await toggleApiKeyStatus(id, currentStatus);
      toast.success(`API Key ${currentStatus ? 'disabled' : 'enabled'} successfully`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key? This cannot be undone.')) {
      return;
    }

    try {
      await deleteApiKey(id);
      toast.success('API Key deleted successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setIsCreateModalOpen(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 shadow-lg shadow-red-500/20">
          <Key className="w-4 h-4 mr-2" />
          Generate New Key
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[300px]">Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No API keys found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              initialData.map((key) => (
                <TableRow key={key.id} className="group transition-colors hover:bg-muted/20">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${key.status ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        <Key className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-foreground font-bold">{key.name}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                          Hashed: {key.key.substring(0, 16)}...
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {key.status ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border">
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                      <Calendar className="w-3.5 h-3.5" />
                      {format(new Date(key.createdAt), 'PPP')}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm italic">
                    {key.lastUsedAt ? format(new Date(key.lastUsedAt), 'PPP p') : 'Never used'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleToggle(key.id, key.status)}
                        title={key.status ? 'Deactivate' : 'Activate'}
                        className={key.status ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20'}
                      >
                        {key.status ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(key.id)}
                        title="Delete"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-8 p-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl space-y-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-600 mt-1 shrink-0" />
          <div className="space-y-1">
            <h4 className="font-bold text-red-900 dark:text-red-400">API Documentation Access</h4>
            <p className="text-sm text-red-800 dark:text-red-300">
              The external API documentation is interactive and allows testing endpoints with these keys.
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          asChild
          className="bg-white hover:bg-red-50 dark:bg-background border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 font-bold"
        >
          <a href="/api/external/docs" target="_blank" rel="noopener noreferrer" className="flex items-center">
            <ExternalLink className="w-4 h-4 mr-2" />
            Open API Documentation
          </a>
        </Button>
      </div>

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Generate API Key</DialogTitle>
            <DialogDescription>
              Enter a descriptive name for this key to track its usage.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Key Name
              </Label>
              <input
                id="name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Mobile App Client"
                className="w-full h-11 px-4 bg-muted border border-border rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleCreate} 
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-6"
            >
              {isPending ? 'Generating...' : 'Generate Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal Modal */}
      <Dialog open={isRevealModalOpen} onOpenChange={setIsRevealModalOpen}>
        <DialogContent className="sm:max-w-[500px] border-amber-500/50 dark:border-amber-900/50">
          <DialogHeader className="bg-amber-50 dark:bg-amber-900/20 -mx-6 -mt-6 p-6 border-b border-amber-100 dark:border-amber-900/30 rounded-t-lg">
            <DialogTitle className="text-amber-800 dark:text-amber-400 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              API Key Generated Successfully
            </DialogTitle>
            <DialogDescription className="text-amber-700 dark:text-amber-500/80">
              Copy this key now. For security reasons, <strong>it will not be shown again.</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Your Secret API Key
              </Label>
              <div className="relative group">
                <div className="w-full h-14 pl-4 pr-14 flex items-center bg-muted border-2 border-amber-200 dark:border-amber-900/40 rounded-xl font-mono text-sm break-all overflow-hidden">
                  {revealedKey}
                </div>
                <Button
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/20"
                  onClick={() => copyToClipboard(revealedKey)}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-muted p-3 rounded-lg border border-border italic">
              Use this key in the <code className="font-bold">X-API-KEY</code> header of your requests.
            </p>
          </div>
          <DialogFooter>
            <Button 
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold" 
              onClick={() => setIsRevealModalOpen(false)}
            >
              I have saved the key securely
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
