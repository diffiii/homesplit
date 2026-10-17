import { Module } from "@nestjs/common";
import { ExpenseEntriesModule } from "./expenses/expenses.module";
import { SettlementsModule } from "./settlements/settlements.module";

/** Everything behind the `expenses` module flag. */
@Module({
  imports: [ExpenseEntriesModule, SettlementsModule],
})
export class ExpensesModule {}
