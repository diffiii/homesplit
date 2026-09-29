import { z } from "zod";

/** UUID entity identifier shared across domain contracts. */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;
