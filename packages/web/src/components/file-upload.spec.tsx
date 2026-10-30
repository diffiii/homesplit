import type { Attachment } from "@homesplit/contracts";
import { fireEvent, screen, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { ATTACHMENT_MAX_BYTES } from "@/lib/attachments";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { FileUpload } from "./file-upload";

const UPLOAD_URL = "*/api/households/:householdId/attachments";
const UPLOADED = /Uploaded/;
const CANCELED = /Canceled/;
const RETRY = /Retry/;

const householdId = () => {
  const flat = db.state.households.find(
    ({ name }) => name === "Flat on Piękna"
  );
  if (!flat) {
    throw new Error("The scenario has no flat");
  }
  return flat.id;
};

const photo = () =>
  new File([new Uint8Array(2048)], "receipt.jpg", { type: "image/jpeg" });
const pdf = () =>
  new File([new Uint8Array(4096)], "invoice.pdf", {
    type: "application/pdf",
  });

let reported: Attachment[][] = [];
let pending: boolean[] = [];

function renderUpload() {
  reported = [];
  pending = [];
  const result = renderWithProviders(
    <FileUpload
      householdId={householdId()}
      onAttachmentsChange={(attachments) => reported.push(attachments)}
      onPendingChange={(value) => pending.push(value)}
    />
  );
  return {
    ...result,
    pick: (...files: File[]) =>
      result.user.upload(screen.getByLabelText("Choose files"), files),
  };
}

const row = (name: string) =>
  within(screen.getByRole("list", { name: "Files" }))
    .getByText(name)
    .closest("li") as HTMLElement;

beforeEach(() => {
  let previews = 0;
  URL.createObjectURL = vi.fn(() => {
    previews += 1;
    return `blob:preview-${previews}`;
  });
  URL.revokeObjectURL = vi.fn();
});

describe("FileUpload", () => {
  it("uploads picked files, previewing images and showing an icon for PDFs", async () => {
    const { pick } = renderUpload();

    await pick(photo(), pdf());

    expect(await within(row("receipt.jpg")).findByText(UPLOADED)).toBeVisible();
    expect(await within(row("invoice.pdf")).findByText(UPLOADED)).toBeVisible();
    expect(
      within(row("receipt.jpg")).getByTestId("file-preview")
    ).toHaveAttribute("src", "blob:preview-1");
    expect(within(row("invoice.pdf")).getByTestId("file-icon")).toBeVisible();
    expect(
      reported
        .at(-1)
        ?.map(({ mimeType }) => mimeType)
        .sort()
    ).toEqual(["application/pdf", "image/jpeg"]);
    expect(pending).toEqual([true, false]);
    await expectNoAxeViolations();
  });

  it("takes a photo with the camera", async () => {
    const { user } = renderUpload();

    const camera = screen.getByLabelText("Take photo");
    expect(camera).toHaveAttribute("capture", "environment");
    await user.upload(camera, photo());

    expect(await within(row("receipt.jpg")).findByText(UPLOADED)).toBeVisible();
    expect(reported.at(-1)).toHaveLength(1);
  });

  it("checks the type and size before uploading", async () => {
    const requests = vi.fn();
    server.events.on("request:start", requests);
    onTestFinished(() => {
      server.events.removeListener("request:start", requests);
    });
    const { user } = renderUpload();

    // A picker set to "All files" lets these past `accept`.
    const input = screen.getByLabelText("Choose files");
    input.removeAttribute("accept");
    await user.upload(input, [
      new File(["GIF89a"], "anim.gif", { type: "image/gif" }),
      new File([new Uint8Array(ATTACHMENT_MAX_BYTES + 1)], "huge.pdf", {
        type: "application/pdf",
      }),
    ]);

    expect(within(row("anim.gif")).getByRole("alert")).toHaveTextContent(
      "This type of file isn't supported. Use JPEG, PNG, WebP, HEIC, or PDF."
    );
    expect(within(row("huge.pdf")).getByRole("alert")).toHaveTextContent(
      "This file is too large. Files can be up to 10 MB."
    );
    expect(requests).not.toHaveBeenCalled();
    expect(
      within(row("anim.gif")).queryByRole("button", { name: RETRY })
    ).not.toBeInTheDocument();
  });

  it("shows a file icon when the browser can't display an image", async () => {
    const { pick } = renderUpload();

    await pick(new File([new Uint8Array(1024)], "IMG_0042.HEIC", { type: "" }));

    fireEvent.error(within(row("IMG_0042.HEIC")).getByTestId("file-preview"));
    expect(within(row("IMG_0042.HEIC")).getByTestId("file-icon")).toBeVisible();
  });

  it("cancels an upload and retries it", async () => {
    server.use(http.post(UPLOAD_URL, () => delay("infinite")));
    const { pick, user } = renderUpload();

    await pick(photo());
    expect(
      await screen.findByRole("progressbar", { name: "Uploading receipt.jpg" })
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Cancel uploading receipt.jpg" })
    );

    expect(within(row("receipt.jpg")).getByText(CANCELED)).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(pending).toEqual([true, false]);

    server.resetHandlers();
    await user.click(
      screen.getByRole("button", { name: "Retry uploading receipt.jpg" })
    );

    expect(await within(row("receipt.jpg")).findByText(UPLOADED)).toBeVisible();
    expect(reported.at(-1)).toHaveLength(1);
  });

  it("explains a failed upload and retries it", async () => {
    server.use(
      http.post(
        UPLOAD_URL,
        () =>
          HttpResponse.json(
            { code: "INTERNAL_ERROR", message: "Internal server error" },
            { status: 500 }
          ),
        { once: true }
      )
    );
    const { pick, user } = renderUpload();

    await pick(photo());

    expect(
      await within(row("receipt.jpg")).findByRole("alert")
    ).toHaveTextContent("Something went wrong. Try again.");
    expect(reported).toEqual([]);

    await user.click(
      screen.getByRole("button", { name: "Retry uploading receipt.jpg" })
    );

    expect(await within(row("receipt.jpg")).findByText(UPLOADED)).toBeVisible();
    expect(reported.at(-1)).toHaveLength(1);
  });

  it("removes a file and its preview", async () => {
    const { pick, user } = renderUpload();

    await pick(photo());
    await within(row("receipt.jpg")).findByText(UPLOADED);
    await user.click(
      screen.getByRole("button", { name: "Remove receipt.jpg" })
    );

    expect(
      screen.queryByRole("list", { name: "Files" })
    ).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(reported.at(-1)).toEqual([]);
  });
});
