import { Module } from "@nestjs/common";
import { StorageModule } from "@/storage/storage.module";
import { HouseholdsModule } from "../households/households.module";
import { AttachmentThumbnailsService } from "./attachment-thumbnails.service";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { AttachmentsCleanupService } from "./attachments-cleanup.service";

@Module({
  imports: [HouseholdsModule, StorageModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    AttachmentsCleanupService,
    AttachmentThumbnailsService,
  ],
  exports: [
    AttachmentsService,
    AttachmentsCleanupService,
    AttachmentThumbnailsService,
  ],
})
export class AttachmentsModule {}
