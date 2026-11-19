import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { ExpenseCategoriesModule } from "@/features/expense-categories/expense-categories.module";
import { StorageModule } from "@/storage/storage.module";
import { ReceiptConfirmationService } from "./receipt-confirmation.service";
import { ReceiptExtraction } from "./receipt-extraction";
import { ReceiptsController } from "./receipts.controller";
import { ReceiptsService } from "./receipts.service";

@Module({
  imports: [AiModule, StorageModule, ExpenseCategoriesModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptExtraction, ReceiptConfirmationService],
})
export class ReceiptsModule {}
