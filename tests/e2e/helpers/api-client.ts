import { test as base, expect, APIRequestContext } from '@playwright/test';
import type { Admin, Employee } from '@repo/database';
import { getEmployeeAuthHeader, getAdminAuthHeader } from '../fixtures/auth';

/**
 * Extended Playwright test with authenticated API request contexts
 */
export interface AuthenticatedFixtures {
  employeeRequest: (employee: Employee) => Promise<APIRequestContext>;
  adminRequest: (admin: Admin) => Promise<APIRequestContext>;
}

export const test = base.extend<AuthenticatedFixtures>({
  /**
   * Create an authenticated API request context for an employee
   */
  employeeRequest: async ({ request }, use) => {
    const createContext = async (employee: Employee) => {
      const headers = getEmployeeAuthHeader(employee);
      return request.newContext({
        extraHTTPHeaders: headers,
      });
    };
    await use(createContext);
  },

  /**
   * Create an authenticated API request context for an admin
   */
  adminRequest: async ({ request }, use) => {
    const createContext = async (admin: Admin) => {
      const headers = getAdminAuthHeader(admin);
      return request.newContext({
        extraHTTPHeaders: headers,
      });
    };
    await use(createContext);
  },
});

export { expect };

/**
 * Helper to make authenticated employee API request
 */
export async function makeEmployeeRequest(
  request: APIRequestContext,
  employee: Employee,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  url: string,
  options?: {
    data?: any;
    params?: Record<string, string>;
  }
) {
  const headers = getEmployeeAuthHeader(employee);
  
  return request.fetch(url, {
    method,
    headers,
    data: options?.data,
    params: options?.params,
  });
}

/**
 * Helper to make authenticated admin API request
 */
export async function makeAdminRequest(
  request: APIRequestContext,
  admin: Admin,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  url: string,
  options?: {
    data?: any;
    params?: Record<string, string>;
  }
) {
  const headers = getAdminAuthHeader(admin);
  
  return request.fetch(url, {
    method,
    headers,
    data: options?.data,
    params: options?.params,
  });
}
