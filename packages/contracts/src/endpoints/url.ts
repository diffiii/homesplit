import { z } from "zod";

import type { Endpoint, PathParams, QueryInput } from "./endpoint";

const PARAM_SEGMENT = /:(\w+)/g;

type PathParamsArgs<E extends Endpoint> = E extends { params: z.ZodObject }
  ? [params: PathParams<E>]
  : [];

/** Build a concrete path from an endpoint's template, URL-encoding every param. */
export function buildPath<E extends Endpoint>(
  endpoint: E,
  ...args: PathParamsArgs<E>
): string {
  const [values = {}] = args as [Record<string, unknown>?];
  return endpoint.path.replace(PARAM_SEGMENT, (_, name: string) => {
    const value = values[name];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Missing path param "${name}" for ${endpoint.path}`);
    }
    return encodeURIComponent(String(value));
  });
}

/**
 * Encode typed query values with the endpoint's query codecs into URL query strings,
 * ready for `new URLSearchParams(...)`. The backend decodes them with the same schema.
 */
export function encodeQuery<E extends Endpoint & { query: z.ZodObject }>(
  endpoint: E,
  query: QueryInput<E>
): Record<string, string> {
  const encoded = z.encode(endpoint.query.partial(), query) as Record<
    string,
    unknown
  >;
  const search: Record<string, string> = {};
  for (const [key, value] of Object.entries(encoded)) {
    if (value !== undefined) {
      search[key] = String(value);
    }
  }
  return search;
}
