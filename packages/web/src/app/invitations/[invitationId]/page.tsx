import { Id } from "@homesplit/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitationView } from "./invitation-view";

export const metadata: Metadata = { title: "Invitation · HomeSplit" };

/**
 * Where invitation emails link to. The proxy sends a visitor without a
 * session to sign-in first, with `redirectTo` back here.
 */
export default async function InvitationPage({
  params,
}: PageProps<"/invitations/[invitationId]">) {
  const { invitationId } = await params;
  const id = Id.safeParse(invitationId);
  // The API would answer 400 anyway; this skips the round trip for a mangled link.
  if (!id.success) {
    notFound();
  }
  return <InvitationView invitationId={id.data} />;
}
