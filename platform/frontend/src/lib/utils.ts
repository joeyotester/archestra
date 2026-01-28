import { type ClassValue, clsx } from "clsx";
import { format } from "date-fns";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

export const DEFAULT_TABLE_LIMIT = 10;
export const DEFAULT_AGENTS_PAGE_SIZE = 20;
export const DEFAULT_TOOLS_PAGE_SIZE = 50;

// Default sorting values - used for both initial state and SSR matching
export const DEFAULT_SORT_BY = "createdAt" as const;
export const DEFAULT_SORT_DIRECTION = "desc" as const;

// Default filter values for tools page - used for both initial state and SSR matching
export const DEFAULT_FILTER_ALL = "all" as const;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate({
  date,
  dateFormat = "MM/dd/yyyy HH:mm:ss",
}: {
  date: string;
  dateFormat?: string;
}) {
  return format(new Date(date), dateFormat);
}

/**
 * Extract error message from API error response and show a toast notification.
 * Handles different API error structures gracefully.
 *
 * @param error - The API error object (can have error.error as string or object with message)
 * @param fallbackMessage - Default message if no error message can be extracted
 */
export function showErrorToastFromApiError(
  error: unknown,
  fallbackMessage = "An error occurred",
): void {
  let message = fallbackMessage;

  if (error && typeof error === "object") {
    const apiError = error as {
      error?: string | { message?: string } | null;
      message?: string;
    };

    if (typeof apiError.error === "string") {
      message = apiError.error;
    } else if (
      apiError.error &&
      typeof apiError.error === "object" &&
      apiError.error.message
    ) {
      message = apiError.error.message;
    } else if (apiError.message) {
      message = apiError.message;
    }
  }

  toast.error(message);
}
