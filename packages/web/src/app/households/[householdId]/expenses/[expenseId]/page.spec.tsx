import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { queryKeys } from "@/lib/api/query-keys";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import ExpensePage from "./page";

const householdNamed = (name: string) => {
  const found = db.state.households.find(
    (candidate) => candidate.name === name
  );
  if (!found) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return found;
};
const flat = () => householdNamed("Flat on Piękna");

const expenseId = (name: string) => {
  const found = db.state.expenses.find((expense) => expense.name === name);
  if (!found) {
    throw new Error(`The scenario has no expense ${name}`);
  }
  return found.id;
};

function renderExpense(id: string, householdId = flat().id) {
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <ExpensePage />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/expenses/${id}`,
      params: { householdId, expenseId: id },
    }
  );
}

/** A row's text as read aloud: avatars hidden, whitespace collapsed. */
function spokenText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const avatar of copy.querySelectorAll('[data-slot="avatar"]')) {
    avatar.remove();
  }
  return (copy.textContent ?? "").replace(/\s+/gu, " ");
}

const rowsOf = (name: string) =>
  within(screen.getByRole("region", { name }))
    .getAllByRole(name === "Split" ? "row" : "listitem")
    .map(spokenText);

const DOWNLOAD = /\/attachments\/[^/]+\/download$/u;
const IMAGE_URL = /^data:image\//u;
// Node has object URLs, so the mocks' sample PDF is a blob.
const PDF_URL = /^blob:/u;
const WHITESPACE = /\s/gu;

describe("ExpensePage", () => {
  it("shows payers, the split with its inputs, and the details", async () => {
    renderExpense(expenseId("Pizza night"));

    expect(
      await screen.findByRole("heading", { name: "Pizza night" })
    ).toBeVisible();
    expect(screen.getByText("PLN 129.00")).toBeVisible();
    expect(screen.getByText("Dining out")).toBeVisible();
    expect(screen.getByText("Added by").nextElementSibling).toHaveTextContent(
      "Celina Wiśniewska"
    );
    expect(rowsOf("Paid by")).toEqual([
      "Alice NowakPLN 39.00",
      "Celina WiśniewskaPLN 90.00",
    ]);
    expect(screen.getByText("Exact amounts")).toBeVisible();
    expect(rowsOf("Split")).toEqual([
      "PersonInputShare",
      "Alice NowakPLN 39.00PLN 39.00",
      "Bartek KowalskiPLN 45.00PLN 45.00",
      "Celina WiśniewskaPLN 45.00PLN 45.00",
    ]);
    expect(screen.getByRole("link", { name: "All expenses" })).toHaveAttribute(
      "href",
      `/households/${flat().id}/expenses`
    );
    await expectNoAxeViolations(document.body, {
      rules: { "landmark-unique": { enabled: false } },
    });
  });

  it("shows the description and the inputs of a shares split", async () => {
    renderExpense(expenseId("Electricity"));

    expect(await screen.findByText("September and October")).toBeVisible();
    expect(screen.getByText("By shares")).toBeVisible();
    expect(rowsOf("Split")).toEqual([
      "PersonInputShare",
      "Alice Nowak2 sharesPLN 156.25",
      "Bartek Kowalski1 sharePLN 78.13",
      "Celina Wiśniewska1 sharePLN 78.12",
    ]);
  });

  it("marks people who left the household", async () => {
    renderExpense(expenseId("Internet"));

    expect(
      await screen.findByRole("heading", { name: "Internet" })
    ).toBeVisible();
    expect(screen.getByText("Split equally")).toBeVisible();
    expect(screen.getByText("Added by").nextElementSibling).toHaveTextContent(
      "Dawid LewandowskiLeft the household"
    );
    expect(rowsOf("Split")).toContain(
      "Dawid LewandowskiLeft the householdPLN 22.49"
    );
  });

  it("says when the expense doesn't exist", async () => {
    renderExpense(crypto.randomUUID());

    expect(await screen.findByText("Expense not found")).toBeVisible();
    // The household is still there; only the expense is missing.
    expect(
      screen.queryByRole("heading", { name: "Household not found" })
    ).not.toBeInTheDocument();
  });

  it("offers edit and delete to a member only on their own expenses", async () => {
    // Alice is a plain member of the cabin.
    const cabin = householdNamed("Lake cabin").id;
    const own = renderExpense(expenseId("Firewood"), cabin);
    expect(await screen.findByRole("link", { name: "Edit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
    own.unmount();

    renderExpense(expenseId("Cabin rental"), cabin);
    expect(
      await screen.findByRole("heading", { name: "Cabin rental" })
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Edit" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" })
    ).not.toBeInTheDocument();
  });

  it("offers neither while expenses are turned off", async () => {
    flat().features.expenses = false;
    renderExpense(expenseId("Pizza night"));

    expect(
      await screen.findByRole("heading", { name: "Pizza night" })
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Edit" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" })
    ).not.toBeInTheDocument();
  });

  it("deletes after confirming, then refetches the list and balances", async () => {
    const id = expenseId("Pizza night");
    const { user, queryClient } = renderExpense(id);
    const params = { params: { householdId: flat().id } };
    const refetched = [
      queryKeys.endpoint("listExpenses", params),
      queryKeys.endpoint("listBalances", params),
    ];
    for (const queryKey of refetched) {
      queryClient.setQueryData(queryKey, {});
    }

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete “Pizza night”?",
    });
    expect(db.state.expenses.some((expense) => expense.id === id)).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        `/households/${flat().id}/expenses`
      )
    );
    expect(db.state.expenses.some((expense) => expense.id === id)).toBe(false);
    for (const queryKey of refetched) {
      expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
    }
  });

  it("shows not found when deleting after the user was removed", async () => {
    const householdId = flat().id;
    const { user } = renderExpense(expenseId("Pizza night"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");

    const alice = db.userByEmail("alice@example.com")?.id;
    db.state.members = db.state.members.filter(
      (member) =>
        !(member.householdId === householdId && member.userId === alice)
    );
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByRole("heading", { name: "Household not found" })
    ).toBeVisible();
  });

  describe("files", () => {
    /** Text with the non-breaking spaces `Intl` puts in sizes made plain. */
    const plain = (text: string | null | undefined) =>
      (text ?? "").replace(WHITESPACE, " ");

    /** How many download links were requested from now on. */
    function countDownloads() {
      const count = { value: 0 };
      server.events.on("request:start", ({ request }) => {
        if (DOWNLOAD.test(new URL(request.url).pathname)) {
          count.value += 1;
        }
      });
      return count;
    }

    /** The rows of the files list, once it shows. */
    async function fileRows() {
      const files = await screen.findByRole("region", { name: "Files" });
      return within(files).getAllByRole("listitem");
    }

    /** The Electricity bill's linked files, in the order they show. */
    const electricityFiles = () => {
      const id = expenseId("Electricity");
      return db.state.expenseAttachments
        .filter(({ expenseId: linked }) => linked === id)
        .map(({ attachmentId }) =>
          db.state.attachments.find(({ id: file }) => file === attachmentId)
        );
    };

    /** Stands in for the tab `window.open` opens, or for a blocked one with `null`. */
    function stubNewTab(blocked = false) {
      const tab = {
        opener: window as Window | null,
        location: { href: "" },
        close: vi.fn(),
      };
      const open = vi
        .spyOn(window, "open")
        .mockReturnValue(blocked ? null : (tab as unknown as Window));
      onTestFinished(() => open.mockRestore());
      return { tab, open };
    }

    it("lists each file with its type and size", async () => {
      renderExpense(expenseId("Electricity"));

      const files = await screen.findByRole("region", { name: "Files" });
      expect(
        within(files)
          .getAllByRole("listitem")
          .map((item) => plain(item.textContent))
      ).toEqual([
        "File 1JPEG image · 1.8 MBOpen",
        "File 2PDF document · 210 kBOpen",
      ]);
    });

    it("shows an image's thumbnail and other files' icons, without fetching the files", async () => {
      const downloads = countDownloads();
      renderExpense(expenseId("Electricity"));

      const [photo, pdf] = await fileRows();
      const thumbnail = within(photo).getByTestId("file-preview");
      const [photoFile] = electricityFiles();
      expect(thumbnail).toHaveAttribute(
        "src",
        `/api/households/${flat().id}/attachments/${photoFile?.id}/thumbnail`
      );
      expect(thumbnail).toHaveAttribute("loading", "lazy");
      expect(thumbnail).toHaveAttribute("alt", "");
      expect(within(photo).queryByTestId("file-icon")).not.toBeInTheDocument();
      expect(within(pdf).getByTestId("file-icon")).toBeInTheDocument();
      expect(within(pdf).queryByTestId("file-preview")).not.toBeInTheDocument();
      // The previews add no names: each row still has one Open button.
      expect(
        within(screen.getByRole("region", { name: "Files" }))
          .getAllByRole("button")
          .map((button) => button.getAttribute("aria-label"))
          .filter((name) => name?.startsWith("Open"))
      ).toEqual(["Open File 1", "Open File 2"]);
      expect(downloads.value).toBe(0);
      await expectNoAxeViolations(document.body, {
        rules: { "landmark-unique": { enabled: false } },
      });
    });

    it("keeps the icon of an image without a thumbnail", async () => {
      // As for an image the backend couldn't decode.
      const [photoFile] = electricityFiles();
      if (photoFile) {
        photoFile.hasThumbnail = false;
      }
      renderExpense(expenseId("Electricity"));

      const [photo] = await fileRows();
      expect(within(photo).getByTestId("file-icon")).toBeInTheDocument();
      expect(
        within(photo).queryByTestId("file-preview")
      ).not.toBeInTheDocument();
    });

    it("falls back to the icon when a thumbnail fails to load", async () => {
      renderExpense(expenseId("Electricity"));

      const [photo] = await fileRows();
      fireEvent.error(within(photo).getByTestId("file-preview"));

      expect(within(photo).getByTestId("file-icon")).toBeInTheDocument();
      expect(
        within(photo).queryByTestId("file-preview")
      ).not.toBeInTheDocument();
      expect(plain(photo.textContent)).toBe("File 1JPEG image · 1.8 MBOpen");
      expect(
        within(photo).getByRole("button", { name: "Open File 1" })
      ).toBeEnabled();
    });

    it("shows no files section when nothing is attached", async () => {
      renderExpense(expenseId("Pizza night"));

      expect(
        await screen.findByRole("heading", { name: "Pizza night" })
      ).toBeVisible();
      expect(
        screen.queryByRole("region", { name: "Files" })
      ).not.toBeInTheDocument();
    });

    it("shows an image in a viewer, with a fresh link each time", async () => {
      const downloads = countDownloads();
      const { user } = renderExpense(expenseId("Electricity"));

      await user.click(
        await screen.findByRole("button", { name: "Open File 1" })
      );
      const viewer = await screen.findByRole("dialog", { name: "File 1" });
      const image = await within(viewer).findByRole("img", {
        name: "File 1, JPEG image",
      });
      expect(image.getAttribute("src")).toMatch(IMAGE_URL);
      expect(
        within(viewer).getByRole("link", { name: "Download" })
      ).toHaveAttribute("href", image.getAttribute("src"));
      await expectNoAxeViolations(document.body, {
        rules: { "landmark-unique": { enabled: false } },
      });

      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
      await user.click(screen.getByRole("button", { name: "Open File 1" }));
      await screen.findByRole("img", { name: "File 1, JPEG image" });
      expect(downloads.value).toBe(2);
    });

    it("opens other files in a new tab", async () => {
      const { tab, open } = stubNewTab();
      const { user } = renderExpense(expenseId("Electricity"));

      await user.click(
        await screen.findByRole("button", { name: "Open File 2" })
      );

      expect(open).toHaveBeenCalledWith("", "_blank");
      await waitFor(() => expect(tab.location.href).toMatch(PDF_URL));
      expect(tab.opener).toBeNull();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes the new tab and explains when the link can't be had", async () => {
      const { tab } = stubNewTab();
      server.use(
        http.get("*/api/households/:householdId/attachments/:id/download", () =>
          HttpResponse.json(
            { code: "INTERNAL_ERROR", message: "Down" },
            { status: 500 }
          )
        )
      );
      const { user } = renderExpense(expenseId("Electricity"));

      await user.click(
        await screen.findByRole("button", { name: "Open File 2" })
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn't open the file."
      );
      expect(tab.close).toHaveBeenCalled();
    });

    it("offers a download in the viewer when the new tab is blocked", async () => {
      stubNewTab(true);
      const { user } = renderExpense(expenseId("Electricity"));

      await user.click(
        await screen.findByRole("button", { name: "Open File 2" })
      );

      const viewer = await screen.findByRole("dialog", { name: "File 2" });
      expect(
        await within(viewer).findByText(
          "This file can't be shown here. Download it to open it."
        )
      ).toBeVisible();
      expect(
        within(viewer)
          .getByRole("link", { name: "Download" })
          .getAttribute("href")
      ).toMatch(PDF_URL);
    });

    it("removes a file after confirming", async () => {
      const id = expenseId("Electricity");
      const { user } = renderExpense(id);
      const [first] = db.state.expenseAttachments.filter(
        ({ expenseId: linked }) => linked === id
      );

      await user.click(
        await screen.findByRole("button", { name: "Remove File 1" })
      );
      const dialog = await screen.findByRole("alertdialog", {
        name: "Remove file 1?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      await waitFor(() =>
        expect(
          within(screen.getByRole("region", { name: "Files" })).getAllByRole(
            "listitem"
          )
        ).toHaveLength(1)
      );
      expect(screen.getByText("PDF document", { exact: false })).toBeVisible();
      expect(
        db.state.expenseAttachments.some(
          ({ attachmentId }) => attachmentId === first?.attachmentId
        )
      ).toBe(false);
    });

    it("keeps the section after the last file is removed", async () => {
      const id = expenseId("Electricity");
      // Leave the bill one file.
      db.state.expenseAttachments.splice(
        db.state.expenseAttachments.findIndex(
          ({ expenseId: linked }) => linked === id
        ),
        1
      );
      const { user } = renderExpense(id);

      await user.click(
        await screen.findByRole("button", { name: "Remove File 1" })
      );
      await user.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", {
          name: "Remove",
        })
      );

      expect(await screen.findByText("No files attached.")).toBeVisible();
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: "Files" })).toHaveFocus()
      );
    });

    it("lets members open but not remove files on others' expenses", async () => {
      // Alice is a plain member of the cabin, and Ewa added the rental.
      const cabin = householdNamed("Lake cabin").id;
      const rental = expenseId("Cabin rental");
      const time = new Date().toISOString();
      db.state.attachments.push({
        id: crypto.randomUUID(),
        householdId: cabin,
        hasThumbnail: true,
        mimeType: "image/png",
        sizeBytes: 1000,
        uploadedById: db.userByEmail("ewa@example.com")?.id ?? "",
        createdAt: time,
      });
      db.state.expenseAttachments.push({
        householdId: cabin,
        expenseId: rental,
        attachmentId: db.state.attachments.at(-1)?.id ?? "",
        createdAt: time,
      });
      renderExpense(rental, cabin);

      expect(
        await screen.findByRole("button", { name: "Open File 1" })
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Remove File 1" })
      ).not.toBeInTheDocument();
    });

    it("doesn't offer removing while expenses are turned off", async () => {
      flat().features.expenses = false;
      renderExpense(expenseId("Electricity"));

      expect(
        await screen.findByRole("button", { name: "Open File 1" })
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Remove File 1" })
      ).not.toBeInTheDocument();
    });

    it("says the files are deleted with the expense", async () => {
      const { user } = renderExpense(expenseId("Electricity"));

      await user.click(await screen.findByRole("button", { name: "Delete" }));

      expect(
        await screen.findByRole("alertdialog", {
          name: "Delete “Electricity”?",
        })
      ).toHaveTextContent("Its 2 attached files will be deleted too.");
    });
  });
});
