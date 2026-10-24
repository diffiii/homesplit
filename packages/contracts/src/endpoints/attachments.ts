import {
  Attachment,
  AttachmentDownload,
  AttachmentIdParams,
} from "../features/attachments";
import { HouseholdIdParams } from "../features/households";
import type { Endpoint } from "./endpoint";
import { HOUSEHOLD } from "./paths";

const ATTACHMENT = `${HOUSEHOLD}/attachments/:attachmentId`;

export const attachmentEndpoints = {
  /**
   * The body is `multipart/form-data`, not JSON, with one file in the
   * `ATTACHMENT_UPLOAD_FIELD` field, so it has no body schema.
   */
  uploadAttachment: {
    method: "POST",
    path: `${HOUSEHOLD}/attachments`,
    params: HouseholdIdParams,
    status: 201,
    response: Attachment,
  },
  getAttachmentDownload: {
    method: "GET",
    path: `${ATTACHMENT}/download`,
    params: AttachmentIdParams,
    status: 200,
    response: AttachmentDownload,
  },
} as const satisfies Record<string, Endpoint>;
