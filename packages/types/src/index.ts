export type ActionState<T = Record<string, unknown>> = {
  message?: string;
  errors?: {
    [K in keyof T]?: string[];
  };
  success?: boolean;
};

export type ShiftStatus = 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
export type CheckInStatus = 'on_time' | 'late' | 'invalid';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'pending_verification';

export interface Guard {
  id: string;
  name: string;
  phone: string;
  guardCode?: string | null;
  status?: boolean | null;
  joinDate?: string | Date | null;
  leftDate?: string | Date | null;
  note?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Site {
  id: string;
  name: string;
  clientName?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: boolean | null;
  note?: string | null;
}

export interface ShiftType {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface Attendance {
  id: string;
  shiftId: string;
  guardId?: string | null;
  recordedAt: string | Date;
  picture?: string | null;
  status: AttendanceStatus;
  metadata?: any;
}

export interface Shift {
  id: string;
  siteId: string;
  shiftTypeId: string;
  guardId?: string | null;
  date: string | Date;
  startsAt: string | Date;
  endsAt: string | Date;
  status: ShiftStatus;
  checkInStatus?: CheckInStatus | null;
  requiredCheckinIntervalMins: number;
  graceMinutes: number;
  lastHeartbeatAt?: string | Date | null;
  missedCount: number;
  note?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ShiftWithRelations extends Shift {
  site: Site;
  shiftType: ShiftType;
  guard?: Guard | null;
  attendance?: Attendance | null;
}
