import {
  buildPath,
  type Endpoint,
  type EndpointName,
  type Endpoints,
  encodeQuery,
  endpoints,
  type PathParams,
  type QueryInput,
  type RequestBody,
  type ResponseBody,
} from "@homesplit/contracts";
import type { z } from "zod";
import { ApiRequestError } from "./api-error";
import { redirectToSignIn } from "./session";

/** What a call to endpoint `E` takes: exactly the params, query, and body it declares. */
export type EndpointInput<E extends Endpoint> = (E extends {
  params: z.ZodObject;
}
  ? { params: PathParams<E> }
  : { params?: never }) &
  (E extends { query: z.ZodObject }
    ? { query?: QueryInput<E> }
    : { query?: never }) &
  (E extends { body: z.ZodType } ? { body: RequestBody<E> } : { body?: never });

export type ApiInput<N extends EndpointName> = EndpointInput<Endpoints[N]>;
export type ApiResponse<N extends EndpointName> = ResponseBody<Endpoints[N]>;

/** The input argument may be left out when the endpoint needs neither params nor a body. */
export type ApiArgs<N extends EndpointName> =
  object extends ApiInput<N>
    ? [input?: ApiInput<N> & RequestOptions]
    : [input: ApiInput<N> & RequestOptions];

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  fetch?: typeof fetch;
  /** Called on a 401 from an `/api` route, before the error is thrown. */
  onUnauthenticated?: () => void;
}

export type ApiClient = <N extends EndpointName>(
  name: N,
  ...args: ApiArgs<N>
) => Promise<ApiResponse<N>>;

interface UntypedInput extends RequestOptions {
  body?: unknown;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

/**
 * Create a client that calls endpoints from the contracts map by name. Query
 * values go through the contract codecs, and success bodies are parsed with
 * the endpoint's response schema. Every failure throws an `ApiRequestError`.
 */
export function createApiClient({
  fetch: fetchImpl = (...args) => fetch(...args),
  onUnauthenticated,
}: ApiClientOptions = {}): ApiClient {
  return async (name, ...args) => {
    const endpoint: Endpoint = endpoints[name];
    const { params, query, body, signal } = (args[0] ?? {}) as UntypedInput;

    let response: Response;
    try {
      response = await fetchImpl(requestUrl(endpoint, params, query), {
        method: endpoint.method,
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin",
        signal,
      });
    } catch (error) {
      // TanStack Query cancels through the signal and expects the abort to propagate.
      if (signal?.aborted) {
        throw error;
      }
      throw ApiRequestError.network("api", error);
    }

    if (!response.ok) {
      if (response.status === 401) {
        onUnauthenticated?.();
      }
      throw ApiRequestError.fromBody(
        "api",
        response.status,
        await readJson(response),
        response.statusText
      );
    }
    return (await parseResponse(endpoint, response)) as ApiResponse<
      typeof name
    >;
  };
}

function requestUrl(
  endpoint: Endpoint,
  params: UntypedInput["params"],
  query: UntypedInput["query"]
): string {
  const path = (buildPath as (e: Endpoint, p?: unknown) => string)(
    endpoint,
    params
  );
  if (!(endpoint.query && query)) {
    return path;
  }
  const search = new URLSearchParams(
    encodeQuery(endpoint as Endpoint & { query: z.ZodObject }, query)
  ).toString();
  return search ? `${path}?${search}` : path;
}

async function parseResponse(
  endpoint: Endpoint,
  response: Response
): Promise<unknown> {
  if (endpoint.response === null) {
    return undefined;
  }
  const parsed = endpoint.response.safeParse(await readJson(response));
  if (!parsed.success) {
    throw ApiRequestError.invalidResponse("api", response.status, parsed.error);
  }
  return parsed.data;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Calls the application routes under `/api`; a 401 sends the user to sign-in. */
export const api = createApiClient({ onUnauthenticated: redirectToSignIn });
