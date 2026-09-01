import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize phone number for consistent comparison
 * Removes + prefix, spaces, and dashes so that:
 * - +6281234567890
 * - 6281234567890
 * - +62 812 3456 7890
 * All become: 6281234567890
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ""
  // Remove +, spaces, dashes, and other non-digit characters
  return phone.replace(/[^\d]/g, "")
}
