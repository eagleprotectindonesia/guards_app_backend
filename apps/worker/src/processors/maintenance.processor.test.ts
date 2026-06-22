import { MaintenanceProcessor } from './maintenance.processor';
import {
  DATA_CLEAN_JOB_NAME,
  SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME,
  SHIFT_ATTENDANCE_CLEAN_JOB_NAME,
  deleteOldShiftPhotoReports,
  deleteOldShiftsAndRelated,
  deleteOldOfficeShiftsAndRelated,
} from '@repo/database';
import { deleteS3Object } from '@repo/storage';

jest.mock('@repo/database', () => ({
  DATA_CLEAN_JOB_NAME: 'data-clean',
  SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME: 'shift-photo-report-clean',
  SHIFT_ATTENDANCE_CLEAN_JOB_NAME: 'shift-attendance-clean',
  deleteOldShiftPhotoReports: jest.fn(),
  deleteOldShiftsAndRelated: jest.fn(),
  deleteOldOfficeShiftsAndRelated: jest.fn(),
  db: {
    chatMessage: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  },
}));

jest.mock('@repo/storage', () => ({
  deleteS3Object: jest.fn(),
}));

describe('MaintenanceProcessor', () => {
  const processor = new MaintenanceProcessor();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('skips non-matching jobs', async () => {
    const job = { id: 'job-1', name: 'other-job', data: {} } as any;

    await processor.process(job);

    expect(deleteOldShiftPhotoReports).not.toHaveBeenCalled();
    expect(deleteOldShiftsAndRelated).not.toHaveBeenCalled();
  });

  test('calls deleteOldShiftPhotoReports and deletes S3 objects', async () => {
    (deleteOldShiftPhotoReports as jest.Mock).mockResolvedValue({
      deleted: 2,
      s3Keys: ['key1.pdf', 'key2.pdf'],
    });
    (deleteS3Object as jest.Mock).mockResolvedValue(undefined);

    const job = {
      id: 'job-2',
      name: SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME,
      data: {},
    } as any;

    await processor.process(job);

    expect(deleteOldShiftPhotoReports).toHaveBeenCalledTimes(1);
    const callArg = (deleteOldShiftPhotoReports as jest.Mock).mock.calls[0][0];
    expect(callArg).toBeInstanceOf(Date);

    expect(deleteS3Object).toHaveBeenCalledTimes(2);
    expect(deleteS3Object).toHaveBeenCalledWith('key1.pdf');
    expect(deleteS3Object).toHaveBeenCalledWith('key2.pdf');
  });

  test('handles S3 deletion errors gracefully', async () => {
    (deleteOldShiftPhotoReports as jest.Mock).mockResolvedValue({
      deleted: 1,
      s3Keys: ['key1.pdf', 'key2.pdf'],
    });
    (deleteS3Object as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('S3 error'));

    const job = {
      id: 'job-3',
      name: SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME,
      data: {},
    } as any;

    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      '[MaintenanceProcessor] Failed to delete S3 object: key2.pdf',
      expect.any(Error)
    );
  });

  test('does nothing when no old reports exist', async () => {
    (deleteOldShiftPhotoReports as jest.Mock).mockResolvedValue({
      deleted: 0,
      s3Keys: [],
    });

    const job = {
      id: 'job-4',
      name: SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME,
      data: {},
    } as any;

    await processor.process(job);

    expect(deleteS3Object).not.toHaveBeenCalled();
  });

  test('handles repository errors gracefully', async () => {
    (deleteOldShiftPhotoReports as jest.Mock).mockRejectedValue(
      new Error('Database error')
    );

    const job = {
      id: 'job-5',
      name: SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME,
      data: {},
    } as any;

    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  describe('shift-attendance-clean job (SHIFT_ATTENDANCE_CLEAN_JOB_NAME)', () => {
    test('calls both shift cleanup functions and deletes S3 keys', async () => {
      (deleteOldShiftsAndRelated as jest.Mock).mockResolvedValue({
        shifts: 3,
        checkins: 10,
        alerts: 5,
        attendances: 3,
        photoReports: 1,
        changelogs: 8,
        s3Keys: ['pic1.jpg', 'report1.pdf'],
      });
      (deleteOldOfficeShiftsAndRelated as jest.Mock).mockResolvedValue({
        officeShifts: 2,
        officeAttendances: 4,
        changelogs: 2,
        s3Keys: ['office-pic.jpg'],
      });
      (deleteS3Object as jest.Mock).mockResolvedValue(undefined);

      const job = { id: 'job-6', name: SHIFT_ATTENDANCE_CLEAN_JOB_NAME, data: {} } as any;
      await processor.process(job);

      expect(deleteOldShiftsAndRelated).toHaveBeenCalledTimes(1);
      const callArg = (deleteOldShiftsAndRelated as jest.Mock).mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Date);

      expect(deleteOldOfficeShiftsAndRelated).toHaveBeenCalledTimes(1);

      expect(deleteS3Object).toHaveBeenCalledTimes(3);
      expect(deleteS3Object).toHaveBeenCalledWith('pic1.jpg');
      expect(deleteS3Object).toHaveBeenCalledWith('report1.pdf');
      expect(deleteS3Object).toHaveBeenCalledWith('office-pic.jpg');
    });

    test('handles S3 deletion errors during shift cleanup gracefully', async () => {
      (deleteOldShiftsAndRelated as jest.Mock).mockResolvedValue({
        shifts: 1,
        checkins: 0,
        alerts: 0,
        attendances: 0,
        photoReports: 0,
        changelogs: 0,
        s3Keys: ['pic1.jpg', 'pic2.jpg'],
      });
      (deleteOldOfficeShiftsAndRelated as jest.Mock).mockResolvedValue({
        officeShifts: 0,
        officeAttendances: 0,
        changelogs: 0,
        s3Keys: [],
      });
      (deleteS3Object as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('S3 error'));

      const job = { id: 'job-7', name: SHIFT_ATTENDANCE_CLEAN_JOB_NAME, data: {} } as any;
      await expect(processor.process(job)).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith(
        '[MaintenanceProcessor] Failed to delete S3 object: pic2.jpg',
        expect.any(Error)
      );
    });

    test('does nothing when no old shifts exist', async () => {
      (deleteOldShiftsAndRelated as jest.Mock).mockResolvedValue({
        shifts: 0,
        checkins: 0,
        alerts: 0,
        attendances: 0,
        photoReports: 0,
        changelogs: 0,
        s3Keys: [],
      });
      (deleteOldOfficeShiftsAndRelated as jest.Mock).mockResolvedValue({
        officeShifts: 0,
        officeAttendances: 0,
        changelogs: 0,
        s3Keys: [],
      });

      const job = { id: 'job-8', name: SHIFT_ATTENDANCE_CLEAN_JOB_NAME, data: {} } as any;
      await processor.process(job);

      expect(deleteS3Object).not.toHaveBeenCalled();
    });
  });

  describe('data-clean job (DATA_CLEAN_JOB_NAME)', () => {
    test('expires stale chat drafts', async () => {
      const db = require('@repo/database').db;
      (db.chatMessage.updateMany as jest.Mock).mockResolvedValue({ count: 5 });

      const job = { id: 'job-9', name: DATA_CLEAN_JOB_NAME, data: {} } as any;
      await processor.process(job);

      expect(db.chatMessage.updateMany).toHaveBeenCalledTimes(1);
    });

    test('does not call shift cleanup', async () => {
      const job = { id: 'job-10', name: DATA_CLEAN_JOB_NAME, data: {} } as any;
      await processor.process(job);

      expect(deleteOldShiftsAndRelated).not.toHaveBeenCalled();
      expect(deleteOldOfficeShiftsAndRelated).not.toHaveBeenCalled();
    });
  });
});
