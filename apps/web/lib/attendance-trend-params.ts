export type ParsedTrendParams = {
  days: 7 | 15 | 30;
  departments: string[];
  officeIds: string[];
  siteIds: string[];
  chart: 'area' | 'line' | 'bar' | 'stacked-percent' | 'heatmap';
};

export function parseTrendSearchParams(
  sp: Record<string, string | string[] | undefined>
): ParsedTrendParams {
  const daysRaw = Array.isArray(sp.days) ? sp.days[0] : sp.days;
  const daysParsed = daysRaw ? parseInt(daysRaw, 10) : 7;
  const days = daysParsed === 30 ? 30 : daysParsed === 15 ? 15 : 7;

  const departmentsRaw = Array.isArray(sp.department) ? sp.department[0] : sp.department;
  const departments = departmentsRaw
    ? departmentsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const departmentsFinal = departments.length > 50 ? departments.slice(0, 50) : departments;

  const locationRaw = Array.isArray(sp.location) ? sp.location[0] : sp.location;
  const locationParts = locationRaw
    ? locationRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const officeIds: string[] = [];
  const siteIds: string[] = [];

  for (const part of locationParts.slice(0, 50)) {
    if (part.startsWith('o:')) {
      officeIds.push(part.slice(2));
    } else if (part.startsWith('s:')) {
      siteIds.push(part.slice(2));
    }
  }

  const chartRaw = Array.isArray(sp.chart) ? sp.chart[0] : sp.chart;
  const validCharts = ['area', 'line', 'bar', 'stacked-percent', 'heatmap'] as const;
  const chart = validCharts.includes(chartRaw as (typeof validCharts)[number])
    ? (chartRaw as ParsedTrendParams['chart'])
    : 'area';

  return { days, departments: departmentsFinal, officeIds, siteIds, chart };
}

export function buildTrendQueryString(
  params: Partial<ParsedTrendParams>
): string {
  const sp = new URLSearchParams();

  if (params.days) sp.set('days', String(params.days));
  if (params.chart) sp.set('chart', params.chart);

  if (params.departments?.length) {
    sp.set('department', params.departments.join(','));
  }

  if (params.officeIds?.length || params.siteIds?.length) {
    const locParts: string[] = [
      ...(params.officeIds || []).map((id) => `o:${id}`),
      ...(params.siteIds || []).map((id) => `s:${id}`),
    ];
    sp.set('location', locParts.join(','));
  }

  return sp.toString();
}
