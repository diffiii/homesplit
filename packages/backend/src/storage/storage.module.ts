import { Module } from "@nestjs/common";
import { InMemoryObjectStorage } from "./in-memory-object-storage";
import { ObjectStorage } from "./object-storage";
import { S3ObjectStorage } from "./s3-object-storage";
import { loadStorageConfig } from "./storage.config";

/** Provides `ObjectStorage`, chosen by `STORAGE_DRIVER`. */
@Module({
  providers: [
    {
      provide: ObjectStorage,
      useFactory: (): ObjectStorage => {
        const config = loadStorageConfig();
        return config.driver === "memory"
          ? new InMemoryObjectStorage()
          : new S3ObjectStorage(config);
      },
    },
  ],
  exports: [ObjectStorage],
})
export class StorageModule {}
