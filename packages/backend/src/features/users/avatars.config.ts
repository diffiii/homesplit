import { DEFAULT_AVATAR_MAX_BYTES } from "@homesplit/contracts";
import { z } from "zod";

const AvatarsEnv = z.object({
  AVATAR_MAX_BYTES: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(1).default(DEFAULT_AVATAR_MAX_BYTES)
  ),
});

const env = AvatarsEnv.safeParse(process.env);

if (!env.success) {
  throw new Error(`Invalid avatars config: ${z.prettifyError(env.error)}`);
}

export const avatarsConfig = {
  /** Largest image an upload accepts, before re-encoding. */
  maxBytes: env.data.AVATAR_MAX_BYTES,
} as const;
