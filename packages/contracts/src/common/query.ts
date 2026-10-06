import { z } from "zod";

const DIGITS = /^\d+$/;

/**
 * Integer from a URL query value, only digits are accepted.
 */
export const queryInt = (out: z.ZodInt) =>
  z.codec(z.string().regex(DIGITS), out, { decode: Number, encode: String });

/** Boolean from a URL query value; only "true" and "false" are accepted. */
export const queryBoolean = () =>
  z.stringbool({ truthy: ["true"], falsy: ["false"], case: "sensitive" });
