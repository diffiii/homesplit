import type { Logger } from "@nestjs/common";
import { db } from "@/db";
import { storageObjectDeletions } from "@/db/schema";
import type { ObjectStorage } from "@/storage/object-storage";

/**
 * Deletes a stored object that no row references, such as one whose row
 * couldn't be inserted. If that fails too, the key goes to the cleanup queue,
 * so the object isn't left behind for good.
 */
export async function discardObject(
  storage: ObjectStorage,
  storageKey: string,
  logger: Logger
): Promise<void> {
  try {
    await storage.delete(storageKey);
  } catch {
    await db
      .insert(storageObjectDeletions)
      .values({ storageKey })
      .onConflictDoNothing()
      .catch((error: unknown) => {
        logger.warn(
          `Left object ${storageKey} without a row: ${String(error)}`
        );
      });
  }
}
