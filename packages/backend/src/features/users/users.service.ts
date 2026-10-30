import { randomUUID } from "node:crypto";
import type { UpdateProfileRequest, UserSummary } from "@homesplit/contracts";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { AppError, notFound } from "@/http/app-error";
import { AVATAR_STORAGE, type ObjectStorage } from "@/storage/object-storage";
import { encodeAvatar } from "./avatar-image";
import { userSummaryColumns } from "./user-projections";

/** The part of a multer file an upload uses. */
export interface FileUpload {
  buffer: Buffer;
}

const AVATAR_FILE_NAME = /^[0-9a-f-]{36}\.webp$/u;

const notOwnAvatar = (): AppError =>
  new AppError(400, "VALIDATION_ERROR", "Invalid request", {
    issues: [
      {
        path: ["imageUrl"],
        message:
          "Must be null or an avatar uploaded through PUT /api/me/avatar",
      },
    ],
  });

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly storage: ObjectStorage;

  constructor(@Inject(AVATAR_STORAGE) storage: ObjectStorage) {
    this.storage = storage;
  }

  updateProfile(
    userId: string,
    { name, imageUrl }: UpdateProfileRequest
  ): Promise<UserSummary> {
    if (imageUrl && !this.avatarKey(userId, imageUrl)) {
      throw notOwnAvatar();
    }
    return this.setProfile(userId, { name, image: imageUrl });
  }

  async uploadAvatar(userId: string, file: FileUpload): Promise<UserSummary> {
    const body = await encodeAvatar(file.buffer);
    const key = `${userId}/${randomUUID()}.webp`;
    await this.storage.put(key, body, "image/webp");
    return this.setProfile(userId, { image: this.storage.getPublicUrl(key) });
  }

  async deleteAvatar(userId: string): Promise<void> {
    await this.setProfile(userId, { image: null });
  }

  /** Updates the profile and deletes the avatar object it replaced, if any. */
  private async setProfile(
    userId: string,
    changes: { name?: string; image?: string | null }
  ): Promise<UserSummary> {
    const [previous] = await db
      .select({ image: user.image })
      .from(user)
      .where(eq(user.id, userId));
    const [row] = await db
      .update(user)
      .set(changes)
      .where(eq(user.id, userId))
      .returning(userSummaryColumns);
    if (!row) {
      throw notFound();
    }
    const replacedKey =
      changes.image !== undefined && previous?.image !== changes.image
        ? this.avatarKey(userId, previous?.image)
        : undefined;
    if (replacedKey) {
      // The profile is already updated, so a failure only leaves the object.
      await this.storage.delete(replacedKey).catch((error: unknown) => {
        this.logger.warn(`Couldn't delete avatar ${replacedKey}: ${error}`);
      });
    }
    return row;
  }

  /**
   * The key of an avatar this user uploaded, or `undefined` for any other URL,
   * including another user's avatar, which deleting would otherwise remove.
   */
  private avatarKey(userId: string, url?: string | null): string | undefined {
    const prefix = `${userId}/`;
    const publicPrefix = this.storage.getPublicUrl(prefix);
    const fileName = url?.startsWith(publicPrefix)
      ? url.slice(publicPrefix.length)
      : "";
    return AVATAR_FILE_NAME.test(fileName) ? `${prefix}${fileName}` : undefined;
  }
}
