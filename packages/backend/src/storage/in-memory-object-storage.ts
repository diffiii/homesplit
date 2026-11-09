import { type DownloadUrlOptions, ObjectStorage } from "./object-storage";

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

/**
 * Keeps objects in process memory, for tests. Its download and public URLs
 * point at a reserved `.invalid` host, so nothing can fetch them.
 */
export class InMemoryObjectStorage extends ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  private readonly baseUrl: string;

  constructor(host = "object-storage.invalid") {
    super();
    this.baseUrl = `https://${host}`;
  }

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
    return Promise.resolve();
  }

  get(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    return object
      ? Promise.resolve(Buffer.from(object.body))
      : Promise.reject(new Error(`No object ${key}`));
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  getDownloadUrl(
    key: string,
    { expiresInSeconds }: DownloadUrlOptions
  ): Promise<string> {
    const url = new URL(`${this.baseUrl}/${key}`);
    url.searchParams.set("expiresIn", String(expiresInSeconds));
    return Promise.resolve(url.toString());
  }

  getPublicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
