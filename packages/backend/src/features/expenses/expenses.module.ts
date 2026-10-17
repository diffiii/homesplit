import { Module } from "@nestjs/common";
import { SettlementsModule } from "./settlements/settlements.module";

/** Everything behind the `expenses` module flag. */
@Module({
  imports: [SettlementsModule],
})
export class ExpensesModule {}
