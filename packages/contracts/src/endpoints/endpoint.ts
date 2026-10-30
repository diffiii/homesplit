import type { z } from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type EndpointResult =
  | { readonly status: 200 | 201; readonly response: z.ZodType }
  | { readonly status: 204; readonly response: null };

/** One application route: its path template, request schemas, and success response. */
export type Endpoint = {
  readonly method: HttpMethod;
  /** Path template whose `:name` segments match the keys of `params`. */
  readonly path: `/api/${string}`;
  readonly params?: z.ZodObject;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
} & EndpointResult;

/** Params accepted by `buildPath`, before parsing. */
export type PathParams<E extends Endpoint> = E extends {
  params: infer P extends z.ZodObject;
}
  ? z.input<P>
  : never;

/**
 * Typed query values for `encodeQuery`. Omitted keys are left out of the query
 * string; the backend applies schema defaults when it parses the request.
 */
export type QueryInput<E extends Endpoint> = E extends {
  query: infer Q extends z.ZodObject;
}
  ? Partial<z.output<Q>>
  : never;

/** Request body a client sends, before parsing. */
export type RequestBody<E extends Endpoint> = E extends {
  body: infer B extends z.ZodType;
}
  ? z.input<B>
  : never;

/** Parsed success response; `undefined` for 204 routes. */
export type ResponseBody<E extends Endpoint> = E extends {
  response: infer R extends z.ZodType;
}
  ? z.output<R>
  : undefined;
