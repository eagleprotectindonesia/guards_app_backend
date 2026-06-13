import { TicketDepartmentEnum } from '@repo/validations';

export const TICKET_DEPARTMENT_OPTIONS = TicketDepartmentEnum.options;

export type TicketDepartment = (typeof TICKET_DEPARTMENT_OPTIONS)[number];
