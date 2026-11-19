import { AttachmentMimeType } from "@homesplit/contracts";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { invalidReference } from "@/http/app-error";

/** The issue a missing attachment, or another household's, answers with. */
export const unknownAttachment = () =>
  invalidReference([{ path: ["attachmentId"], message: "Unknown attachment" }]);

/**
 * The household's attachment, as the AI features read it. A missing file and
 * another household's get the same 400 `INVALID_REFERENCE`.
 */
export async function findHouseholdAttachment(
  householdId: string,
  attachmentId: string
): Promise<{ mimeType: AttachmentMimeType; storageKey: string }> {
  const [row] = await db
    .select({
      storageKey: attachments.storageKey,
      mimeType: attachments.mimeType,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.householdId, householdId)
      )
    )
    .limit(1);
  if (!row) {
    throw unknownAttachment();
  }
  return {
    storageKey: row.storageKey,
    mimeType: AttachmentMimeType.parse(row.mimeType),
  };
}
