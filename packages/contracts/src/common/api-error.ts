import { z } from "zod";

/** Standard API error payload returned by endpoints. */
export const ApiError = z.object({
  code: z.string().min(1),
  details: z.unknown().optional(),
  message: z.string().min(1),
});
export type ApiError = z.infer<typeof ApiError>;
