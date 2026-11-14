import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { StorageModule } from "@/storage/storage.module";
import { ReceiptsController } from "./receipts.controller";
import { ReceiptsService } from "./receipts.service";

@Module({
  imports: [AiModule, StorageModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
