import {
  listShiftPhotoReportsPaginated as listDb,
  getShiftPhotoReportById as getByIdDb,
  createRegeneratedShiftPhotoReport as regenerateDb,
} from '@repo/database';
import { ShiftPhotoReportStatus } from '@prisma/client';

export async function listReports(params: {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  clientId?: string;
  status?: ShiftPhotoReportStatus;
  page?: number;
  pageSize?: number;
}) {
  return listDb({
    dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
    dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
    employeeId: params.employeeId,
    clientId: params.clientId,
    status: params.status,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
  });
}

export async function getReportById(id: string) {
  return getByIdDb(id);
}

export async function regenerateReport(id: string, adminId: string) {
  return regenerateDb({ originalReportId: id, adminId });
}
