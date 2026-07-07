export interface CalendarItem {
  id: string;
  originalId: string;
  kind: string;
  title: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  priority: string | null;
  location: string | null;
  description?: string | null;
  status: string | null;
  colorHint: string | null;
  ownerId: string;
  ownerType: 'employee' | 'admin';
  ownerName: string;
  taggedUsers: Array<{ id: string; type: 'employee' | 'admin'; name: string; email?: string }>;
}
