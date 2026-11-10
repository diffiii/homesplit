import type { InvitationPreview, InvitationStatus } from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invitation, organization } from "@/db/schema";
import { strongestRole } from "@/features/households/access/roles";
import { userRole } from "@/features/users/user-projections";
import { notFound } from "@/http/app-error";
import { maskEmail } from "./mask-email";

const inviter = userRole("inviter");

/** Better Auth's statuses; a pending invitation past `expiresAt` is `expired`. */
function statusAt(
  stored: string,
  expiresAt: Date,
  now: Date
): InvitationStatus {
  switch (stored) {
    case "accepted":
    case "rejected":
    case "canceled":
      return stored;
    default:
      // Better Auth refuses an invitation once `expiresAt < now`.
      return expiresAt < now ? "expired" : "pending";
  }
}

@Injectable()
export class InvitationsService {
  /**
   * The invitation as `viewerEmail` may see it. The ID works like a bearer
   * token, and a forwarded email or leaked link shouldn't reveal more than
   * the page needs: anyone but the invitee sees the address masked, and once
   * the invitation can't be answered, nothing about the household.
   */
  async preview(
    invitationId: string,
    viewerEmail: string
  ): Promise<InvitationPreview> {
    const [row] = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        household: { id: organization.id, name: organization.name },
        inviter: inviter.summary,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .innerJoin(inviter.table, eq(inviter.table.id, invitation.inviterId))
      .where(eq(invitation.id, invitationId));
    if (!row) {
      throw notFound();
    }

    const status = statusAt(row.status, row.expiresAt, new Date());
    // Better Auth matches the address case-insensitively when accepting.
    const invitee = row.email.toLowerCase() === viewerEmail.toLowerCase();
    const details = invitee || status === "pending";
    return {
      id: row.id,
      household: details ? row.household : null,
      inviter: details ? row.inviter : null,
      email: invitee ? row.email : maskEmail(row.email),
      // Better Auth invites as `member` when no role is given.
      role: strongestRole(row.role ?? "") ?? "member",
      status,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}
