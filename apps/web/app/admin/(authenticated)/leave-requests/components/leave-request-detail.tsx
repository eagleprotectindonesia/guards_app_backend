'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { approveLeaveRequestAction, rejectLeaveRequestAction } from '../actions';
import { isImageFile, isVideoFile } from '@/lib/file';
import { SerializedLeaveRequestAdminListItemDto } from '@/types/leave-requests';
import { getLeaveReasonMeta } from '@/lib/leave-requests';

type LeaveRequestDetailProps = {
  leaveRequest: SerializedLeaveRequestAdminListItemDto;
  canEdit: boolean;
};

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'approved':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'rejected':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'cancelled':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export default function LeaveRequestDetail({ leaveRequest, canEdit }: LeaveRequestDetailProps) {
  const [approveNote, setApproveNote] = useState(leaveRequest.adminNote || '');
  const [rejectNote, setRejectNote] = useState('');
  const [isPending, startTransition] = useTransition();
  const isPendingStatus = leaveRequest.status === 'pending';
  const reasonMeta = getLeaveReasonMeta(leaveRequest.reason);
  const cycleBreakdown = Array.isArray(leaveRequest.policySnapshot?.cycleBreakdown)
    ? leaveRequest.policySnapshot.cycleBreakdown
    : [];

  const handleApprove = () => {
    if (!isPendingStatus || !canEdit) return;

    startTransition(async () => {
      const result = await approveLeaveRequestAction(leaveRequest.id, approveNote);
      if (result.success) {
        toast.success('Leave request approved successfully.');
        return;
      }
      toast.error(result.message || 'Failed to approve leave request.');
    });
  };

  const handleReject = () => {
    if (!isPendingStatus || !canEdit) return;

    const trimmedRejectNote = rejectNote.trim();
    if (!trimmedRejectNote) {
      toast.error('Rejection note is required.');
      return;
    }

    startTransition(async () => {
      const result = await rejectLeaveRequestAction(leaveRequest.id, trimmedRejectNote);
      if (result.success) {
        toast.success('Leave request rejected successfully.');
        return;
      }
      toast.error(result.message || 'Failed to reject leave request.');
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leave Request Details</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Request ID: <span className="font-mono">{leaveRequest.id}</span>
          </p>
        </div>
        <Link
          href="/admin/leave-requests"
          className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors shadow-sm"
        >
          Back to List
        </Link>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Employee</p>
            <p className="text-sm font-medium text-foreground mt-1">{leaveRequest.employee.fullName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {leaveRequest.employee.employeeNumber || '-'} • {leaveRequest.employee.role}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            <span
              className={`inline-flex items-center mt-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(
                leaveRequest.status
              )}`}
            >
              {leaveRequest.status.toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Date Range</p>
            <p className="text-sm font-medium text-foreground mt-1">
              {format(new Date(leaveRequest.startDate), 'yyyy/MM/dd')} -{' '}
              {format(new Date(leaveRequest.endDate), 'yyyy/MM/dd')}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Reason</p>
            <p className="text-sm font-medium text-foreground mt-1">{reasonMeta.label}</p>
            <p className="text-xs text-muted-foreground mt-1 uppercase">{reasonMeta.category}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Submitted At</p>
            <p className="text-sm text-foreground mt-1">{format(new Date(leaveRequest.createdAt), 'yyyy/MM/dd HH:mm')}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Reviewed By</p>
            <p className="text-sm text-foreground mt-1">{leaveRequest.reviewedBy?.name || '-'}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Employee Note</p>
            <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{leaveRequest.employeeNote || '-'}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Admin Note</p>
            <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{leaveRequest.adminNote || '-'}</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">Policy Outcome</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid</p>
            <p className="text-sm font-medium text-foreground mt-1">
              {leaveRequest.isPaid === null ? '-' : leaveRequest.isPaid ? 'Yes' : 'No'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Annual Deducted Days</p>
            <p className="text-sm font-medium text-foreground mt-1">{leaveRequest.deductedAnnualDays}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Unpaid Days</p>
            <p className="text-sm font-medium text-foreground mt-1">{leaveRequest.unpaidDays}</p>
          </div>
        </div>

        {cycleBreakdown.length > 0 && (
          <div className="mt-6 space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sick Cycle Breakdown</p>
            {cycleBreakdown.map((cycle, index) => (
              <div key={`${cycle.cycleStart}-${index}`} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  {cycle.cycleStart} - {cycle.cycleEnd}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Requested: {cycle.requestedWorkingDays}, No-doc paid: {cycle.noDocPaidDaysCurrentRequest}, Annual deducted:{' '}
                  {cycle.deductedAnnualDays}, Unpaid: {cycle.unpaidDays}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">Attachments</h2>
        {leaveRequest.attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">No attachments.</p>
        ) : (
          <div className="grid gap-4 mt-4">
            {leaveRequest.attachments.map((attachmentUrl, index) => (
              <div key={`${attachmentUrl}-${index}`} className="rounded-lg border border-border p-3 space-y-3">
                {isImageFile(attachmentUrl) && (
                  <img
                    src={attachmentUrl}
                    alt={`Attachment ${index + 1}`}
                    className="w-full max-h-[420px] object-contain rounded-lg bg-muted/30"
                  />
                )}
                {isVideoFile(attachmentUrl) && (
                  <video src={attachmentUrl} controls className="w-full max-h-[420px] object-contain rounded-lg bg-muted/30" />
                )}
                {!isImageFile(attachmentUrl) && !isVideoFile(attachmentUrl) && (
                  <iframe title={`Attachment ${index + 1}`} src={attachmentUrl} className="w-full h-80 rounded-lg border border-border" />
                )}
                <a
                  href={attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Open attachment in new tab
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">Review Actions</h2>
        {!canEdit && <p className="text-sm text-muted-foreground mt-3">You do not have permission to review leave requests.</p>}
        {canEdit && !isPendingStatus && (
          <p className="text-sm text-muted-foreground mt-3">
            This request is already <span className="font-medium">{leaveRequest.status}</span> and cannot be reviewed again.
          </p>
        )}
        {canEdit && isPendingStatus && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <label htmlFor="approveNote" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Approval Note (Optional)
              </label>
              <textarea
                id="approveNote"
                value={approveNote}
                onChange={event => setApproveNote(event.target.value)}
                rows={4}
                maxLength={2000}
                disabled={isPending}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Optional note for approval..."
              />
              <button
                onClick={handleApprove}
                disabled={isPending}
                className="inline-flex items-center justify-center h-10 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? 'Processing...' : 'Approve Request'}
              </button>
            </div>

            <div className="space-y-2">
              <label htmlFor="rejectNote" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Rejection Note (Required)
              </label>
              <textarea
                id="rejectNote"
                value={rejectNote}
                onChange={event => setRejectNote(event.target.value)}
                rows={4}
                maxLength={2000}
                disabled={isPending}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Reason for rejection..."
              />
              <button
                onClick={handleReject}
                disabled={isPending}
                className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? 'Processing...' : 'Reject Request'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
