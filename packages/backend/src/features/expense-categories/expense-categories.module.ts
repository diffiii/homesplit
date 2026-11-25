import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { StorageModule } from "@/storage/storage.module";
import { CategorySuggestionsService } from "./category-suggestions.service";
import { ExpenseCategoriesController } from "./expense-categories.controller";
import { ExpenseCategoriesService } from "./expense-categories.service";

@Module({
  imports: [AiModule, StorageModule],
  controllers: [ExpenseCategoriesController],
  providers: [ExpenseCategoriesService, CategorySuggestionsService],
  exports: [ExpenseCategoriesService],
})
export class ExpenseCategoriesModule {}
