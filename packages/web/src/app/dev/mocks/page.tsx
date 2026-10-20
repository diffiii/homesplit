import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MocksPanel } from "./mocks-panel";

export const metadata: Metadata = { title: "API mocks · HomeSplit" };

/** Switch the mock API's data, user, and network, for development only. */
export default function MocksPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <MocksPanel />;
}
