import {
  appendDashboardTabToHref,
  getAdminDashboardHref,
  getSelectedAdminDashboardTab,
  isDashboardPath,
} from '../lib/admin-tab-routing';
import { ADMIN_TICKET_NAV_ITEMS, getAdminNavGroups } from '../lib/admin-navigation';

describe('admin tab routing', () => {
  test('encodes the selected dashboard tab in dashboard hrefs', () => {
    expect(getAdminDashboardHref('dashboard')).toBe('/admin/dashboard?dashboardTab=dashboard');
    expect(getAdminDashboardHref('guard')).toBe('/admin/dashboard?dashboardTab=guard');
    expect(getAdminDashboardHref('ticket')).toBe('/admin/ticket/dashboard?dashboardTab=ticket');
  });

  test('preserves unrelated query params when adding the dashboard tab', () => {
    expect(appendDashboardTabToHref('/admin/sites?foo=bar', 'ticket')).toBe('/admin/sites?foo=bar&dashboardTab=ticket');
  });

  test('reads the selected dashboard tab from the query param when valid', () => {
    expect(getSelectedAdminDashboardTab('/admin/sites', new URLSearchParams('dashboardTab=client'))).toBe('client');
  });

  test('falls back to the dashboard route when the query param is missing', () => {
    expect(getSelectedAdminDashboardTab('/admin/dashboard', new URLSearchParams())).toBe('dashboard');
    expect(getSelectedAdminDashboardTab('/admin/ticket/dashboard', new URLSearchParams())).toBe('ticket');
    expect(getSelectedAdminDashboardTab('/admin/new-dashboard', new URLSearchParams())).toBe('guard');
  });

  test('reads the selected dashboard tab from the pathname even if not a dashboard path', () => {
    expect(getSelectedAdminDashboardTab('/admin/ticket/all', new URLSearchParams())).toBe('ticket');
  });

  test('sanitizes invalid dashboard tab values to live', () => {
    expect(getSelectedAdminDashboardTab('/admin/sites', new URLSearchParams('dashboardTab=bogus'))).toBe('guard');
  });

  test('treats the new dashboard path as a dashboard route', () => {
    expect(isDashboardPath('/admin/dashboard')).toBe(true);
    expect(isDashboardPath('/admin/new-dashboard')).toBe(true);
  });

  test('exposes a single dynamic dashboard entry in the sidebar groups', () => {
    const groups = getAdminNavGroups(true, 'ticket');
    const dashboardGroup = groups.find(group => group.label === 'Dashboard');
    const ticketGroup = groups.find(group => group.label === 'Ticket');

    expect(dashboardGroup?.items).toHaveLength(1);
    expect(dashboardGroup?.items[0].href).toBe('/admin/ticket/dashboard?dashboardTab=ticket');
    expect(ticketGroup?.items.map(item => item.href)).toEqual(ADMIN_TICKET_NAV_ITEMS.map(item => item.href));
    expect(ticketGroup?.items.some(item => item.name === 'Dashboard')).toBe(false);
  });
});
