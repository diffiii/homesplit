import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import type { CropperProps } from "react-easy-crop";
import {
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  onTestFinished,
  vi,
} from "vitest";
import { queryKeys } from "@/lib/api/query-keys";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { MOCK_PASSWORD } from "@/mocks/factories";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import AccountPage from "./page";

// The cropper measures its container, which jsdom lays out at 0 × 0, so a
// stand-in reports the area the frame shows once the image loads: a 600 px
// square 100 px from the left at zoom 1, shrinking as it zooms in.
vi.mock("react-easy-crop", async () => {
  const { useEffect, useRef, useState } = await import("react");
  function Cropper({
    image,
    zoom,
    mediaProps,
    onCropComplete,
    setImageRef,
  }: Partial<CropperProps>) {
    const ref = useRef<HTMLImageElement>(null);
    const [loaded, setLoaded] = useState(false);
    // Only on load and zoom, as the callbacks change every render.
    useEffect(() => {
      setImageRef?.(ref as never);
      if (loaded && zoom) {
        const area = { x: 100, y: 0, width: 600 / zoom, height: 600 / zoom };
        onCropComplete?.(area, area);
      }
    }, [loaded, zoom]);
    return (
      // biome-ignore lint/performance/noImgElement: a stand-in for the cropper's own image.
      // biome-ignore lint/correctness/useImageSize: jsdom lays nothing out.
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: `onLoad` isn't user input.
      <img
        alt=""
        data-testid="avatar-crop-image"
        {...(mediaProps as object)}
        onLoad={() => setLoaded(true)}
        ref={ref}
        src={image}
      />
    );
  }
  return { default: Cropper };
});

const alice = () => {
  const found = db.userByEmail("alice@example.com");
  if (!found) {
    throw new Error("The scenario has no Alice");
  }
  return found;
};

function renderPage() {
  return renderWithProviders(<AccountPage />, { url: "/account" });
}

const section = (name: string) => screen.getByRole("region", { name });

const AVATAR_URL = "*/api/me/avatar";
const CANT_SHOW = /Your browser can't show this photo/u;

const photo = () =>
  new File([new Uint8Array(2048)], "me.jpg", { type: "image/jpeg" });

function recordAvatarUploads() {
  const names: string[] = [];
  const record = async ({ request }: { request: Request }) => {
    if (request.method === "PUT" && request.url.endsWith("/api/me/avatar")) {
      const file = (await request.clone().formData()).get("file");
      names.push(typeof file === "object" && file ? file.name : "");
    }
  };
  server.events.on("request:start", record);
  onTestFinished(() => server.events.removeListener("request:start", record));
  return names;
}

/** jsdom has no canvas. */
function stubCanvas(): Mock {
  const drawImage = vi.fn();
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ drawImage } as never);
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback) =>
      callback(new Blob([new Uint8Array(512)], { type: "image/webp" }))
    );
  onTestFinished(() => {
    getContext.mockRestore();
    toBlob.mockRestore();
  });
  return drawImage;
}

async function pickPhoto(
  user: ReturnType<typeof renderPage>["user"],
  file = photo()
) {
  await user.upload(await screen.findByLabelText("Upload profile photo"), file);
  return screen.findByRole("dialog", { name: "Crop your photo" });
}

/** jsdom loads no images. */
function loadPhoto(dialog: HTMLElement) {
  fireEvent.load(within(dialog).getByTestId("avatar-crop-image"));
}

/** The devices section, once the session has loaded and the page shows it. */
const devicesSection = () =>
  screen.findByRole("region", { name: "Signed-in devices" });

describe("AccountPage", () => {
  it("shows the profile from the session, with initials without an avatar", async () => {
    renderPage();

    expect(await screen.findByLabelText("Name")).toHaveValue("Alice Nowak");
    const profile = section("Profile");
    expect(within(profile).getByText("AN")).toBeVisible();
    expect(within(profile).getByText("alice@example.com")).toBeVisible();
    await expectNoAxeViolations();
  });

  it("saves the name and refreshes the session and every cached query", async () => {
    const { user, queryClient } = renderPage();
    const householdId = db.state.households[0]?.id ?? "";
    const membersKey = queryKeys.householdAuth(householdId, "get");
    queryClient.setQueryData(membersKey, { members: [] });

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "  Alicja Nowak ");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(
      await within(section("Profile")).findByText("Alicja Nowak")
    ).toBeVisible();
    expect(within(section("Profile")).queryByText("Alice Nowak")).toBeNull();
    expect(alice().name).toBe("Alicja Nowak");
    expect(name).toHaveValue("Alicja Nowak");
    expect(queryClient.getQueryState(membersKey)?.isInvalidated).toBe(true);
  });

  it("asks for a name", async () => {
    const { user } = renderPage();

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(name).toHaveAccessibleDescription(
      expect.stringContaining("Enter your name.")
    );
    expect(alice().name).toBe("Alice Nowak");
    await expectNoAxeViolations();
  });

  it("shows what the server says about the name", async () => {
    server.use(
      http.patch("*/api/me", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            message: "Invalid request",
            details: {
              issues: [{ path: ["name"], message: "Name is not allowed." }],
            },
          },
          { status: 400 }
        )
      )
    );
    const { user } = renderPage();

    const name = await screen.findByLabelText("Name");
    await user.type(name, "!");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    await expect
      .poll(() => name.getAttribute("aria-describedby"))
      .toContain("error");
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining("Name is not allowed.")
    );
  });

  describe("avatar", () => {
    beforeEach(() => {
      let urls = 0;
      URL.createObjectURL = vi.fn(() => {
        urls += 1;
        return `blob:image-${urls}`;
      });
      URL.revokeObjectURL = vi.fn();
    });

    it("crops a photo, uploads it, and refreshes the session and every cached query", async () => {
      const drawImage = stubCanvas();
      const uploads = recordAvatarUploads();
      const { user, queryClient } = renderPage();
      const householdId = db.state.households[0]?.id ?? "";
      const membersKey = queryKeys.householdAuth(householdId, "get");
      queryClient.setQueryData(membersKey, { members: [] });

      const dialog = await pickPhoto(user);
      expect(within(dialog).getByTestId("avatar-crop-image")).toHaveAttribute(
        "src",
        "blob:image-1"
      );
      loadPhoto(dialog);
      await expectNoAxeViolations();

      // Base UI hides the thumb until it can measure the track, which jsdom
      // can't, so the role query can't find it by name.
      const zoom = within(dialog).getByLabelText("Zoom", { selector: "input" });
      zoom.focus();
      await user.keyboard("{End}");
      await user.click(
        within(dialog).getByRole("button", { name: "Save photo" })
      );

      expect(await screen.findByText("Photo saved.")).toBeVisible();
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
      // Zoomed in fully, the frame shows a quarter of the width.
      expect(drawImage).toHaveBeenCalledWith(
        expect.any(HTMLImageElement),
        100,
        0,
        150,
        150,
        0,
        0,
        512,
        512
      );
      expect(uploads).toEqual(["avatar"]);
      expect(alice().image).toBe("blob:image-2");
      expect(
        await screen.findByRole("button", { name: "Change profile photo" })
      ).toBeVisible();
      expect(queryClient.getQueryState(membersKey)?.isInvalidated).toBe(true);
    });

    it("shows the upload's progress and cancels it on close", async () => {
      stubCanvas();
      server.use(http.put(AVATAR_URL, () => delay("infinite")));
      const { user } = renderPage();

      const dialog = await pickPhoto(user);
      loadPhoto(dialog);
      await user.click(
        within(dialog).getByRole("button", { name: "Save photo" })
      );

      expect(
        await within(dialog).findByRole("progressbar", {
          name: "Uploading photo",
        })
      ).toBeVisible();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
      expect(alice().image).toBeNull();
    });

    it("uploads a photo the browser can't show whole, for the server to crop", async () => {
      const uploads = recordAvatarUploads();
      const { user } = renderPage();

      const dialog = await pickPhoto(
        user,
        new File([new Uint8Array(1024)], "IMG_0042.HEIC", { type: "" })
      );
      fireEvent.error(within(dialog).getByTestId("avatar-crop-image"));
      expect(within(dialog).getByText(CANT_SHOW)).toBeVisible();
      await user.click(
        within(dialog).getByRole("button", { name: "Save photo" })
      );

      expect(await screen.findByText("Photo saved.")).toBeVisible();
      expect(uploads).toEqual(["IMG_0042.HEIC"]);
    });

    it("checks the type and size before cropping", async () => {
      const { user } = renderPage();

      // A picker set to "All files" lets these past `accept`.
      const input = await screen.findByLabelText("Upload profile photo");
      input.removeAttribute("accept");
      await user.upload(
        input,
        new File(["%PDF"], "scan.pdf", { type: "application/pdf" })
      );

      expect(
        await screen.findByText(
          "This type of image isn't supported. Use JPEG, PNG, WebP, or HEIC."
        )
      ).toBeVisible();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("explains an image the server rejects", async () => {
      stubCanvas();
      server.use(
        http.put(
          AVATAR_URL,
          () =>
            HttpResponse.json(
              {
                code: "UNSUPPORTED_FILE_TYPE",
                message: "Unsupported file type",
              },
              { status: 415 }
            ),
          { once: true }
        )
      );
      const { user } = renderPage();

      const dialog = await pickPhoto(user);
      loadPhoto(dialog);
      await user.click(
        within(dialog).getByRole("button", { name: "Save photo" })
      );

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "This type of image isn't supported. Use JPEG, PNG, WebP, or HEIC."
      );
      expect(alice().image).toBeNull();
    });

    it("removes the photo after asking", async () => {
      alice().image = "https://avatars.example.com/alice.webp";
      const { user } = renderPage();

      await user.click(
        await screen.findByRole("button", { name: "Change profile photo" })
      );
      await user.click(
        await screen.findByRole("menuitem", { name: "Remove photo" })
      );
      const dialog = await screen.findByRole("alertdialog", {
        name: "Remove your photo?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      expect(await screen.findByText("Photo removed.")).toBeVisible();
      expect(alice().image).toBeNull();
      const add = await screen.findByRole("button", {
        name: "Add profile photo",
      });
      expect(within(add).getByText("AN")).toBeVisible();
      await waitFor(() => expect(add).toHaveFocus());
    });
  });

  it("changes the password and signs out other devices by default", async () => {
    let sent: unknown;
    const record = async ({ request }: { request: Request }) => {
      if (request.url.endsWith("/api/auth/change-password")) {
        sent = await request.clone().json();
      }
    };
    server.events.on("request:start", record);
    onTestFinished(() => server.events.removeListener("request:start", record));
    const { user } = renderPage();

    await user.type(
      await screen.findByLabelText("Current password"),
      MOCK_PASSWORD
    );
    await user.type(screen.getByLabelText("New password"), "a new password");
    expect(
      screen.getByRole("checkbox", { name: "Sign out of other devices" })
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText(
        "Password changed. Your other devices are signed out."
      )
    ).toBeVisible();
    expect(sent).toEqual({
      currentPassword: MOCK_PASSWORD,
      newPassword: "a new password",
      revokeOtherSessions: true,
    });
    expect(alice().password).toBe("a new password");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("keeps other devices signed in when asked", async () => {
    const { user } = renderPage();

    await user.type(
      await screen.findByLabelText("Current password"),
      MOCK_PASSWORD
    );
    await user.type(screen.getByLabelText("New password"), "a new password");
    await user.click(
      screen.getByRole("checkbox", { name: "Sign out of other devices" })
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Password changed.")).toBeVisible();
  });

  it("explains a wrong current password and a short new one", async () => {
    const { user } = renderPage();

    const current = await screen.findByLabelText("Current password");
    await user.type(current, "not the password");
    await user.type(screen.getByLabelText("New password"), "a new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    await expect
      .poll(() => current.getAttribute("aria-describedby"))
      .toContain("error");
    expect(current).toHaveAccessibleDescription(
      "That's not your current password."
    );
    expect(alice().password).toBe(MOCK_PASSWORD);

    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(
      expect.stringContaining("Use at least 8 characters.")
    );
    await expectNoAxeViolations();
  });

  it("sets the theme and remembers it on the device", async () => {
    const { user } = renderPage();

    const dark = screen.getByRole("button", { name: "Dark" });
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.click(dark);

    expect(dark).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "System" }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("lists this device first, then the others by last activity", async () => {
    renderPage();

    const devices = await devicesSection();
    const rows = await within(devices).findAllByRole("listitem");

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("This device");
    expect(rows[1]).toHaveTextContent("Safari on iOS");
    expect(rows[1]).toHaveTextContent("203.0.113.7");
    expect(rows[2]).toHaveTextContent("Firefox on Windows");
    expect(
      within(rows[0] as HTMLElement).queryByRole("button")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("signs out one other device", async () => {
    const { user } = renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Sign out Firefox on Windows" })
    );

    const devices = section("Signed-in devices");
    await expect
      .poll(() => within(devices).queryByText("Firefox on Windows"))
      .toBeNull();
    expect(within(devices).getAllByRole("listitem")).toHaveLength(2);
    expect(db.state.otherSessions.map(({ userAgent }) => userAgent)).toEqual([
      expect.stringContaining("iPhone"),
    ]);
  });

  it("signs out every other device after asking", async () => {
    const { user } = renderPage();
    const devices = await devicesSection();

    await user.click(
      await screen.findByRole("button", {
        name: "Sign out of all other devices",
      })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Sign out of 2 other devices?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    // The open dialog hides the rest of the page from queries until it closes.
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    await expect
      .poll(() => within(devices).queryAllByRole("listitem").length)
      .toBe(1);
    expect(
      screen.queryByRole("button", { name: "Sign out of all other devices" })
    ).not.toBeInTheDocument();
    expect(alice().id).toBe(db.state.sessionUserId);
  });

  it("drops the other devices after a password change that signs them out", async () => {
    const { user } = renderPage();
    const devices = await devicesSection();
    await within(devices).findByText("Safari on iOS");

    await user.type(screen.getByLabelText("Current password"), MOCK_PASSWORD);
    await user.type(screen.getByLabelText("New password"), "a new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    await expect
      .poll(() => within(devices).queryAllByRole("listitem").length)
      .toBe(1);
  });

  it("shows an error with a retry when the devices fail to load", async () => {
    server.use(
      http.get("*/api/auth/list-sessions", () =>
        HttpResponse.json(
          { code: "INTERNAL_SERVER_ERROR", message: "Boom" },
          { status: 500 }
        )
      )
    );
    renderPage();

    expect(await screen.findByText("Couldn't load your devices")).toBeVisible();
    expect(
      within(section("Signed-in devices")).getByRole("button", {
        name: "Try again",
      })
    ).toBeVisible();
  });
});
