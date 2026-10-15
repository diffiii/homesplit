import { Id } from "@homesplit/contracts";
import { notFound } from "next/navigation";
import { HouseholdShell } from "@/components/shell/household-shell";

export default async function HouseholdLayout({
  children,
  params,
}: LayoutProps<"/households/[householdId]">) {
  const { householdId } = await params;
  // The API would answer 404 anyway; this skips the round trip for a mistyped URL.
  if (!Id.safeParse(householdId).success) {
    notFound();
  }
  return <HouseholdShell householdId={householdId}>{children}</HouseholdShell>;
}
