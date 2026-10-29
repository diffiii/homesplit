import {
  ATTACHMENT_MIME_TYPES,
  ATTACHMENT_UPLOAD_FIELD,
} from "@homesplit/contracts";
import { ATTACHMENT_MAX_BYTES, attachmentTypeOf } from "@/lib/attachments";
import { now } from "../db";
import { MockApiError, validationError } from "../errors";
import type { MockRoutes } from "../routes";

export const attachmentRoutes: MockRoutes = {
  uploadAttachment: {
    // The backend detects the type from the content; the mocks trust the
    // file's declared type and name. As there, the size is checked first.
    // Nothing is stored yet, so the attachment can't be downloaded or linked.
    resolve: ({ db, form, household, userId }) => {
      const files = form?.getAll(ATTACHMENT_UPLOAD_FIELD) ?? [];
      const [file] = files;
      if (files.length !== 1 || !file || typeof file === "string") {
        throw validationError([{ path: [], message: "File is required" }]);
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        throw new MockApiError(
          413,
          "PAYLOAD_TOO_LARGE",
          "Request body is too large"
        );
      }
      const mimeType = attachmentTypeOf(file);
      if (!mimeType || file.size === 0) {
        throw new MockApiError(
          415,
          "UNSUPPORTED_FILE_TYPE",
          "Unsupported file type",
          { allowed: ATTACHMENT_MIME_TYPES }
        );
      }
      return {
        id: crypto.randomUUID(),
        householdId: household.id,
        mimeType,
        sizeBytes: file.size,
        uploadedBy: db.summary(userId),
        createdAt: now(),
      };
    },
  },
};
