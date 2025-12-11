import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address) return ''
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Parse a UTC date string from the backend.
 * Backend returns ISO timestamps without 'Z' suffix, which JavaScript
 * interprets as local time. This ensures UTC parsing.
 */
export function parseUTCDate(dateStr: string | Date): Date {
  if (dateStr instanceof Date) return dateStr
  const utcDateStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
  return new Date(utcDateStr)
}

/**
 * Format a UTC date string to local date string
 */
export function formatDate(dateStr: string | Date): string {
  return parseUTCDate(dateStr).toLocaleDateString()
}

/**
 * Format a UTC date string to local date+time string
 */
export function formatDateTime(dateStr: string | Date): string {
  return parseUTCDate(dateStr).toLocaleString()
}
