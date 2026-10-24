import { randomUUID } from "node:crypto";
import {
  ATTACHMENT_MIME_TYPES,
  type Attachment,
  type AttachmentDownload,
  AttachmentMimeType,
} from "@homesplit/contracts";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@/db";
import { attachments, storageObjectDeletions } from "@/db/schema";
import { AppError, notFound } from "@/http/app-error";
import { ObjectStorage } from "@/storage/object-storage";
import { attachmentsConfig } from "./attachments.config";

/** The part of a multer file an upload uses. */
export interface FileUpload {
  buffer: Buffer;
}

const unsupportedType = (): AppError =>
  new AppError(415, "UNSUPPORTED_FILE_TYPE", "Unsupported file type", {
    allowed: ATTACHMENT_MIME_TYPES,
  });

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly storage: ObjectStorage;

  constructor(@Inject(ObjectStorage) storage: ObjectStorage) {
    this.storage = storage;
  }

  /**
   * Stores the object first and inserts the row only once it's stored, so a
   * failed storage write leaves no row behind.
   */
  async upload(
    householdId: string,
    uploaderId: string,
    file: FileUpload
  ): Promise<Attachment> {
    // Detected from the content; the type the client declared is ignored.
    // Malformed content can make the detector throw, which is a bad file too.
    const detected = await fileTypeFromBuffer(file.buffer).catch(
      () => undefined
    );
    const parsed = AttachmentMimeType.safeParse(detected?.mime);
    if (!parsed.success) {
      throw unsupportedType();
    }
    const mimeType = parsed.data;

    const id = randomUUID();
    const storageKey = `households/${householdId}/attachments/${id}`;
    await this.storage.put(storageKey, file.buffer, mimeType);

    try {
      await db.insert(attachments).values({
        id,
        householdId,
        storageKey,
        mimeType,
        sizeBytes: file.buffer.length,
        uploadedById: uploaderId,
      });
    } catch (error) {
      await this.discardObject(storageKey);
      throw error;
    }

    return this.getById(householdId, id);
  }

  /**
   * Deletes an object whose row couldn't be inserted. If that fails too, the
   * key goes to the cleanup queue, so the object isn't left behind for good.
   */
  private async discardObject(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch {
      await db
        .insert(storageObjectDeletions)
        .values({ storageKey })
        .onConflictDoNothing()
        .catch((error: unknown) => {
          this.logger.warn(
            `Left object ${storageKey} without a row: ${String(error)}`
          );
        });
    }
  }

  async getById(
    householdId: string,
    attachmentId: string
  ): Promise<Attachment> {
    const row = await db.query.attachments.findFirst({
      where: and(
        eq(attachments.id, attachmentId),
        eq(attachments.householdId, householdId)
      ),
      with: { uploadedBy: { columns: { id: true, name: true, image: true } } },
    });
    if (!row) {
      throw notFound();
    }
    return {
      id: row.id,
      householdId: row.householdId,
      mimeType: AttachmentMimeType.parse(row.mimeType),
      sizeBytes: row.sizeBytes,
      uploadedBy: {
        id: row.uploadedBy.id,
        name: row.uploadedBy.name,
        imageUrl: row.uploadedBy.image ?? null,
      },
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getDownload(
    householdId: string,
    attachmentId: string
  ): Promise<AttachmentDownload> {
    const [row] = await db
      .select({
        storageKey: attachments.storageKey,
        mimeType: attachments.mimeType,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.id, attachmentId),
          eq(attachments.householdId, householdId)
        )
      )
      .limit(1);
    if (!row) {
      throw notFound();
    }

    const expiresInSeconds = attachmentsConfig.downloadUrlTtlSeconds;
    // Taken before signing, so the URL stays valid at least until `expiresAt`.
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const url = await this.storage.getDownloadUrl(row.storageKey, {
      contentType: row.mimeType,
      expiresInSeconds,
    });
    return { url, expiresAt: expiresAt.toISOString() };
  }
}
