'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createTicketAction, createTicketAttachmentUploadUrlAction, attachUploadedFilesToTicketAction } from '../actions';
import { toast } from 'react-hot-toast';
import { uploadFileWithPresignedPost } from '@/lib/s3-presigned-post-upload';

type RoleOption = { id: string; name: string };

type Props = {
  adminName: string;
  roleOptions: RoleOption[];
};

export function TicketCreateForm({ adminName, roleOptions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentRoleId, setDepartmentRoleId] = useState(roleOptions[0]?.id ?? '');
  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientLocation, setClientLocation] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [files, setFiles] = useState<File[]>([]);

  async function uploadFile(file: File, ticketId: string) {
    const policy = await createTicketAttachmentUploadUrlAction({
      ticketId,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    });
    await uploadFileWithPresignedPost(policy, file);

    return {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      s3Key: policy.key,
      s3Bucket: policy.fields.bucket,
    };
  }

  function submit() {
    startTransition(() => {
      void (async () => {
        try {
          const ticket = await createTicketAction({
            title,
            description,
            departmentRoleId,
            clientName,
            clientContact,
            clientLocation,
            priority,
          });

          if (files.length > 0) {
            const uploaded = await Promise.all(files.map(file => uploadFile(file, ticket.id)));
            await attachUploadedFilesToTicketAction(ticket.id, uploaded);
          }

          toast.success('Ticket created');
          router.push(`/admin/ticket/dashboard?view=all&ticket=${ticket.id}`);
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to create ticket');
        }
      })();
    });
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="p-6 bg-card/80 border-border/50">
        <h1 className="text-2xl font-semibold">Create Ticket</h1>
        <div className="grid grid-cols-2 gap-4 mt-6">
          <label className="space-y-1">
            <span className="text-sm text-muted-foreground">Created By</span>
            <input value={adminName} readOnly className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-muted-foreground">Department</span>
            <select
              value={departmentRoleId}
              onChange={e => setDepartmentRoleId(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            >
              {roleOptions.map(role => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 col-span-2">
            <span className="text-sm text-muted-foreground">Title</span>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 col-span-2">
            <span className="text-sm text-muted-foreground">Problem / Description</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm min-h-[120px]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-muted-foreground">Client Name</span>
            <input value={clientName} onChange={e => setClientName(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-muted-foreground">Client Contact</span>
            <input value={clientContact} onChange={e => setClientContact(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 col-span-2">
            <span className="text-sm text-muted-foreground">Client Location</span>
            <input value={clientLocation} onChange={e => setClientLocation(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-muted-foreground">Priority</span>
            <select value={priority} onChange={e => setPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')} className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
          <label className="space-y-1 col-span-2">
            <span className="text-sm text-muted-foreground">Attachments</span>
            <input
              type="file"
              multiple
              accept="image/*,video/*,application/pdf"
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
            {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} file(s) selected</p>}
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => router.push('/admin/ticket/dashboard')}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            Create Ticket
          </Button>
        </div>
      </Card>
    </div>
  );
}
