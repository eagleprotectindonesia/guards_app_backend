import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Serialized<T> = T extends Date
  ? string
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
