import {
  ATTACHMENT_MIME_TYPES,
  ATTACHMENT_UPLOAD_FIELD,
} from "@homesplit/contracts";
import { ATTACHMENT_MAX_BYTES, attachmentTypeOf } from "@/lib/attachments";
import { now } from "../db";
import type { MockRoutes } from "../routes";
import { uploadedFile } from "./shared";

export const attachmentRoutes: MockRoutes = {
  uploadAttachment: {
    // Nothing is stored yet, so the attachment can't be downloaded or linked.
    resolve: ({ db, form, household, userId }) => {
      const { file, type } = uploadedFile(form, ATTACHMENT_UPLOAD_FIELD, {
        allowed: ATTACHMENT_MIME_TYPES,
        maxBytes: ATTACHMENT_MAX_BYTES,
        typeOf: attachmentTypeOf,
      });
      return {
        id: crypto.randomUUID(),
        householdId: household.id,
        mimeType: type,
        sizeBytes: file.size,
        uploadedBy: db.summary(userId),
        createdAt: now(),
      };
    },
  },
};
