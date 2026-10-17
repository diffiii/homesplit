import { type BeforeApplicationShutdown, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { AppController } from "./app.controller";
import { auth } from "./auth";
import { closeDb } from "./db";
import { ChoresModule } from "./features/chores/chores.module";
import { ExpenseCategoriesModule } from "./features/expense-categories/expense-categories.module";
import { ExpensesModule } from "./features/expenses/expenses.module";
import { HouseholdsModule } from "./features/households/households.module";

@Module({
  controllers: [AppController],
  imports: [
    // Browsers call the API through the frontend origin, never cross-origin.
    AuthModule.forRoot({ auth, disableTrustedOriginsCors: true }),
    HouseholdsModule,
    ExpenseCategoriesModule,
    ChoresModule,
    ExpensesModule,
  ],
})
export class AppModule implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(): Promise<void> {
    await closeDb();
  }
}
