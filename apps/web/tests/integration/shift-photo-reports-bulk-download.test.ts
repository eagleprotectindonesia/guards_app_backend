const mockFile = jest.fn();
const mockGenerateAsync = jest.fn().mockResolvedValue(new Blob(['fake-zip']));

jest.mock('jszip', () => {
  return jest.fn().mockImplementation(() => ({
    file: mockFile,
    generateAsync: mockGenerateAsync,
  }));
});

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { buildShiftReportsZip } from '@/lib/shift-photo-reports/bulk-zip';

describe('buildShiftReportsZip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const shiftStartsAt = '2026-06-22T00:00:00.000Z';
  const shiftEndsAt = '2026-06-22T08:00:00.000Z';

  const baseReports = [
    {
      id: 'r1',
      reportNumber: '2026-06-22-00001',
      downloadUrl: 'https://s3.example.com/report1.pdf',
      shiftStartsAt,
      shiftEndsAt,
      shift: { site: { name: 'Test Site A' } },
    },
    {
      id: 'r2',
      reportNumber: '2026-06-22-00002',
      downloadUrl: 'https://s3.example.com/report2.pdf',
      shiftStartsAt,
      shiftEndsAt,
      shift: { site: { name: 'Test Site B' } },
    },
    {
      id: 'r3',
      reportNumber: null,
      downloadUrl: 'https://s3.example.com/report3.pdf',
      shiftStartsAt,
      shiftEndsAt,
      shift: { site: { name: 'Test Site C' } },
    },
  ];

  const pdfBlob = new Blob(['%PDF-1.4 fake content'], { type: 'application/pdf' });

  test('includes all reports that have downloadUrl', async () => {
    mockFetch.mockResolvedValue({ ok: true, blob: async () => pdfBlob });

    await buildShiftReportsZip(baseReports);

    expect(mockFile).toHaveBeenCalledTimes(3);
    expect(mockFile).toHaveBeenCalledWith('EP - Test Site A - 2026-06-22 - 08-00 to 16-00 - RPT00001.pdf', expect.any(Blob));
    expect(mockFile).toHaveBeenCalledWith('EP - Test Site B - 2026-06-22 - 08-00 to 16-00 - RPT00002.pdf', expect.any(Blob));
    expect(mockFile).toHaveBeenCalledWith('EP - Test Site C - 2026-06-22 - 08-00 to 16-00 - RPTr3.pdf', expect.any(Blob));
  });

  test('skips reports without a downloadUrl', async () => {
    mockFetch.mockResolvedValue({ ok: true, blob: async () => pdfBlob });

    const reports = [
      ...baseReports,
      { id: 'r4', reportNumber: '2026-06-22-00004', downloadUrl: null },
    ];

    await buildShiftReportsZip(reports);

    expect(mockFile).toHaveBeenCalledTimes(3);
  });

  test('throws when no reports have a downloadUrl', async () => {
    const reports = [
      { id: 'r4', reportNumber: '2026-06-22-00004', downloadUrl: null },
    ];

    await expect(buildShiftReportsZip(reports)).rejects.toThrow('No downloadable reports selected');
  });

  test('throws and aborts all if one fetch fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, blob: async () => pdfBlob })
      .mockRejectedValueOnce(new Error('Network failure'));

    await expect(buildShiftReportsZip(baseReports)).rejects.toThrow('Network failure');
  });

  test('throws and aborts all if one fetch returns non-ok', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, blob: async () => pdfBlob })
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: true, blob: async () => pdfBlob });

    await expect(buildShiftReportsZip(baseReports)).rejects.toThrow('2026-06-22-00002: 403');
  });

  test('calls fetch once per report with downloadUrl', async () => {
    mockFetch.mockResolvedValue({ ok: true, blob: async () => pdfBlob });

    await buildShiftReportsZip(baseReports);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenCalledWith('https://s3.example.com/report1.pdf');
    expect(mockFetch).toHaveBeenCalledWith('https://s3.example.com/report2.pdf');
    expect(mockFetch).toHaveBeenCalledWith('https://s3.example.com/report3.pdf');
  });

  test('generates zip with blob type', async () => {
    mockFetch.mockResolvedValue({ ok: true, blob: async () => pdfBlob });

    await buildShiftReportsZip(baseReports);

    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
  });
});
