import { Module } from "@nestjs/common";
import { InMemoryObjectStorage } from "./in-memory-object-storage";
import { AVATAR_STORAGE, ObjectStorage } from "./object-storage";
import { S3ObjectStorage } from "./s3-object-storage";
import { loadStorageConfig } from "./storage.config";

/**
 * Provides `ObjectStorage` for attachments and `AVATAR_STORAGE` for avatars,
 * chosen by `STORAGE_DRIVER`.
 */
@Module({
  providers: [
    {
      provide: ObjectStorage,
      useFactory: (): ObjectStorage => {
        const config = loadStorageConfig();
        return config.driver === "memory"
          ? new InMemoryObjectStorage()
          : new S3ObjectStorage(config, config.bucket);
      },
    },
    {
      provide: AVATAR_STORAGE,
      useFactory: (): ObjectStorage => {
        const config = loadStorageConfig();
        return config.driver === "memory"
          ? new InMemoryObjectStorage("avatars.invalid")
          : new S3ObjectStorage(
              config,
              config.avatarBucket,
              config.avatarPublicUrl
            );
      },
    },
  ],
  exports: [ObjectStorage, AVATAR_STORAGE],
})
export class StorageModule {}
