import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { AttachmentsCleanupService } from "@/features/attachments/attachments-cleanup.service";

/** One cleanup pass; see "Cleanup" in docs/api/attachments.md. */
async function cleanUpAttachments(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });
  try {
    const result = await app.get(AttachmentsCleanupService).run();
    new Logger("CleanUpAttachments").log(JSON.stringify(result));
    if (result.failedObjects > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

cleanUpAttachments();
