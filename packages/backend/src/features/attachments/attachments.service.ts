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
import { attachments } from "@/db/schema";
import { AppError, notFound } from "@/http/app-error";
import { ObjectStorage } from "@/storage/object-storage";
import { AttachmentThumbnailsService } from "./attachment-thumbnails.service";
import { attachmentsConfig } from "./attachments.config";
import { discardObject } from "./discard-object";
import { THUMBNAIL_MIME_TYPE } from "./thumbnail-image";

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
  private readonly thumbnails: AttachmentThumbnailsService;

  constructor(
    @Inject(ObjectStorage) storage: ObjectStorage,
    @Inject(AttachmentThumbnailsService)
    thumbnails: AttachmentThumbnailsService
  ) {
    this.storage = storage;
    this.thumbnails = thumbnails;
  }

  /**
   * Stores the file and its thumbnail before inserting the row, so a failed
   * storage write leaves no row behind.
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
    const thumbnailStorageKey = await this.thumbnails.create(
      householdId,
      id,
      file.buffer,
      mimeType
    );

    try {
      await db.insert(attachments).values({
        id,
        householdId,
        storageKey,
        thumbnailStorageKey,
        mimeType,
        sizeBytes: file.buffer.length,
        uploadedById: uploaderId,
      });
    } catch (error) {
      await Promise.all(
        [storageKey, thumbnailStorageKey]
          .filter((key) => key !== null)
          .map((key) => discardObject(this.storage, key, this.logger))
      );
      throw error;
    }

    return this.getById(householdId, id);
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
      hasThumbnail: row.thumbnailStorageKey !== null,
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
    const row = await this.findStored(householdId, attachmentId);
    const { url, expiresAt } = await this.sign(row.storageKey, row.mimeType);
    return { url, expiresAt: expiresAt.toISOString() };
  }

  /**
   * A signed URL of the thumbnail, and how long a browser may cache the
   * redirect to it: no longer than the URL works. 404 without a thumbnail.
   */
  async getThumbnail(
    householdId: string,
    attachmentId: string
  ): Promise<{ url: string; maxAgeSeconds: number }> {
    const { thumbnailStorageKey } = await this.findStored(
      householdId,
      attachmentId
    );
    if (!thumbnailStorageKey) {
      throw notFound();
    }
    const { url, expiresAt } = await this.sign(
      thumbnailStorageKey,
      THUMBNAIL_MIME_TYPE
    );
    const maxAgeSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    return { url, maxAgeSeconds: Math.max(0, maxAgeSeconds) };
  }

  private async findStored(householdId: string, attachmentId: string) {
    const [row] = await db
      .select({
        storageKey: attachments.storageKey,
        thumbnailStorageKey: attachments.thumbnailStorageKey,
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
    return row;
  }

  private async sign(
    storageKey: string,
    contentType: string
  ): Promise<{ url: string; expiresAt: Date }> {
    const expiresInSeconds = attachmentsConfig.downloadUrlTtlSeconds;
    // Taken before signing, so the URL stays valid at least until `expiresAt`.
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const url = await this.storage.getDownloadUrl(storageKey, {
      contentType,
      expiresInSeconds,
    });
    return { url, expiresAt };
  }
}
