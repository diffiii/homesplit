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
  /**
   * Redirects to a short-lived signed URL of the thumbnail, so the path works
   * as an `<img src>`: `/api` is same-origin and sends the session cookie.
   */
  getAttachmentThumbnail: {
    method: "GET",
    path: `${ATTACHMENT}/thumbnail`,
    params: AttachmentIdParams,
    status: 302,
    response: null,
  },
} as const satisfies Record<string, Endpoint>;
