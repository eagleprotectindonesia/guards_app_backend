import { MaintenanceProcessor } from './maintenance.processor';
import { SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME, deleteOldShiftPhotoReports } from '@repo/database';
import { deleteS3Object } from '@repo/storage';

jest.mock('@repo/database', () => ({
  DATA_CLEAN_JOB_NAME: 'data-clean',
  SHIFT_PHOTO_REPORT_CLEAN_JOB_NAME: 'shift-photo-report-clean',
  deleteOldShiftPhotoReports: jest.fn(),
  db: {
    chatMessage: { updateMany: jest.fn() },
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
});
