import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import { ReceiptsScreen } from "./receipts-screen";

const flat = () => {
  const found = db.state.households.find(
    ({ name }) => name === "Flat on Piękna"
  );
  if (!found) {
    throw new Error("The scenario has no Flat on Piękna");
  }
  return found;
};

function renderReceipts() {
  const householdId = flat().id;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <ReceiptsScreen />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/expenses/receipts`,
      params: { householdId },
    }
  );
}

const pdf = () =>
  new File([new Uint8Array(4096)], "receipt.pdf", { type: "application/pdf" });

const LIDL = /^Lidl/u;
const UNNAMED = /^Unnamed receipt/u;
const CARREFOUR = /^Carrefour Express/u;

// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("ReceiptsScreen", () => {
  it("lists the drafts newest first, with their status", async () => {
    const [lidl] = db.state.receipts;
    if (!lidl) {
      throw new Error("The scenario has no receipts");
    }
    db.state.receipts.push({
      ...structuredClone(lidl),
      id: crypto.randomUUID(),
      merchant: "Already an expense",
      status: "confirmed",
    });
    renderReceipts();

    const list = await screen.findByRole("list", { name: "Receipt drafts" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringMatching(CARREFOUR),
      expect.stringMatching(UNNAMED),
      expect.stringMatching(LIDL),
    ]);
    expect(links[1]).toHaveTextContent("Couldn't read");
    expect(links[2]).toHaveTextContent("Draft");
    expect(links[2]).toHaveTextContent("Scanned by Bartek Kowalski");
    expect(links[2]).toHaveAttribute(
      "href",
      `/households/${flat().id}/expenses/receipts/${lidl.id}`
    );
    expect(screen.queryByText("Already an expense")).not.toBeInTheDocument();
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("says scanning needs AI while it's off", async () => {
    renderReceipts();

    expect(await screen.findByText("Scanning needs AI")).toBeVisible();
    expect(screen.getByRole("button", { name: "Scan receipt" })).toBeDisabled();
  });

  it("scans an uploaded file and opens the receipt while it's read", async () => {
    flat().features.ai = true;
    const before = db.state.receipts.length;
    const { user, queryClient } = renderReceipts();

    await user.click(
      await screen.findByRole("button", { name: "Scan receipt" })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Scan a receipt",
    });
    const read = within(dialog).getByRole("button", { name: "Read receipt" });
    expect(read).toBeDisabled();
    await user.upload(within(dialog).getByLabelText("Choose files"), pdf());
    await waitFor(() => expect(read).toBeEnabled());
    await user.click(read);

    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(db.state.receipts).toHaveLength(before + 1);
    const scanned = db.state.receipts.at(-1);
    expect(router.push).toHaveBeenCalledWith(
      `/households/${flat().id}/expenses/receipts/${scanned?.id}`
    );
    // The receipt's page starts from the scan's answer, without a blank wait.
    expect(
      queryClient
        .getQueriesData({ queryKey: ["household", flat().id, "getReceipt"] })
        .map(([, data]) => data)
    ).toEqual([expect.objectContaining({ status: "processing" })]);
  });

  it("offers a scan from the empty list", async () => {
    db.state.receipts = [];
    flat().features.ai = true;
    renderReceipts();

    expect(await screen.findByText("No receipt drafts")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Scan receipt" })
    ).toHaveLength(2);
  });
});
