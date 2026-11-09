"use client";

import { PageHeader } from "@/components/page-header";
import { CategorySettings } from "./category-settings";
import { DeleteHousehold, LeaveHousehold } from "./household-exit";
import { HouseholdNameSettings } from "./household-name-settings";
import { InvitationSettings } from "./invitation-settings";
import { MemberSettings } from "./member-settings";
import { ModuleSettings } from "./module-settings";

/** Household settings: the name, members, invitations, modules, categories, leaving, and deleting. The theme is on the account page. */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <HouseholdNameSettings />
      <MemberSettings />
      <InvitationSettings />
      <ModuleSettings />
      <CategorySettings />
      <LeaveHousehold />
      <DeleteHousehold />
    </>
  );
}
