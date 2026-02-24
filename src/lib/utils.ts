import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const MONTH_LABELS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Build a "Month Year" string from numeric month/year, or undefined if not available.
 */
export function issueMonthYear(month: number | null | undefined, year: number | null | undefined): string | undefined {
  if (month && year && month >= 1 && month <= 12) return `${MONTH_LABELS[month]} ${year}`;
  return undefined;
}

/**
 * Format a date for display, using "Month Year" for legacy/imported articles
 * (when issueDate is provided) and full "Month Day, Year" otherwise.
 */
export function formatArticleDate(iso: string, issueDate?: string): string {
  if (issueDate) return issueDate;
  return formatDate(iso);
}
