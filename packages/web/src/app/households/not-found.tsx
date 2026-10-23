import { HouseholdNotFound } from "@/components/shell/household-not-found";

/** `/households/:householdId` with an ID that can't be a household's. */
export default function NotFound() {
  return <HouseholdNotFound />;
}
