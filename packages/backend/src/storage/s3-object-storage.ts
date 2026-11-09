import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { type DownloadUrlOptions, ObjectStorage } from "./object-storage";
import type { S3StorageConfig } from "./storage.config";

/** Any S3-compatible service: AWS S3, MinIO, Cloudflare R2, and others. */
export class S3ObjectStorage extends ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl?: string;

  /** `publicUrl` serves the bucket without signing, for a public bucket. */
  constructor(config: S3StorageConfig, bucket: string, publicUrl?: string) {
    super();
    this.bucket = bucket;
    this.publicUrl = publicUrl;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
      // The SDK otherwise adds CRC32 checksums to every request, which not
      // every S3-compatible service accepts.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: contentType,
      })
    );
  }

  async get(key: string): Promise<Buffer> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    if (!Body) {
      throw new Error(`Object ${key} has no body`);
    }
    return Buffer.from(await Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }

  getDownloadUrl(
    key: string,
    { contentType, expiresInSeconds }: DownloadUrlOptions
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: "inline",
      }),
      { expiresIn: expiresInSeconds }
    );
  }

  getPublicUrl(key: string): string {
    if (!this.publicUrl) {
      throw new Error(`Bucket ${this.bucket} has no public URL`);
    }
    return `${this.publicUrl}/${key}`;
  }
}
