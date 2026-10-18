import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Kit } from "./kit";

export const metadata: Metadata = { title: "UI kit · HomeSplit" };

/** Every shared component and helper on one page, for development only. */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Kit />;
}
