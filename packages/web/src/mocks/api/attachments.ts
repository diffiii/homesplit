import {
  ATTACHMENT_MIME_TYPES,
  ATTACHMENT_UPLOAD_FIELD,
  type AttachmentMimeType,
  endpoints,
  isImageType,
} from "@homesplit/contracts";
import { type HttpHandler, HttpResponse, http } from "msw";
import { ATTACHMENT_MAX_BYTES, attachmentTypeOf } from "@/lib/attachments";
import { type MockDb, now } from "../db";
import { notFound, unauthenticated } from "../errors";
import { type MockNetwork, type MockRoutes, simulateLatency } from "../routes";
import { findInHousehold, uploadedFile } from "./shared";

/** How long a download link works, as the backend's default TTL. */
const DOWNLOAD_TTL_MS = 5 * 60 * 1000;

/**
 * The files uploaded since the page loaded, by attachment ID, with images
 * served as their own thumbnails. They can't be saved with the state, so
 * after a reload, and for seeded files, a sample of the file's type stands in.
 */
const files = new Map<string, Blob>();

const SAMPLE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">',
  '<rect width="600" height="800" fill="#fafaf9"/>',
  '<rect x="60" y="60" width="480" height="680" rx="12" fill="#fff" stroke="#d6d3d1" stroke-width="4"/>',
  '<text x="300" y="400" fill="#57534e" font-family="sans-serif" font-size="36" text-anchor="middle">Sample receipt</text>',
  "</svg>",
].join("");

const SAMPLE_IMAGE = `data:image/svg+xml,${encodeURIComponent(SAMPLE_SVG)}`;

const SAMPLE_PDF = [
  "%PDF-1.4",
  "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
  "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
  "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
  "4 0 obj << /Length 52 >> stream",
  "BT /F1 24 Tf 72 760 Td (Sample invoice) Tj ET",
  "endstream endobj",
  "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  "trailer << /Root 1 0 R >>",
  "%%EOF",
].join("\n");

/** A URL with sample content of `type`: an image or a one-page PDF. */
function sampleUrl(type: AttachmentMimeType): string {
  if (type !== "application/pdf") {
    return SAMPLE_IMAGE;
  }
  // Browsers won't open a `data:` URL in a tab, but jsdom has no object URLs.
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(new Blob([SAMPLE_PDF], { type }));
  }
  return `data:${type};base64,${btoa(SAMPLE_PDF)}`;
}

export const attachmentRoutes: MockRoutes = {
  uploadAttachment: {
    resolve: ({ db, form, household, userId }) => {
      const { file, type } = uploadedFile(form, ATTACHMENT_UPLOAD_FIELD, {
        allowed: ATTACHMENT_MIME_TYPES,
        maxBytes: ATTACHMENT_MAX_BYTES,
        typeOf: attachmentTypeOf,
      });
      const attachment = {
        id: crypto.randomUUID(),
        householdId: household.id,
        hasThumbnail: isImageType(type),
        mimeType: type,
        sizeBytes: file.size,
        uploadedById: userId,
        createdAt: now(),
      };
      db.state.attachments.push(attachment);
      files.set(attachment.id, file);
      const { uploadedById, ...rest } = attachment;
      return { ...rest, uploadedBy: db.summary(uploadedById) };
    },
  },

  getAttachmentDownload: {
    resolve: ({ db, household, params }) => {
      const attachment = findInHousehold(
        db.state.attachments,
        household.id,
        params.attachmentId
      );
      const file = files.get(attachment.id);
      return {
        // jsdom has no object URLs, so it gets the sample.
        url:
          file && typeof URL.createObjectURL === "function"
            ? URL.createObjectURL(file)
            : sampleUrl(attachment.mimeType),
        expiresAt: new Date(Date.now() + DOWNLOAD_TTL_MS).toISOString(),
      };
    },
  },
};

/**
 * `getAttachmentThumbnail`, a 302 route, so not among the `MockRoutes`. It
 * answers 200 with the content the redirect leads to, since browsers don't
 * follow redirects to the `blob:` URLs the mocks serve files from: the uploaded
 * image itself rather than a resized copy, or the sample for seeded ones.
 */
export function createThumbnailHandler(
  db: MockDb,
  network: () => MockNetwork
): HttpHandler {
  return http.get(
    `*${endpoints.getAttachmentThumbnail.path}`,
    async ({ params }) => {
      await simulateLatency(network());
      const userId = db.state.sessionUserId;
      if (!userId) {
        return unauthenticated().toResponse();
      }
      const householdId = String(params.householdId);
      const attachment = db.state.attachments.find(
        ({ id, householdId: owner }) =>
          id === params.attachmentId && owner === householdId
      );
      if (!(attachment?.hasThumbnail && db.member(householdId, userId))) {
        return notFound().toResponse();
      }
      const image =
        files.get(attachment.id) ??
        new Blob([SAMPLE_SVG], { type: "image/svg+xml" });
      return new HttpResponse(image, {
        headers: { "Content-Type": image.type },
      });
    }
  );
}
