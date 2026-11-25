import {
  ATTACHMENT_UPLOAD_FIELD,
  type Attachment,
  type AttachmentDownload,
  endpoints,
  Id,
} from "@homesplit/contracts";
import {
  Controller,
  Inject,
  Param,
  ParseFilePipe,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ZodPipe } from "@/http/zod.pipe";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "../households/access/household.decorators";
import type { HouseholdContext } from "../households/access/household.guard";
import { attachmentsConfig } from "./attachments.config";
import { AttachmentsService, type FileUpload } from "./attachments.service";

/** The part of Express's response a redirect uses. */
interface RedirectResponse {
  redirect: (status: number, url: string) => void;
  setHeader: (name: string, value: string) => void;
}

@Controller()
export class AttachmentsController {
  private readonly attachments: AttachmentsService;

  constructor(@Inject(AttachmentsService) attachments: AttachmentsService) {
    this.attachments = attachments;
  }

  @HouseholdRoute(endpoints.uploadAttachment)
  // Runs after the guards, so only current members get to send a body. Multer
  // keeps the file in memory and answers 413 once it's over the limit.
  @UseInterceptors(
    FileInterceptor(ATTACHMENT_UPLOAD_FIELD, {
      limits: { fileSize: attachmentsConfig.maxBytes, files: 1, fields: 0 },
    })
  )
  upload(
    @CurrentHousehold() household: HouseholdContext,
    @UploadedFile(new ParseFilePipe()) file: FileUpload
  ): Promise<Attachment> {
    return this.attachments.upload(
      household.householdId,
      household.userId,
      file
    );
  }

  @HouseholdRoute(endpoints.getAttachmentDownload)
  getDownload(
    @CurrentHousehold() household: HouseholdContext,
    @Param("attachmentId", new ZodPipe(Id)) attachmentId: string
  ): Promise<AttachmentDownload> {
    return this.attachments.getDownload(household.householdId, attachmentId);
  }

  /** `@Res()` rather than `@Header()`, so errors don't get the cache header. */
  @HouseholdRoute(endpoints.getAttachmentThumbnail)
  async getThumbnail(
    @CurrentHousehold() household: HouseholdContext,
    @Param("attachmentId", new ZodPipe(Id)) attachmentId: string,
    @Res() response: RedirectResponse
  ): Promise<void> {
    const { url, maxAgeSeconds } = await this.attachments.getThumbnail(
      household.householdId,
      attachmentId
    );
    response.setHeader("Cache-Control", `private, max-age=${maxAgeSeconds}`);
    response.redirect(endpoints.getAttachmentThumbnail.status, url);
  }
}
