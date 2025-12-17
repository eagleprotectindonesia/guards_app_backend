import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { JsonValue } from '@prisma/client/runtime/client';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Define a type for JSON-serializable values

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

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function getPaginationParams(
  searchParams: { [key: string]: string | string[] | undefined },
  defaultPerPage = 10
) {
  const pageSchema = z.coerce.number().int().min(1).default(1);
  const perPageSchema = z.coerce.number().int().min(1).max(100).default(defaultPerPage);

  const page = pageSchema.parse(searchParams.page);
  const perPage = perPageSchema.parse(searchParams.per_page);
  const skip = (page - 1) * perPage;

  return { page, perPage, skip };
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}
