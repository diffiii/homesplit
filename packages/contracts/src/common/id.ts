import { z } from "zod";

/** UUID entity identifier shared across domain contracts, normalized to lowercase. */
export const Id = z.uuid().toLowerCase();
export type Id = z.infer<typeof Id>;
