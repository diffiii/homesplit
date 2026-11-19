import {
  ATTACHMENT_MIME_TYPES,
  AttachmentMimeType,
} from "@homesplit/contracts";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { ObjectStorage } from "@/storage/object-storage";
import { discardObject } from "./discard-object";
import { encodeThumbnail, THUMBNAIL_MIME_TYPE } from "./thumbnail-image";

const IMAGE_TYPES: readonly AttachmentMimeType[] = ATTACHMENT_MIME_TYPES.filter(
  (type) => type !== "application/pdf"
);

/** Small, since a decoded 48 MP HEIC alone takes about 190 MB. */
const BACKFILL_BATCH_SIZE = 10;

/**
 * The same key on every write, so a backfill run overwrites what an earlier
 * failed write left behind.
 */
const thumbnailStorageKey = (householdId: string, attachmentId: string) =>
  `households/${householdId}/attachment-thumbnails/${attachmentId}.webp`;

export interface ThumbnailBackfillResult {
  /** Images whose original couldn't be read or thumbnail stored; tried again next run. */
  failed: number;
  generated: number;
  /** Images that can't be decoded; tried again next run. */
  undecodable: number;
}

type ImageRow = Pick<
  typeof attachments.$inferSelect,
  "id" | "householdId" | "storageKey" | "mimeType"
>;

@Injectable()
export class AttachmentThumbnailsService {
  private readonly logger = new Logger(AttachmentThumbnailsService.name);
  private readonly storage: ObjectStorage;

  constructor(@Inject(ObjectStorage) storage: ObjectStorage) {
    this.storage = storage;
  }

  /**
   * Stores the thumbnail of an uploaded image and returns its key. Never
   * throws: a PDF, or an image that can't be decoded or stored, gets none.
   */
  async create(
    householdId: string,
    attachmentId: string,
    content: Buffer,
    mimeType: AttachmentMimeType
  ): Promise<string | null> {
    if (!IMAGE_TYPES.includes(mimeType)) {
      return null;
    }
    const key = thumbnailStorageKey(householdId, attachmentId);
    try {
      const thumbnail = await encodeThumbnail(content, mimeType);
      await this.storage.put(key, thumbnail, THUMBNAIL_MIME_TYPE);
      return key;
    } catch (error) {
      this.logger.warn(
        `Stored attachment ${attachmentId} without a thumbnail: ${String(error)}`
      );
      await this.removeUnlinked(key);
      return null;
    }
  }

  /**
   * Makes thumbnails for images stored without one, such as those uploaded
   * before thumbnails existed. Safe to repeat and to run alongside uploads
   * and cleanup.
   */
  backfill(): Promise<ThumbnailBackfillResult> {
    return this.backfillAfter(undefined, {
      generated: 0,
      undecodable: 0,
      failed: 0,
    });
  }

  /** Keyset pages by ID, so an image that keeps failing doesn't stop the rest. */
  private async backfillAfter(
    after: string | undefined,
    result: ThumbnailBackfillResult
  ): Promise<ThumbnailBackfillResult> {
    const batch = await db
      .select({
        id: attachments.id,
        householdId: attachments.householdId,
        storageKey: attachments.storageKey,
        mimeType: attachments.mimeType,
      })
      .from(attachments)
      .where(
        and(
          isNull(attachments.thumbnailStorageKey),
          inArray(attachments.mimeType, IMAGE_TYPES),
          after === undefined ? undefined : gt(attachments.id, after)
        )
      )
      .orderBy(asc(attachments.id))
      .limit(BACKFILL_BATCH_SIZE);
    await this.backfillEach(batch, result);
    const last = batch.at(-1);
    return batch.length === BACKFILL_BATCH_SIZE && last
      ? this.backfillAfter(last.id, result)
      : result;
  }

  /** One image at a time, to bound memory. */
  private async backfillEach(
    [row, ...rest]: ImageRow[],
    result: ThumbnailBackfillResult
  ): Promise<void> {
    if (!row) {
      return;
    }
    const outcome = await this.backfillOne(row).catch((error: unknown) => {
      this.logger.warn(
        `Couldn't make a thumbnail for attachment ${row.id}: ${String(error)}`
      );
      return "failed" as const;
    });
    if (outcome !== "deleted") {
      result[outcome] += 1;
    }
    await this.backfillEach(rest, result);
  }

  private async backfillOne(
    row: ImageRow
  ): Promise<keyof ThumbnailBackfillResult | "deleted"> {
    const mimeType = AttachmentMimeType.parse(row.mimeType);
    const content = await this.storage.get(row.storageKey);
    const thumbnail = await encodeThumbnail(content, mimeType).catch(
      (error: unknown) => {
        this.logger.warn(
          `Attachment ${row.id} can't be decoded as ${mimeType}: ${String(error)}`
        );
      }
    );
    if (!thumbnail) {
      return "undecodable";
    }
    const key = thumbnailStorageKey(row.householdId, row.id);
    try {
      await this.storage.put(key, thumbnail, THUMBNAIL_MIME_TYPE);
    } catch (error) {
      await this.removeUnlinked(key);
      throw error;
    }
    // If this throws, the object stays and the next run links it.
    if (!(await this.link(row.id, key))) {
      // The row was deleted meanwhile, and its trigger couldn't queue this object.
      await discardObject(this.storage, key, this.logger);
      return "deleted";
    }
    return "generated";
  }

  /**
   * Sets the key unless the row is gone. A concurrent run may have set the
   * same key already.
   */
  private async link(attachmentId: string, key: string): Promise<boolean> {
    const updated = await db
      .update(attachments)
      .set({ thumbnailStorageKey: key })
      .where(
        and(
          eq(attachments.id, attachmentId),
          or(
            isNull(attachments.thumbnailStorageKey),
            eq(attachments.thumbnailStorageKey, key)
          )
        )
      )
      .returning({ id: attachments.id });
    return updated.length > 0;
  }

  /**
   * Deletes a thumbnail whose write failed but may have landed. It isn't
   * queued if that fails too, since cleanup could then delete it after a
   * later backfill run links the same key; that run overwrites it instead.
   */
  private async removeUnlinked(key: string): Promise<void> {
    await this.storage.delete(key).catch((error: unknown) => {
      this.logger.warn(`Left object ${key} without a row: ${String(error)}`);
    });
  }
}
