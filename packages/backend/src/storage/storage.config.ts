import { z } from "zod";

const TRAILING_SLASHES = /\/+$/;

/** Unset and empty variables both mean "use the default". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional()
  );

const S3Config = z
  .object({
    S3_BUCKET: z.string().min(1),
    S3_REGION: optional(z.string().min(1)).default("us-east-1"),
    S3_ENDPOINT: optional(z.url()),
    S3_FORCE_PATH_STYLE: optional(z.stringbool()).default(false),
    S3_ACCESS_KEY_ID: optional(z.string().min(1)),
    S3_SECRET_ACCESS_KEY: optional(z.string().min(1)),
    S3_AVATAR_BUCKET: z.string().min(1),
    S3_AVATAR_PUBLIC_URL: z
      .url({ protocol: /^https?$/ })
      .transform((url) => url.replace(TRAILING_SLASHES, "")),
  })
  .refine(
    (env) =>
      (env.S3_ACCESS_KEY_ID === undefined) ===
      (env.S3_SECRET_ACCESS_KEY === undefined),
    {
      message: "Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither",
    }
  );

const StorageDriver = optional(z.enum(["s3", "memory"])).default("s3");

export interface S3StorageConfig {
  accessKeyId?: string;
  /** Bucket anyone can read, for avatars. */
  avatarBucket: string;
  /** Serves `avatarBucket` without signing; no trailing slash. */
  avatarPublicUrl: string;
  /** Private bucket for attachments. */
  bucket: string;
  /** Unset for AWS; the service's URL for MinIO, R2, and others. */
  endpoint?: string;
  forcePathStyle: boolean;
  region: string;
  secretAccessKey?: string;
}

export type StorageConfig =
  | { driver: "memory" }
  | ({ driver: "s3" } & S3StorageConfig);

export function loadStorageConfig(
  env: NodeJS.ProcessEnv = process.env
): StorageConfig {
  const driver = parseEnv(StorageDriver, env.STORAGE_DRIVER);
  if (driver === "memory") {
    return { driver };
  }
  const s3 = parseEnv(S3Config, env);
  return {
    driver,
    bucket: s3.S3_BUCKET,
    avatarBucket: s3.S3_AVATAR_BUCKET,
    avatarPublicUrl: s3.S3_AVATAR_PUBLIC_URL,
    region: s3.S3_REGION,
    endpoint: s3.S3_ENDPOINT,
    forcePathStyle: s3.S3_FORCE_PATH_STYLE,
    accessKeyId: s3.S3_ACCESS_KEY_ID,
    secretAccessKey: s3.S3_SECRET_ACCESS_KEY,
  };
}

function parseEnv<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid object storage config: ${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}
