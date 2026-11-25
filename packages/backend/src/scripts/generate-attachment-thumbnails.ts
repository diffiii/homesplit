import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { AttachmentThumbnailsService } from "@/features/attachments/attachment-thumbnails.service";

/**
 * Makes thumbnails for images stored without one; see "Thumbnails" in
 * docs/api/attachments.md.
 */
async function generateAttachmentThumbnails(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });
  try {
    const result = await app.get(AttachmentThumbnailsService).backfill();
    new Logger("GenerateAttachmentThumbnails").log(JSON.stringify(result));
    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

generateAttachmentThumbnails();
