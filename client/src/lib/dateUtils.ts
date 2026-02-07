/**
 * Shared date/time formatting utilities with relative time support.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Returns a relative time string like "2 hours ago", "3 days ago", etc.
 */
export function relativeTime(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();

  if (diff < 0) return "just now";
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins}m ago`;
  }
  if (diff < DAY) {
    const hrs = Math.floor(diff / HOUR);
    return `${hrs}h ago`;
  }
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }
  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK);
    return `${weeks}w ago`;
  }
  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH);
    return `${months}mo ago`;
  }
  const years = Math.floor(diff / YEAR);
  return `${years}y ago`;
}

/**
 * Formats a date as "MM/DD/YYYY, h:mm AM/PM" in the user's locale.
 */
export function formatDateTime(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formats a date as "MM/DD/YYYY" in the user's locale.
 */
export function formatDate(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

/**
 * Returns "MM/DD/YYYY, h:mm AM/PM · 2h ago" combined string.
 */
export function formatDateTimeWithRelative(date: Date | number | string): string {
  return `${formatDateTime(date)} · ${relativeTime(date)}`;
}
