import type { FeatureId } from "@homesplit/contracts";
import {
  HouseIcon,
  ListChecksIcon,
  type LucideIcon,
  ReceiptIcon,
  SettingsIcon,
  ShoppingCartIcon,
} from "lucide-react";

export interface NavItem {
  /** The module behind the section, so the nav can mark it when it's off. */
  feature?: FeatureId;
  icon: LucideIcon;
  label: string;
  /** Path under `/households/:householdId`; empty for the overview. */
  segment: string;
}

/** Sections of a household, in the order both navs show them. */
export const HOUSEHOLD_NAV: readonly NavItem[] = [
  { segment: "", label: "Overview", icon: HouseIcon },
  {
    segment: "expenses",
    label: "Expenses",
    icon: ReceiptIcon,
    feature: "expenses",
  },
  {
    segment: "chores",
    label: "Chores",
    icon: ListChecksIcon,
    feature: "chores",
  },
  {
    segment: "shopping",
    label: "Shopping",
    icon: ShoppingCartIcon,
    feature: "shopping",
  },
  { segment: "settings", label: "Settings", icon: SettingsIcon },
];

export function householdPath(householdId: string, segment = ""): string {
  return segment
    ? `/households/${householdId}/${segment}`
    : `/households/${householdId}`;
}

/** Who owes whom and settling up, which belong to the expenses section. */
export function balancesPath(householdId: string): string {
  return `${householdPath(householdId, "expenses")}/balances`;
}

/** The overview matches only itself; other sections also match their sub-pages. */
export function isActive(
  pathname: string,
  householdId: string,
  segment: string
): boolean {
  const path = householdPath(householdId, segment);
  return segment
    ? pathname === path || pathname.startsWith(`${path}/`)
    : pathname === path;
}
