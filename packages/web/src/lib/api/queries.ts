import {
  type MutationFunctionContext,
  type QueryClient,
  type QueryKey,
  queryOptions,
} from "@tanstack/react-query";
import { type ApiArgs, type ApiResponse, api } from "./client";
import { type QueryEndpointName, queryKeys } from "./query-keys";

// The generic `N` can't satisfy the conditional input types, so calls inside
// `endpointQuery` go through these untyped views; its signature stays typed.
const callApi = api as <N extends QueryEndpointName>(
  name: N,
  input: object
) => Promise<ApiResponse<N>>;
const endpointKey = queryKeys.endpoint as (
  name: QueryEndpointName,
  input?: object
) => readonly unknown[];

/**
 * Query options for a read endpoint, keyed by `queryKeys.endpoint`:
 * `useQuery(endpointQuery("listChores", { params: { householdId } }))`.
 */
export function endpointQuery<N extends QueryEndpointName>(
  name: N,
  ...args: ApiArgs<N>
) {
  const [input] = args;
  return queryOptions({
    queryKey: endpointKey(name, input),
    queryFn: ({ signal }) => callApi(name, { ...input, signal }),
  });
}

/** Invalidate every query under each key; resolves once active ones have refetched. */
export async function invalidate(
  client: QueryClient,
  keys: readonly QueryKey[]
): Promise<void> {
  await Promise.all(
    keys.map((queryKey) => client.invalidateQueries({ queryKey }))
  );
}

/**
 * Apply `update` to every cached query under `queryKey`, after cancelling
 * their fetches so a late answer can't overwrite it. Returns a rollback that
 * restores the snapshot. Queries with no data yet are left alone.
 */
export async function updateQueries<T>(
  client: QueryClient,
  queryKey: QueryKey,
  update: (data: T) => T
): Promise<() => void> {
  await client.cancelQueries({ queryKey });
  const snapshot = client.getQueriesData<T>({ queryKey });
  client.setQueriesData<T>({ queryKey }, (data) =>
    data === undefined ? data : update(data)
  );
  return () => {
    for (const [key, data] of snapshot) {
      client.setQueryData(key, data);
    }
  };
}

export interface OptimisticOptions<TVariables, TData> {
  /** Queries to refetch once the mutation settles, besides `queryKey`. */
  invalidates?: (variables: TVariables) => readonly QueryKey[];
  /** Every cached query under this key gets `update`; keep it to one data shape. */
  queryKey: (variables: TVariables) => QueryKey;
  update: (data: TData, variables: TVariables) => TData;
}

interface OptimisticResult {
  rollback: () => void;
}

/**
 * `useMutation` callbacks for an optimistic update: patch the cache before the
 * request, restore it if the request fails, and refetch `queryKey` and
 * `invalidates` either way so the cache ends up matching the server.
 *
 * ```ts
 * useMutation({
 *   mutationFn: (item: ShoppingItem) => api("purchaseShoppingItem", { params: { householdId, itemId: item.id } }),
 *   ...optimistic({
 *     queryKey: () => queryKeys.endpoint("listShoppingItems", { params: { householdId } }),
 *     update: (list, item) => ({ items: list.items.map((i) => (i.id === item.id ? { ...i, purchased: true } : i)) }),
 *   }),
 * });
 * ```
 */
export function optimistic<TVariables, TData>({
  queryKey,
  update,
  invalidates,
}: OptimisticOptions<TVariables, TData>) {
  return {
    onMutate: async (
      variables: TVariables,
      { client }: MutationFunctionContext
    ): Promise<OptimisticResult> => ({
      rollback: await updateQueries<TData>(
        client,
        queryKey(variables),
        (data) => update(data, variables)
      ),
    }),
    onError: (
      _error: unknown,
      _variables: TVariables,
      result: OptimisticResult | undefined
    ) => {
      result?.rollback();
    },
    onSettled: (
      _data: unknown,
      _error: unknown,
      variables: TVariables,
      _result: OptimisticResult | undefined,
      { client }: MutationFunctionContext
    ) =>
      invalidate(client, [
        queryKey(variables),
        ...(invalidates?.(variables) ?? []),
      ]),
  };
}
