import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string | null | undefined, maxChars = 2): string {
  if (!name) return '';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, maxChars).toUpperCase();
  }

  let initials = '';
  for (const part of parts) {
    if (part.length > 0) {
      initials += part[0].toUpperCase();
      if (initials.length >= maxChars) break;
    }
  }

  return initials;
}
