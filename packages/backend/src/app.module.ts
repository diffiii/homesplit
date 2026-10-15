import { type BeforeApplicationShutdown, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { AppController } from "./app.controller";
import { auth } from "./auth";
import { closeDb } from "./db";
import { ExpenseCategoriesModule } from "./features/expense-categories/expense-categories.module";
import { HouseholdsModule } from "./features/households/households.module";
import { UsersModule } from "./features/users/users.module";

@Module({
  controllers: [AppController],
  imports: [
    // Browsers call the API through the frontend origin, never cross-origin.
    AuthModule.forRoot({ auth, disableTrustedOriginsCors: true }),
    HouseholdsModule,
    ExpenseCategoriesModule,
    UsersModule,
  ],
})
export class AppModule implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(): Promise<void> {
    await closeDb();
  }
}
