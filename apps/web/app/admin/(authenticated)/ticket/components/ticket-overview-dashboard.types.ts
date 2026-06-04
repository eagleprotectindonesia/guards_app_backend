export type OverviewMetric = {
  label: string;
  value: number;
  hint: string;
  hintTone?: 'neutral' | 'positive' | 'warning' | 'critical';
  icon: 'ticket' | 'shield' | 'progress' | 'resolved' | 'breach';
  accentClass: string;
};

export type DashboardRow = {
  id: string;
  code: string;
  title: string;
  category: string;
  clientName: string;
  clientLocation: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: string;
  assignedTo: string;
  createdAt: string;
  resolutionTargetHours?: number;
  solvedAt?: string | null;
  closedAt?: string | null;
  cannotResolveAt?: string | null;
};

export type TicketOverviewSidebar = {
  shortcuts: {
    myOpenSubmitted: number;
    unassigned: number;
    slaBreached: number;
    resolvedToday: number;
  };
  categories: Array<{
    value: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  slaStatus: {
    met: number;
    pending: number;
    breached: number;
    total: number;
    metPercentage: number;
    pendingPercentage: number;
    breachedPercentage: number;
  };
};

export type TicketOverviewFilters = {
  q: string;
  department: string;
  status: string;
  priority: string;
  assignee: string;
  sla?: string;
};

export type TicketOverviewOptions = {
  departments: Array<{ value: string; label: string }>;
  assignees: Array<{ value: string; label: string }>;
};

export type TicketOverviewDashboardProps = {
  metrics: OverviewMetric[];
  sidebar: TicketOverviewSidebar;
  rows: DashboardRow[];
  totalCount: number;
  filters: TicketOverviewFilters;
  options: TicketOverviewOptions;
};
