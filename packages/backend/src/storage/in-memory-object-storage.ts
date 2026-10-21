import { type DownloadUrlOptions, ObjectStorage } from "./object-storage";

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

/**
 * Keeps objects in process memory, for tests. Its download URLs point at a
 * reserved `.invalid` host, so nothing can fetch them.
 */
export class InMemoryObjectStorage extends ObjectStorage {
  readonly objects = new Map<string, StoredObject>();

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  getDownloadUrl(
    key: string,
    { expiresInSeconds }: DownloadUrlOptions
  ): Promise<string> {
    const url = new URL(`https://object-storage.invalid/${key}`);
    url.searchParams.set("expiresIn", String(expiresInSeconds));
    return Promise.resolve(url.toString());
  }
}
