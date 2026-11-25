import { readFileSync } from "node:fs";
import {
  ATTACHMENT_UPLOAD_FIELD,
  Attachment,
  AttachmentDownload,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { attachments, organization, storageObjectDeletions } from "@/db/schema";
import { AttachmentThumbnailsService } from "@/features/attachments/attachment-thumbnails.service";
import { AttachmentsCleanupService } from "@/features/attachments/attachments-cleanup.service";
import { InMemoryObjectStorage } from "@/storage/in-memory-object-storage";
import { ObjectStorage } from "@/storage/object-storage";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import {
  createHousehold,
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  leaveHousehold,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

/** Matches `ATTACHMENT_MAX_BYTES` in vitest.config.mts. */
const MAX_BYTES = 65_536;

/** A complete 1×1 grayscale PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==",
  "base64"
);
const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n");
const AVIF = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypavif"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("mif1avif"),
]);
const HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypheic"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("mif1heic"),
]);

/** A 48×32 image saved by macOS as an iPhone would. */
const HEIC_PHOTO = readFileSync("test/fixtures/photo.heic");
/** Starts like a JPEG, so it's accepted, but can't be decoded. */
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const solid = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } });

/**
 * A 600×400 JPEG, red on the left and blue on the right, whose EXIF says to
 * turn it 90° clockwise, as a phone held upright saves it. Upright, it's
 * 400×600 with red on top. It has an artist too, which a thumbnail must drop.
 */
async function sidewaysJpeg(): Promise<Buffer> {
  const red = await solid(300, 400, "#f00").png().toBuffer();
  return solid(600, 400, "#00f")
    .composite([{ input: red, left: 0, top: 0 }])
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Artist: "Alice" } })
    .toBuffer();
}

const padTo = (head: Buffer, size: number): Buffer =>
  Buffer.concat([head, Buffer.alloc(size - head.length)]);

const attachmentsPath = (householdId: string) =>
  `/api/households/${householdId}/attachments`;
const downloadPath = (householdId: string, attachmentId: string) =>
  `${attachmentsPath(householdId)}/${attachmentId}/download`;
const thumbnailPath = (householdId: string, attachmentId: string) =>
  `${attachmentsPath(householdId)}/${attachmentId}/thumbnail`;
const thumbnailKey = (householdId: string, attachmentId: string) =>
  `households/${householdId}/attachment-thumbnails/${attachmentId}.webp`;
const isThumbnailKey = (key: string) => key.includes("/attachment-thumbnails/");

const HOUR_MS = 60 * 60 * 1000;

const CACHE_CONTROL = /^private, max-age=(?<seconds>\d+)$/u;

describe("attachments API", () => {
  let app: INestApplication;
  let storage: InMemoryObjectStorage;
  let jpeg: Buffer;
  let png: Buffer;
  let webp: Buffer;

  beforeAll(async () => {
    jpeg = await sidewaysJpeg();
    png = await solid(1000, 200, "#3a3").png().toBuffer();
    webp = await solid(100, 80, "#33c").webp().toBuffer();
    app = await createTestApp();
    const provided = app.get(ObjectStorage);
    if (!(provided instanceof InMemoryObjectStorage)) {
      throw new Error("Tests expect STORAGE_DRIVER=memory");
    }
    storage = provided;
  });

  beforeEach(() => {
    storage.objects.clear();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  const upload = (
    user: TestUser,
    householdId: string,
    content: Buffer,
    contentType: string,
    filename = "upload.bin"
  ) =>
    user.client
      .post(attachmentsPath(householdId))
      .attach(ATTACHMENT_UPLOAD_FIELD, content, { filename, contentType });

  const countRows = async () => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(attachments);
    return count;
  };

  const storedThumbnailKey = async (attachmentId: string) => {
    const [row] = await db
      .select({ key: attachments.thumbnailStorageKey })
      .from(attachments)
      .where(eq(attachments.id, attachmentId));
    return row?.key;
  };

  const thumbnailKeys = () =>
    [...storage.objects.keys()].filter(isThumbnailKey).sort();

  describe("upload", () => {
    let alice: TestUser;
    let household: TestHousehold;

    beforeEach(async () => {
      alice = await createUser(app, "Alice");
      household = await createHousehold(alice);
    });

    it("stores the file under a server-generated key", async () => {
      const response = await upload(
        alice,
        household.id,
        PNG,
        "image/png",
        "../../etc/passwd.png"
      ).expect(201);

      const attachment = Attachment.parse(response.body);
      expect(attachment).toMatchObject({
        householdId: household.id,
        mimeType: "image/png",
        sizeBytes: PNG.length,
        uploadedBy: { id: alice.id, name: "Alice" },
      });
      expect(response.body).not.toHaveProperty("storageKey");

      const [row] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachment.id));
      expect(row.storageKey).toBe(
        `households/${household.id}/attachments/${attachment.id}`
      );
      expect(row.uploadedById).toBe(alice.id);
      expect(storage.objects.get(row.storageKey)).toEqual({
        body: PNG,
        contentType: "image/png",
      });
    });

    it.each([
      [
        "JPEG",
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        "image/jpeg",
        "image/jpeg",
      ],
      [
        "WebP",
        Buffer.from("RIFF\x24\0\0\0WEBPVP8 "),
        "image/webp",
        "image/webp",
      ],
      ["PDF", PDF, "application/pdf", "application/pdf"],
      ["HEIC", HEIC, "image/heic", "image/heic"],
      [
        "HEIC without a declared type",
        HEIC,
        "application/octet-stream",
        "image/heic",
      ],
      [
        "a PDF declared as an image, as a PDF",
        PDF,
        "image/png",
        "application/pdf",
      ],
    ])("accepts %s", async (_name, content, declared, stored) => {
      const response = await upload(
        alice,
        household.id,
        content,
        declared
      ).expect(201);
      expect(Attachment.parse(response.body).mimeType).toBe(stored);
    });

    it.each([
      ["a type outside the allowlist", Buffer.from("GIF89a"), "image/gif"],
      ["text declared as an image", Buffer.from("<html>"), "image/png"],
      ["AVIF, which isn't HEIC", AVIF, "image/heic"],
      ["an empty file", Buffer.alloc(0), "image/png"],
    ])("rejects %s", async (_name, content, declared) => {
      const response = await upload(
        alice,
        household.id,
        content,
        declared
      ).expect(415);
      expectApiError(response, "UNSUPPORTED_FILE_TYPE");
      expect(await countRows()).toBe(0);
      expect(storage.objects.size).toBe(0);
    });

    it("accepts a file of exactly the maximum size", async () => {
      const response = await upload(
        alice,
        household.id,
        padTo(PNG, MAX_BYTES),
        "image/png"
      ).expect(201);
      expect(Attachment.parse(response.body).sizeBytes).toBe(MAX_BYTES);
    });

    it("rejects a file over the maximum size", async () => {
      const response = await upload(
        alice,
        household.id,
        padTo(PNG, MAX_BYTES + 1),
        "image/png"
      ).expect(413);

      expectApiError(response, "PAYLOAD_TOO_LARGE");
      expect(await countRows()).toBe(0);
      expect(storage.objects.size).toBe(0);
    });

    it("requires a file in the upload field", async () => {
      const missing = await alice.client
        .post(attachmentsPath(household.id))
        .send({})
        .expect(400);
      expectApiError(missing, "VALIDATION_ERROR");

      const wrongField = await alice.client
        .post(attachmentsPath(household.id))
        .attach("document", PNG, {
          filename: "a.png",
          contentType: "image/png",
        })
        .expect(400);
      expectApiError(wrongField, "VALIDATION_ERROR");
    });

    it("leaves no row when the storage write fails", async () => {
      vi.spyOn(storage, "put").mockRejectedValueOnce(
        new Error("Storage unavailable")
      );

      const response = await upload(
        alice,
        household.id,
        PNG,
        "image/png"
      ).expect(500);

      expectApiError(response, "INTERNAL_ERROR");
      expect(await countRows()).toBe(0);
    });

    it("rejects visitors without a session", async () => {
      await createClient(app)
        .post(attachmentsPath(household.id))
        .attach(ATTACHMENT_UPLOAD_FIELD, PNG, {
          filename: "a.png",
          contentType: "image/png",
        })
        .expect(401);
      expect(await countRows()).toBe(0);
    });
  });

  describe("download", () => {
    it("returns a short-lived signed URL to any current member", async () => {
      const alice = await createUser(app, "Alice");
      const carol = await createUser(app, "Carol");
      const household = await createHousehold(alice);
      await inviteAndAccept(alice, household, carol);
      const { body } = await upload(
        alice,
        household.id,
        PDF,
        "application/pdf"
      );

      const before = Date.now();
      const response = await carol.client
        .get(downloadPath(household.id, body.id))
        .expect(200);

      const download = AttachmentDownload.parse(response.body);
      expect(download.url).toContain(
        `households/${household.id}/attachments/${body.id}`
      );
      expect(new Date(download.expiresAt).getTime()).toBeGreaterThan(before);
      expect(new Date(download.expiresAt).getTime()).toBeLessThanOrEqual(
        Date.now() + 5 * 60 * 1000
      );
    });

    it("hides attachments from other households", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      const { body } = await upload(
        alice,
        alice.household.id,
        PNG,
        "image/png"
      ).expect(201);

      const outsider = await bob.client
        .get(downloadPath(alice.household.id, body.id))
        .expect(404);
      expectApiError(outsider, "NOT_FOUND");

      const wrongHousehold = await bob.client
        .get(downloadPath(bob.household.id, body.id))
        .expect(404);
      expectApiError(wrongHousehold, "NOT_FOUND");

      const intoOther = await bob.client
        .post(attachmentsPath(alice.household.id))
        .attach(ATTACHMENT_UPLOAD_FIELD, PNG, {
          filename: "a.png",
          contentType: "image/png",
        })
        .expect(404);
      expectApiError(intoOther, "NOT_FOUND");
    });

    it("hides attachments from departed members", async () => {
      const alice = await createUser(app, "Alice");
      const carol = await createUser(app, "Carol");
      const household = await createHousehold(alice);
      await inviteAndAccept(alice, household, carol);
      const { body } = await upload(
        carol,
        household.id,
        PNG,
        "image/png"
      ).expect(201);
      await leaveHousehold(carol, household);

      await carol.client.get(downloadPath(household.id, body.id)).expect(404);
      await alice.client.get(downloadPath(household.id, body.id)).expect(200);
    });

    it("answers 404 for an unknown attachment", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);

      await alice.client
        .get(downloadPath(household.id, "7c9e6679-7425-40de-944b-e07fc1f90ae7"))
        .expect(404);
    });
  });

  describe("thumbnails", () => {
    let alice: TestUser;
    let household: TestHousehold;

    beforeEach(async () => {
      alice = await createUser(app, "Alice");
      household = await createHousehold(alice);
    });

    it.each([
      // Turned upright, so it's portrait.
      ["JPEG", () => jpeg, "image/jpeg", 171, 256],
      ["PNG", () => png, "image/png", 256, 51],
      // Never enlarged.
      ["WebP", () => webp, "image/webp", 100, 80],
      ["HEIC", () => HEIC_PHOTO, "image/heic", 48, 32],
    ])(
      "stores a WebP thumbnail of a %s without metadata",
      async (_type, content, contentType, width, height) => {
        const response = await upload(
          alice,
          household.id,
          content(),
          contentType
        ).expect(201);

        const attachment = Attachment.parse(response.body);
        expect(attachment.hasThumbnail).toBe(true);
        const key = thumbnailKey(household.id, attachment.id);
        expect(await storedThumbnailKey(attachment.id)).toBe(key);
        const stored = storage.objects.get(key);
        expect(stored?.contentType).toBe("image/webp");
        const metadata = await sharp(stored?.body).metadata();
        expect(metadata).toMatchObject({ format: "webp", width, height });
        expect(metadata.exif).toBeUndefined();
        expect(metadata.orientation).toBeUndefined();
      }
    );

    it("turns the thumbnail the way the photo's EXIF says", async () => {
      const { body } = await upload(
        alice,
        household.id,
        jpeg,
        "image/jpeg"
      ).expect(201);

      const stored = storage.objects.get(thumbnailKey(household.id, body.id));
      const { data, info } = await sharp(stored?.body)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const pixel = (x: number, y: number) => {
        const offset = (y * info.width + x) * info.channels;
        return [...data.subarray(offset, offset + 3)];
      };
      const center = Math.floor(info.width / 2);
      // Red was on the left, so upright it's on top.
      expect(pixel(center, 10)).toEqual([expect.closeTo(255, -1), 0, 0]);
      expect(pixel(center, info.height - 10)).toEqual([
        0,
        0,
        expect.closeTo(255, -1),
      ]);
    });

    it.each([
      ["a PDF", PDF, "application/pdf"],
      ["a JPEG that can't be decoded", JPEG_HEADER, "image/jpeg"],
      ["a HEIC that can't be decoded", HEIC, "image/heic"],
    ])("stores %s without a thumbnail", async (_name, content, declared) => {
      const response = await upload(
        alice,
        household.id,
        content,
        declared
      ).expect(201);

      const attachment = Attachment.parse(response.body);
      expect(attachment.hasThumbnail).toBe(false);
      expect(await storedThumbnailKey(attachment.id)).toBeNull();
      expect([...storage.objects.keys()]).toEqual([
        `households/${household.id}/attachments/${attachment.id}`,
      ]);
    });

    /** Thumbnail writes land but answer an error, as a timed-out PUT can. */
    function failThumbnailWrites(): void {
      const put = storage.put.bind(storage);
      vi.spyOn(storage, "put").mockImplementation(
        async (key, body, contentType) => {
          await put(key, body, contentType);
          if (isThumbnailKey(key)) {
            throw new Error("Storage timed out");
          }
        }
      );
    }

    it("stores the file without a thumbnail when storing the thumbnail fails", async () => {
      failThumbnailWrites();

      const response = await upload(
        alice,
        household.id,
        png,
        "image/png"
      ).expect(201);

      const attachment = Attachment.parse(response.body);
      expect(attachment.hasThumbnail).toBe(false);
      expect(await storedThumbnailKey(attachment.id)).toBeNull();
      // The write that landed is deleted again.
      expect([...storage.objects.keys()]).toEqual([
        `households/${household.id}/attachments/${attachment.id}`,
      ]);
      expect(await db.select().from(storageObjectDeletions)).toEqual([]);
    });

    it("leaves a failed thumbnail it can't delete for the backfill to reuse", async () => {
      failThumbnailWrites();
      vi.spyOn(storage, "delete").mockRejectedValueOnce(
        new Error("Storage unavailable")
      );

      const { body } = await upload(
        alice,
        household.id,
        png,
        "image/png"
      ).expect(201);

      const key = thumbnailKey(household.id, body.id);
      expect(storage.objects.has(key)).toBe(true);
      // Not queued, or cleanup could delete it once the backfill links it.
      expect(await db.select().from(storageObjectDeletions)).toEqual([]);
      vi.restoreAllMocks();
      expect(await app.get(AttachmentThumbnailsService).backfill()).toEqual({
        generated: 1,
        undecodable: 0,
        failed: 0,
      });
      expect(await storedThumbnailKey(body.id)).toBe(key);
      expect(thumbnailKeys()).toEqual([key]);
    });

    it("deletes the file and its thumbnail when the row can't be inserted", async () => {
      const put = storage.put.bind(storage);
      // The household goes between the writes, so the insert fails its key.
      vi.spyOn(storage, "put").mockImplementation(
        async (key, body, contentType) => {
          if (isThumbnailKey(key)) {
            await db
              .delete(organization)
              .where(eq(organization.id, household.id));
          }
          return put(key, body, contentType);
        }
      );

      const response = await upload(alice, household.id, png, "image/png");

      expect(response.status).toBe(409);
      expect(await countRows()).toBe(0);
      expect(storage.objects.size).toBe(0);
      expect(await db.select().from(storageObjectDeletions)).toEqual([]);
    });

    describe("route", () => {
      it("redirects any current member to a short-lived signed URL", async () => {
        const carol = await createUser(app, "Carol");
        await inviteAndAccept(alice, household, carol);
        const { body } = await upload(
          alice,
          household.id,
          png,
          "image/png"
        ).expect(201);

        const response = await carol.client
          .get(thumbnailPath(household.id, body.id))
          .expect(302);

        const url = new URL(response.headers.location ?? "");
        expect(url.pathname).toBe(`/${thumbnailKey(household.id, body.id)}`);
        expect(url.searchParams.get("expiresIn")).toBe("300");
        const maxAge = Number(
          CACHE_CONTROL.exec(response.headers["cache-control"] ?? "")?.groups
            ?.seconds
        );
        expect(maxAge).toBeGreaterThan(0);
        expect(maxAge).toBeLessThanOrEqual(300);
      });

      it.each([
        ["a PDF", PDF, "application/pdf"],
        ["an image that can't be decoded", JPEG_HEADER, "image/jpeg"],
        ["an unknown file", null, null],
      ])("answers 404 for %s", async (_name, content, declared) => {
        const id =
          content && declared
            ? (await upload(alice, household.id, content, declared).expect(201))
                .body.id
            : "7c9e6679-7425-40de-944b-e07fc1f90ae7";

        const response = await alice.client
          .get(thumbnailPath(household.id, id))
          .expect(404);

        expectApiError(response, "NOT_FOUND");
        // Only the redirect may be cached.
        expect(response.headers["cache-control"]).toBeUndefined();
      });

      it("hides thumbnails from other households, departed members, and visitors", async () => {
        const bob = await createUser(app, "Bob");
        const bobsHousehold = await createHousehold(bob);
        const carol = await createUser(app, "Carol");
        await inviteAndAccept(alice, household, carol);
        const { body } = await upload(
          alice,
          household.id,
          png,
          "image/png"
        ).expect(201);
        await leaveHousehold(carol, household);

        const outsider = await bob.client
          .get(thumbnailPath(household.id, body.id))
          .expect(404);
        expectApiError(outsider, "NOT_FOUND");
        const wrongHousehold = await bob.client
          .get(thumbnailPath(bobsHousehold.id, body.id))
          .expect(404);
        expectApiError(wrongHousehold, "NOT_FOUND");
        await carol.client
          .get(thumbnailPath(household.id, body.id))
          .expect(404);
        const visitor = await createClient(app)
          .get(thumbnailPath(household.id, body.id))
          .expect(401);
        expectApiError(visitor, "UNAUTHENTICATED");
      });
    });

    describe("backfill", () => {
      let thumbnails: AttachmentThumbnailsService;

      beforeEach(() => {
        thumbnails = app.get(AttachmentThumbnailsService);
      });

      /** Makes the stored files look uploaded before thumbnails existed. */
      async function forgetThumbnails(): Promise<void> {
        await db.update(attachments).set({ thumbnailStorageKey: null });
        for (const key of thumbnailKeys()) {
          storage.objects.delete(key);
        }
      }

      const uploadId = async (content: Buffer, contentType: string) =>
        Attachment.parse(
          (await upload(alice, household.id, content, contentType).expect(201))
            .body
        ).id;

      it("fills in thumbnails of existing images and can run again", async () => {
        // More images than a batch holds, so it takes several.
        const images = await Promise.all([
          ...Array.from({ length: 11 }, () => uploadId(PNG, "image/png")),
          uploadId(jpeg, "image/jpeg"),
          uploadId(HEIC_PHOTO, "image/heic"),
        ]);
        const pdf = await uploadId(PDF, "application/pdf");
        const broken = await uploadId(JPEG_HEADER, "image/jpeg");
        await forgetThumbnails();

        expect(await thumbnails.backfill()).toEqual({
          generated: 13,
          undecodable: 1,
          failed: 0,
        });
        const expected = images
          .map((id) => thumbnailKey(household.id, id))
          .sort();
        expect(thumbnailKeys()).toEqual(expected);
        expect(await Promise.all(images.map(storedThumbnailKey))).toEqual(
          images.map((id) => thumbnailKey(household.id, id))
        );
        expect(await storedThumbnailKey(pdf)).toBeNull();
        expect(await storedThumbnailKey(broken)).toBeNull();
        const metadata = await sharp(
          storage.objects.get(thumbnailKey(household.id, images[11]))?.body
        ).metadata();
        expect(metadata).toMatchObject({
          format: "webp",
          width: 171,
          height: 256,
        });
        expect(metadata.exif).toBeUndefined();

        // Only the image that can't be decoded is tried again.
        const get = vi.spyOn(storage, "get");
        expect(await thumbnails.backfill()).toEqual({
          generated: 0,
          undecodable: 1,
          failed: 0,
        });
        expect(get).toHaveBeenCalledTimes(1);
        expect(thumbnailKeys()).toEqual(expected);
      });

      it("passes over an image it can't read and retries it next run", async () => {
        const first = await uploadId(PNG, "image/png");
        const second = await uploadId(PNG, "image/png");
        await forgetThumbnails();
        vi.spyOn(storage, "get").mockRejectedValueOnce(
          new Error("Storage unavailable")
        );

        expect(await thumbnails.backfill()).toEqual({
          generated: 1,
          undecodable: 0,
          failed: 1,
        });
        expect(await thumbnails.backfill()).toEqual({
          generated: 1,
          undecodable: 0,
          failed: 0,
        });
        expect(thumbnailKeys()).toEqual(
          [first, second].map((id) => thumbnailKey(household.id, id)).sort()
        );
      });

      it("discards the thumbnail of a file deleted meanwhile", async () => {
        const id = await uploadId(PNG, "image/png");
        await forgetThumbnails();
        const put = storage.put.bind(storage);
        vi.spyOn(storage, "put").mockImplementation(
          async (key, body, contentType) => {
            await db.delete(attachments).where(eq(attachments.id, id));
            return put(key, body, contentType);
          }
        );

        expect(await thumbnails.backfill()).toEqual({
          generated: 0,
          undecodable: 0,
          failed: 0,
        });
        expect(thumbnailKeys()).toEqual([]);
        // The row's trigger queued only the file, which cleanup deletes.
        const queued = await db.select().from(storageObjectDeletions);
        expect(queued.map(({ storageKey }) => storageKey)).toEqual([
          `households/${household.id}/attachments/${id}`,
        ]);
      });

      it("keeps the thumbnail when setting the column fails, and links it next run", async () => {
        const id = await uploadId(PNG, "image/png");
        await forgetThumbnails();
        vi.spyOn(db, "update").mockImplementationOnce(() => {
          throw new Error("Database unavailable");
        });

        expect(await thumbnails.backfill()).toEqual({
          generated: 0,
          undecodable: 0,
          failed: 1,
        });
        // The row is still there, and the update may have committed.
        const key = thumbnailKey(household.id, id);
        expect(thumbnailKeys()).toEqual([key]);
        expect(await storedThumbnailKey(id)).toBeNull();

        expect(await thumbnails.backfill()).toMatchObject({ generated: 1 });
        expect(await storedThumbnailKey(id)).toBe(key);
      });
    });
  });

  describe("cleanup", () => {
    let alice: TestUser;
    let household: TestHousehold;
    let cleanup: AttachmentsCleanupService;

    beforeEach(async () => {
      alice = await createUser(app, "Alice");
      household = await createHousehold(alice);
      cleanup = app.get(AttachmentsCleanupService);
    });

    it("deletes unreferenced attachments, with their thumbnails, only after the TTL", async () => {
      await upload(alice, household.id, PNG, "image/png").expect(201);

      expect(await cleanup.run(new Date(Date.now() + 23 * HOUR_MS))).toEqual({
        deletedAttachments: 0,
        deletedObjects: 0,
        failedObjects: 0,
      });
      expect(await countRows()).toBe(1);
      expect(storage.objects.size).toBe(2);

      expect(await cleanup.run(new Date(Date.now() + 25 * HOUR_MS))).toEqual({
        deletedAttachments: 1,
        deletedObjects: 2,
        failedObjects: 0,
      });
      expect(await countRows()).toBe(0);
      expect(storage.objects.size).toBe(0);
    });

    it("deletes the objects of a deleted household", async () => {
      const image = await upload(alice, household.id, PNG, "image/png").expect(
        201
      );
      const pdf = await upload(
        alice,
        household.id,
        PDF,
        "application/pdf"
      ).expect(201);

      await db.delete(organization).where(eq(organization.id, household.id));
      const queued = await db.select().from(storageObjectDeletions);
      expect(queued.map(({ storageKey }) => storageKey).sort()).toEqual(
        [
          `households/${household.id}/attachments/${image.body.id}`,
          `households/${household.id}/attachments/${pdf.body.id}`,
          thumbnailKey(household.id, image.body.id),
        ].sort()
      );

      const result = await cleanup.run();
      expect(result).toMatchObject({
        deletedAttachments: 0,
        deletedObjects: 3,
      });
      expect(storage.objects.size).toBe(0);
      expect(await db.select().from(storageObjectDeletions)).toHaveLength(0);
    });

    it("keeps an object queued when deleting it fails", async () => {
      await upload(alice, household.id, PDF, "application/pdf").expect(201);
      await db.delete(organization).where(eq(organization.id, household.id));
      vi.spyOn(storage, "delete").mockRejectedValueOnce(
        new Error("Storage unavailable")
      );

      expect(await cleanup.run()).toMatchObject({
        deletedObjects: 0,
        failedObjects: 1,
      });
      expect(await db.select().from(storageObjectDeletions)).toHaveLength(1);

      expect(await cleanup.run()).toMatchObject({
        deletedObjects: 1,
        failedObjects: 0,
      });
      expect(storage.objects.size).toBe(0);
    });
  });
});
