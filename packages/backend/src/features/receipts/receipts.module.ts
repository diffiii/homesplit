import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { ExpenseCategoriesModule } from "@/features/expense-categories/expense-categories.module";
import { ShoppingModule } from "@/features/shopping/shopping.module";
import { StorageModule } from "@/storage/storage.module";
import { ReceiptConfirmationService } from "./receipt-confirmation.service";
import { ReceiptExtraction } from "./receipt-extraction";
import { ReceiptShoppingService } from "./receipt-shopping.service";
import { ReceiptsController } from "./receipts.controller";
import { ReceiptsService } from "./receipts.service";

@Module({
  imports: [AiModule, StorageModule, ExpenseCategoriesModule, ShoppingModule],
  controllers: [ReceiptsController],
  providers: [
    ReceiptsService,
    ReceiptExtraction,
    ReceiptConfirmationService,
    ReceiptShoppingService,
  ],
})
export class ReceiptsModule {}
