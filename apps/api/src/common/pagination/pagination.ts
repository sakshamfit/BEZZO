/**
 * Pagination helpers.
 *
 * Specification requirements: default page size 20, server-enforced maximum, cursor pagination for
 * high-volume operational APIs, and never an unbounded result set (API spec §9).
 */
import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const pagePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PagePaginationInput = z.infer<typeof pagePaginationSchema>;

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export function paginate<T>(items: T[], totalItems: number, input: PagePaginationInput): Paginated<T> {
  return {
    items,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / input.pageSize), 1),
    },
  };
}

export function sqlLimitOffset(input: PagePaginationInput): { limit: number; offset: number } {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type CursorPaginationInput = z.infer<typeof cursorPaginationSchema>;

export interface CursorPage<T> {
  items: T[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

/**
 * Opaque cursor encoding. The cursor is a base64url JSON tuple of the ordering keys; it is opaque to
 * clients so the underlying ordering can evolve without breaking them.
 */
export function encodeCursor(values: Record<string, string | number | null>): string {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, string | number | null> {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string | number | null>;
    return {};
  } catch {
    return {};
  }
}

export function buildCursorPage<T>(
  items: T[],
  limit: number,
  cursorOf: (item: T) => Record<string, string | number | null>,
): CursorPage<T> {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const last = pageItems.at(-1);
  return {
    items: pageItems,
    pagination: {
      nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
      hasMore,
    },
  };
}
