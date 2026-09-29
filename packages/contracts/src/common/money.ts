import { z } from "zod";

/** Monetary amount in minor units (e.g. cents) plus ISO 4217 currency. */
export const Money = z.object({
  amountCents: z.int().nonnegative(),
  currency: z.currencyCode(),
});
export type Money = z.infer<typeof Money>;
