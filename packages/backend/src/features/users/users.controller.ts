import {
  AVATAR_UPLOAD_FIELD,
  endpoints,
  UpdateProfileRequest,
  type UserSummary,
} from "@homesplit/contracts";
import {
  Body,
  Controller,
  Inject,
  ParseFilePipe,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { PatchPipe } from "@/http/patch.pipe";
import { Route } from "@/route.decorator";
import { avatarsConfig } from "./avatars.config";
import { type FileUpload, UsersService } from "./users.service";

@Controller()
export class UsersController {
  private readonly users: UsersService;

  constructor(@Inject(UsersService) users: UsersService) {
    this.users = users;
  }

  @Route(endpoints.updateProfile)
  updateProfile(
    @Session() session: UserSession,
    @Body(new PatchPipe(UpdateProfileRequest)) body: UpdateProfileRequest
  ): Promise<UserSummary> {
    return this.users.updateProfile(session.user.id, body);
  }

  @Route(endpoints.uploadAvatar)
  // Multer keeps the file in memory and answers 413 once it's over the limit.
  @UseInterceptors(
    FileInterceptor(AVATAR_UPLOAD_FIELD, {
      limits: { fileSize: avatarsConfig.maxBytes, files: 1, fields: 0 },
    })
  )
  uploadAvatar(
    @Session() session: UserSession,
    @UploadedFile(new ParseFilePipe()) file: FileUpload
  ): Promise<UserSummary> {
    return this.users.uploadAvatar(session.user.id, file);
  }

  @Route(endpoints.deleteAvatar)
  deleteAvatar(@Session() session: UserSession): Promise<void> {
    return this.users.deleteAvatar(session.user.id);
  }
}
