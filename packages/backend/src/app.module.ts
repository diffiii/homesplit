import { type BeforeApplicationShutdown, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { AiModule } from "./ai/ai.module";
import { AppController } from "./app.controller";
import { auth } from "./auth";
import { closeDb } from "./db";
import { AttachmentsModule } from "./features/attachments/attachments.module";
import { ChoresModule } from "./features/chores/chores.module";
import { ExpenseCategoriesModule } from "./features/expense-categories/expense-categories.module";
import { ExpensesModule } from "./features/expenses/expenses.module";
import { FriendsModule } from "./features/friends/friends.module";
import { HouseholdsModule } from "./features/households/households.module";
import { ShoppingModule } from "./features/shopping/shopping.module";
import { UsersModule } from "./features/users/users.module";

@Module({
  controllers: [AppController],
  imports: [
    // Browsers call the API through the frontend origin, never cross-origin.
    AuthModule.forRoot({ auth, disableTrustedOriginsCors: true }),
    AiModule,
    HouseholdsModule,
    ExpenseCategoriesModule,
    ChoresModule,
    ExpensesModule,
    AttachmentsModule,
    FriendsModule,
    ShoppingModule,
    UsersModule,
  ],
})
export class AppModule implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(): Promise<void> {
    await closeDb();
  }
}
