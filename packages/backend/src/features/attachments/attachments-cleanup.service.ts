import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, eq, gt, lt, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { attachments, storageObjectDeletions } from "@/db/schema";
import { ObjectStorage } from "@/storage/object-storage";
import { attachmentsConfig } from "./attachments.config";

/**
 * Conditions that keep an attachment alive, each a `NOT EXISTS` over a table
 * that references it. Nothing references attachments yet: #45 adds expense
 * links and #55 receipts, and each adds its condition here.
 */
const UNREFERENCED: SQL[] = [];

const BATCH_SIZE = 100;

export interface CleanupResult {
  /** Attachment rows deleted because nothing referenced them in time. */
  deletedAttachments: number;
  /** Objects deleted from storage because their row was gone. */
  deletedObjects: number;
  /** Queued objects whose deletion failed and will be retried next run. */
  failedObjects: number;
}

@Injectable()
export class AttachmentsCleanupService {
  private readonly logger = new Logger(AttachmentsCleanupService.name);
  private readonly storage: ObjectStorage;

  constructor(@Inject(ObjectStorage) storage: ObjectStorage) {
    this.storage = storage;
  }

  /**
   * Deletes attachments that nothing references and that are older than the
   * configured TTL, then deletes every object whose row is gone. Safe to run
   * concurrently and to re-run after a failure.
   */
  async run(now = new Date()): Promise<CleanupResult> {
    const deletedAttachments = await this.deleteUnreferenced(now);
    const { deleted, failed } = await this.deleteQueuedObjects();
    return {
      deletedAttachments,
      deletedObjects: deleted,
      failedObjects: failed,
    };
  }

  private async deleteUnreferenced(now: Date): Promise<number> {
    const cutoff = new Date(
      now.getTime() - attachmentsConfig.unreferencedTtlHours * 60 * 60 * 1000
    );
    // The `AFTER DELETE` trigger queues each row's object.
    const deleted = await db
      .delete(attachments)
      .where(and(lt(attachments.createdAt, cutoff), ...UNREFERENCED))
      .returning({ id: attachments.id });
    return deleted.length;
  }

  /** Works through the queue in key order, one batch at a time. */
  private async deleteQueuedObjects(
    after = ""
  ): Promise<{ deleted: number; failed: number }> {
    const batch = await db
      .select({ storageKey: storageObjectDeletions.storageKey })
      .from(storageObjectDeletions)
      .where(gt(storageObjectDeletions.storageKey, after))
      .orderBy(asc(storageObjectDeletions.storageKey))
      .limit(BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(({ storageKey }) => this.deleteObject(storageKey))
    );
    const failed = results.filter(({ status }) => status === "rejected").length;
    const last = batch.at(-1);
    if (batch.length < BATCH_SIZE || !last) {
      return { deleted: batch.length - failed, failed };
    }
    const rest = await this.deleteQueuedObjects(last.storageKey);
    return {
      deleted: batch.length - failed + rest.deleted,
      failed: failed + rest.failed,
    };
  }

  /** Dequeues the key only once the object is gone. */
  private async deleteObject(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.warn(
        `Couldn't delete object ${storageKey}: ${String(error)}`
      );
      throw error;
    }
    await db
      .delete(storageObjectDeletions)
      .where(eq(storageObjectDeletions.storageKey, storageKey));
  }
}
