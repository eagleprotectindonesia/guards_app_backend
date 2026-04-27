import type { JsonValue } from '@prisma/client/runtime/client';

export type Serialized<T> = T extends Date
  ? string
  : [T] extends [JsonValue]
    ? T
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

export function serialize<T>(data: T): Serialized<T> {
  return JSON.parse(JSON.stringify(data));
}

export function getPaginationParams(
  searchParams: { [key: string]: string | string[] | undefined },
  defaultPerPage = 10
) {
  const pageRaw = searchParams.page;
  const perPageRaw = searchParams.per_page;
  const page = Array.isArray(pageRaw) ? Number(pageRaw[0]) : Number(pageRaw);
  const perPage = Array.isArray(perPageRaw) ? Number(perPageRaw[0]) : Number(perPageRaw);
  const normalizedPage = Number.isInteger(page) && page >= 1 ? page : 1;
  const normalizedPerPage = Number.isInteger(perPage) && perPage >= 1 && perPage <= 100 ? perPage : defaultPerPage;
  const skip = (normalizedPage - 1) * normalizedPerPage;

  return { page: normalizedPage, perPage: normalizedPerPage, skip };
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
