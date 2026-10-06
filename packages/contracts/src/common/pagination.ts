import { z } from "zod";

import { queryInt } from "./query";

/**
 * Build offset pagination query schema; override defaults per endpoint.
 * Wire decoder: input is raw URL query strings, output is decoded numbers.
 */
export const pagination = (opts?: { defaultSize?: number; max?: number }) =>
  z.object({
    page: queryInt(z.int().min(1)).default(1),
    pageSize: queryInt(
      z
        .int()
        .min(1)
        .max(opts?.max ?? 100)
    ).default(opts?.defaultSize ?? 20),
  });

/** Default offset pagination query parameters for list endpoints. */
export const Pagination = pagination();
export type Pagination = z.infer<typeof Pagination>;

/** Build a paginated list response schema for a given item schema. */
export const paginatedResponse = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    page: z.int().min(1),
    pageSize: z.int().min(1),
    totalItems: z.int().nonnegative(),
  });
