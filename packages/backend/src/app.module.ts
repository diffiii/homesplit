import { type BeforeApplicationShutdown, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { AppController } from "./app.controller";
import { auth } from "./auth";
import { closeDb } from "./db";

@Module({
  controllers: [AppController],
  imports: [AuthModule.forRoot({ auth })],
})
export class AppModule implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(): Promise<void> {
    await closeDb();
  }
}
