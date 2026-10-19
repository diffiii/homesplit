"use client";

import { createContext, use } from "react";

export const HouseholdContext = createContext<string | null>(null);

/** The household of the page being shown, from `/households/:householdId/...`. */
export function useHouseholdId(): string {
  const householdId = use(HouseholdContext);
  if (!householdId) {
    throw new Error("useHouseholdId must be used inside the household shell");
  }
  return householdId;
}
