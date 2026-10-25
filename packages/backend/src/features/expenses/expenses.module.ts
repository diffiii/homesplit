import { Module } from "@nestjs/common";
import { BalancesModule } from "./balances/balances.module";
import { ExpenseAttachmentsModule } from "./expense-attachments/expense-attachments.module";
import { ExpenseEntriesModule } from "./expenses/expenses.module";
import { SettlementsModule } from "./settlements/settlements.module";

/** Everything behind the `expenses` module flag. */
@Module({
  imports: [
    ExpenseEntriesModule,
    ExpenseAttachmentsModule,
    SettlementsModule,
    BalancesModule,
  ],
})
export class ExpensesModule {}
