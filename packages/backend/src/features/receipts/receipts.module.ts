import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { StorageModule } from "@/storage/storage.module";
import { ReceiptExtraction } from "./receipt-extraction";
import { ReceiptsController } from "./receipts.controller";
import { ReceiptsService } from "./receipts.service";

@Module({
  imports: [AiModule, StorageModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptExtraction],
})
export class ReceiptsModule {}
