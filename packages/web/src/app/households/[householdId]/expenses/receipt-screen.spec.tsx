import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { formatMoney } from "@/lib/money";
import type { MockReceipt } from "@/mocks/db";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import { ReceiptScreen } from "./receipt-screen";

const flat = () => {
  const found = db.state.households.find(
    ({ name }) => name === "Flat on Piękna"
  );
  if (!found) {
    throw new Error("The scenario has no Flat on Piękna");
  }
  return found;
};

/** The Lidl draft, whose items come to 1.03 more than its total. */
const draft = (): MockReceipt => {
  const found = db.state.receipts.find(({ merchant }) => merchant === "Lidl");
  if (!found) {
    throw new Error("The scenario has no Lidl receipt");
  }
  return found;
};

const failed = (): MockReceipt => {
  const found = db.state.receipts.find(({ status }) => status === "failed");
  if (!found) {
    throw new Error("The scenario has no failed receipt");
  }
  return found;
};

function renderReceipt(receiptId: string) {
  const householdId = flat().id;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <ReceiptScreen />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/expenses/receipts/${receiptId}`,
      params: { householdId, receiptId },
    }
  );
}

const WHITESPACE = /\s/gu;

/** An amount as `toHaveTextContent` reads it, which turns the no-break space into a plain one. */
const pln = (amountCents: number) =>
  formatMoney({ amountCents, currency: "PLN" }).replace(WHITESPACE, " ");

const item = (index: number) =>
  screen.getByRole("group", { name: `Item ${index}` });

const summary = () => screen.getByRole("region", { name: "Summary" });

const details = () => screen.getByRole("region", { name: "Details" });

// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("ReceiptScreen", () => {
  it("shows the draft with how far its items are from the total", async () => {
    renderReceipt(draft().id);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Lidl" })
    ).toBeVisible();
    expect(screen.getByLabelText("Shop")).toHaveValue("Lidl");
    expect(within(details()).getByLabelText("Total")).toHaveValue("28.47");
    expect(within(item(2)).getByLabelText("Quantity")).toHaveValue("0.734");
    expect(within(item(3)).getByLabelText("Discount")).toHaveValue("2.00");
    expect(summary()).toHaveTextContent(
      `The items come to ${pln(103)} more than the total.`
    );
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("saves edits to the header and the items", async () => {
    const { user } = renderReceipt(draft().id);
    await screen.findByLabelText("Shop");
    const total = within(details()).getByLabelText("Total");

    await user.clear(total);
    await user.type(total, "29.50");
    expect(summary()).toHaveTextContent("The items add up to the total.");

    // Changing the quantity works out the line total again.
    const pasta = item(1);
    await user.clear(within(pasta).getByLabelText("Quantity"));
    await user.type(within(pasta).getByLabelText("Quantity"), "3");
    expect(within(pasta).getByLabelText("Total")).toHaveValue("14.97");

    await user.click(screen.getByRole("button", { name: "Move Parmesan up" }));
    await user.click(screen.getByRole("button", { name: "Remove Tomatoes" }));
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const butter = item(3);
    await user.type(within(butter).getByLabelText("Name"), "Butter");
    await user.type(within(butter).getByLabelText("Unit price"), "7.49");
    expect(within(butter).getByLabelText("Total")).toHaveValue("7.49");

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Draft saved.")).toBeVisible();
    expect(draft()).toMatchObject({
      status: "ready",
      totalCents: 2950,
      items: [
        expect.objectContaining({ name: "Pasta 500 g", quantity: 3 }),
        expect.objectContaining({ name: "Parmesan", totalCents: 999 }),
        expect.objectContaining({ name: "Butter", totalCents: 749 }),
      ],
    });
  }, 15_000);

  it("won't save a negative amount: a returned deposit is a receipt discount", async () => {
    const { user } = renderReceipt(draft().id);
    const price = within(
      await screen.findByRole("group", { name: "Item 1" })
    ).getByLabelText("Unit price");

    await user.clear(price);
    await user.type(price, "-0.50");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(
      await within(item(1)).findByText("Enter a number, like 12.50.")
    ).toBeVisible();
    expect(draft().items[0]?.unitPriceCents).toBe(499);
  });

  it("shows the wait while the receipt is read, then the draft", async () => {
    flat().features.ai = true;
    const receipt = draft();
    receipt.status = "processing";
    let reads = 0;
    // The first answer is the scan's: still being read.
    server.use(
      http.get(
        "*/api/households/:householdId/receipts/:receiptId",
        () => {
          reads += 1;
          return HttpResponse.json({
            ...receipt,
            createdBy: db.summary(receipt.createdById),
            items: [],
            itemsTotalCents: 0,
            differenceCents: null,
            merchant: null,
            totalCents: null,
          });
        },
        { once: true }
      )
    );
    renderReceipt(receipt.id);

    expect(
      await screen.findByRole("heading", { name: "Reading the receipt…" })
    ).toBeVisible();
    expect(screen.getByText("Photo uploaded")).toBeVisible();
    await expectNoAxeViolations(document.body, AXE_OPTIONS);

    expect(
      await screen.findByLabelText("Shop", undefined, { timeout: 3000 })
    ).toHaveValue("Biedronka");
    expect(reads).toBe(1);
  });

  it("explains a failed read, and lets the member fill it in by hand", async () => {
    const { user } = renderReceipt(failed().id);

    expect(
      await screen.findByText(
        "The household has used up today's AI requests. You can try again tomorrow. Try again, or fill it in by hand."
      )
    ).toBeVisible();
    // AI is off in this household, so reading again can't work.
    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Fill in by hand" }));
    await user.type(screen.getByLabelText("Shop"), "Żabka");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(within(item(1)).getByLabelText("Name"), "Water");
    await user.type(within(item(1)).getByLabelText("Unit price"), "2.99");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Draft saved.")).toBeVisible();
    expect(
      db.state.receipts.find(({ merchant }) => merchant === "Żabka")
    ).toMatchObject({
      status: "ready",
      failureCode: null,
      items: [expect.objectContaining({ name: "Water", totalCents: 299 })],
    });
  });

  it("reads a failed receipt again", async () => {
    flat().features.ai = true;
    const { id } = failed();
    const { user } = renderReceipt(id);

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { name: "Reading the receipt…" })
    ).toBeVisible();
    expect(
      await screen.findByLabelText("Shop", undefined, { timeout: 3000 })
    ).toHaveValue("Biedronka");
  });

  it("discards the draft and goes back to the list", async () => {
    const { id } = draft();
    const { user } = renderReceipt(id);

    await user.click(await screen.findByRole("button", { name: "Discard" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Discard" }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        `/households/${flat().id}/expenses/receipts`
      )
    );
    expect(db.state.receipts.some((receipt) => receipt.id === id)).toBe(false);
  });
});
