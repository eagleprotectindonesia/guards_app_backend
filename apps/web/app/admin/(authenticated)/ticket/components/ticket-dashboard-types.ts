export type TicketListItem = {
  id: string;
  code: string;
  title: string;
  clientName: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'NEW' | 'ACKNOWLEDGED' | 'WAITING_INFORMATION' | 'IN_PROGRESS' | 'SOLVED' | 'CLOSED' | 'CANNOT_RESOLVE' | 'CANCELLED';
  createdAt: string;
};

export type TicketAttachment = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  publicUrl?: string | null;
  createdAt: string | Date;
};

export type TicketMessage = {
  id: string;
  body: string;
  admin?: { name?: string | null } | null;
  employee?: { fullName?: string | null; employeeNumber?: string | null } | null;
  createdAt: string | Date;
  attachments?: TicketAttachment[];
};

export type TicketDetail = {
  id: string;
  code: string;
  title: string;
  description: string;
  clientName: string;
  clientContact: string;
  clientLocation: string;
  resolutionTargetHours: number;
  status: TicketListItem['status'];
  priority: TicketListItem['priority'];
  createdAt: string | Date;
  solvedAt?: string | Date | null;
  closedAt?: string | Date | null;
  cannotResolveAt?: string | Date | null;
  cancelledAt?: string | Date | null;
  cancellationNote?: string | null;
  submitterAdmin?: { name?: string | null } | null;
  assignedAdmin?: { id?: string; name?: string | null } | null;
  assignedEmployee?: { id?: string; fullName?: string | null } | null;
  departmentRole?: { name?: string | null; policy?: unknown | null } | null;
  assignedRoles?: Array<{ role: { name: string } }>;
  messages: TicketMessage[];
  attachments: TicketAttachment[];
};

export type TicketHistoryItem = {
  id: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  actor?: { name?: string | null } | null;
  createdAt: string | Date;
};

export type TicketDetailResult = {
  ticket: TicketDetail;
  history: TicketHistoryItem[];
  canClaim?: boolean;
  isClaimedByCurrentUser?: boolean;
  isSubmitter?: boolean;
  isClaimant?: boolean;
  canEdit?: boolean;
  canUseMore?: boolean;
  allowedStatusActions?: TicketListItem['status'][];
};
