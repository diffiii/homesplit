import type { InvitationPreview, InvitationStatus } from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invitation, organization } from "@/db/schema";
import { strongestRole } from "@/features/households/access/roles";
import { userRole } from "@/features/users/user-projections";
import { notFound } from "@/http/app-error";

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
  async preview(invitationId: string): Promise<InvitationPreview> {
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

    return {
      id: row.id,
      household: row.household,
      inviter: row.inviter,
      email: row.email,
      // Better Auth invites as `member` when no role is given.
      role: strongestRole(row.role ?? "") ?? "member",
      status: statusAt(row.status, row.expiresAt, new Date()),
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}
