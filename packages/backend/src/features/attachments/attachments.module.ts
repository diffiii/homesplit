import { Module } from "@nestjs/common";
import { StorageModule } from "@/storage/storage.module";
import { HouseholdsModule } from "../households/households.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { AttachmentsCleanupService } from "./attachments-cleanup.service";

@Module({
  imports: [HouseholdsModule, StorageModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsCleanupService],
  exports: [AttachmentsService, AttachmentsCleanupService],
})
export class AttachmentsModule {}
