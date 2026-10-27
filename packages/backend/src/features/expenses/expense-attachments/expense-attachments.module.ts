import { Module } from "@nestjs/common";
import { ExpenseAttachmentsController } from "./expense-attachments.controller";
import { ExpenseAttachmentsService } from "./expense-attachments.service";

@Module({
  controllers: [ExpenseAttachmentsController],
  providers: [ExpenseAttachmentsService],
})
export class ExpenseAttachmentsModule {}
