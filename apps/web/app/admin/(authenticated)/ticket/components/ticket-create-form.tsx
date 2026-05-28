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
  const [description, setDescription] = useState('');
  const [selectedDept, setSelectedDept] = useState<'HR' | 'IT'>('IT');
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
    if (!description.trim()) {
      toast.error('Description / Problem is required');
      return;
    }

    const matchedRole = roleOptions.find(
      role => role.name.toLowerCase() === selectedDept.toLowerCase()
    );

    if (!matchedRole) {
      toast.error(`The department role for '${selectedDept}' does not exist in the database. Please create it first.`);
      return;
    }

    let generatedTitle = description.trim().split('\n')[0]?.trim().slice(0, 80) || 'New Ticket';
    if (generatedTitle.length < 3) {
      generatedTitle = generatedTitle.padEnd(3, '.');
    }

    startTransition(() => {
      void (async () => {
        try {
          const ticket = await createTicketAction({
            title: generatedTitle,
            description,
            departmentRoleId: matchedRole.id,
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
    <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-8 items-start px-4 py-8">
      {/* Left Column (Breadcrumb/Title) */}
      <div className="md:col-span-2 space-y-2 mt-4">
        <h1 className="text-3xl font-bold text-white tracking-tight">Create Ticket</h1>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Ticket Command Center</span>
          <span className="text-slate-600">&gt;</span>
          <span className="text-indigo-400">Create Ticket</span>
        </div>
      </div>

      {/* Right Column (Form) */}
      <Card className="md:col-span-3 p-6 bg-[#0f121d] border-slate-800 text-slate-100 shadow-xl">
        {/* CREATE TICKET SECTION */}
        <div className="space-y-4">
          <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Create Ticket</div>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Created By</span>
              <input
                value={adminName}
                readOnly
                className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">
                Department <span className="text-red-500">*</span>
              </span>
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value as 'HR' | 'IT')}
                className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="HR">HR</option>
                <option value="IT">IT</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Priority</span>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
          </div>
        </div>

        {/* CLIENT INFORMATION SECTION */}
        <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
          <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Client Information</div>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">
                Client Name <span className="text-red-500">*</span>
              </span>
              <input
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="Enter client name"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">
                Client Contact Number <span className="text-red-500">*</span>
              </span>
              <input
                value={clientContact}
                onChange={e => setClientContact(e.target.value)}
                className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="Enter contact number"
              />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-xs text-slate-400 font-medium">
                Client Location <span className="text-red-500">*</span>
              </span>
              <input
                value={clientLocation}
                onChange={e => setClientLocation(e.target.value)}
                className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="Enter location / site name"
              />
            </label>
          </div>
        </div>

        {/* PROBLEM INFORMATION SECTION */}
        <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
          <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Problem Information</div>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1 col-span-2">
              <span className="text-xs text-slate-400 font-medium">
                Problem <span className="text-red-500">*</span>
              </span>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 min-h-[120px] focus:outline-none focus:border-indigo-500"
                placeholder="Describe the problem in detail..."
              />
            </label>
            <div className="col-span-2 space-y-1">
              <span className="text-xs text-slate-400 font-medium">Attachments</span>
              <div className="border border-dashed border-slate-800 rounded-lg p-6 bg-slate-950/50 hover:bg-slate-950 transition cursor-pointer flex flex-col items-center justify-center gap-2 relative">
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,application/pdf"
                  onChange={e => setFiles(Array.from(e.target.files ?? []))}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                <div className="text-sm font-medium text-slate-300">Click to upload or drag and drop</div>
                <div className="text-xs text-slate-500">Images, Videos, PDF (Max 10MB)</div>
              </div>
              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map((file, i) => (
                    <p key={i} className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                      ✓ {file.name} ({Math.round(file.size / 1024)} KB)
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button
            variant="outline"
            className="border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white"
            onClick={() => router.push('/admin/ticket/dashboard')}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Ticket
          </Button>
        </div>
      </Card>
    </div>
  );
}
