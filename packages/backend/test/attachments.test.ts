import {
  ATTACHMENT_UPLOAD_FIELD,
  Attachment,
  AttachmentDownload,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
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

const padTo = (head: Buffer, size: number): Buffer =>
  Buffer.concat([head, Buffer.alloc(size - head.length)]);

const attachmentsPath = (householdId: string) =>
  `/api/households/${householdId}/attachments`;
const downloadPath = (householdId: string, attachmentId: string) =>
  `${attachmentsPath(householdId)}/${attachmentId}/download`;

const HOUR_MS = 60 * 60 * 1000;

describe("attachments API", () => {
  let app: INestApplication;
  let storage: InMemoryObjectStorage;

  beforeAll(async () => {
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

  describe("cleanup", () => {
    let alice: TestUser;
    let household: TestHousehold;
    let cleanup: AttachmentsCleanupService;

    beforeEach(async () => {
      alice = await createUser(app, "Alice");
      household = await createHousehold(alice);
      cleanup = app.get(AttachmentsCleanupService);
    });

    it("deletes unreferenced attachments only after the TTL", async () => {
      await upload(alice, household.id, PNG, "image/png").expect(201);

      expect(await cleanup.run(new Date(Date.now() + 23 * HOUR_MS))).toEqual({
        deletedAttachments: 0,
        deletedObjects: 0,
        failedObjects: 0,
      });
      expect(await countRows()).toBe(1);
      expect(storage.objects.size).toBe(1);

      expect(await cleanup.run(new Date(Date.now() + 25 * HOUR_MS))).toEqual({
        deletedAttachments: 1,
        deletedObjects: 1,
        failedObjects: 0,
      });
      expect(await countRows()).toBe(0);
      expect(storage.objects.size).toBe(0);
    });

    it("deletes the objects of a deleted household", async () => {
      await upload(alice, household.id, PNG, "image/png").expect(201);
      await upload(alice, household.id, PDF, "application/pdf").expect(201);

      await db.delete(organization).where(eq(organization.id, household.id));
      expect(await db.select().from(storageObjectDeletions)).toHaveLength(2);

      const result = await cleanup.run();
      expect(result).toMatchObject({
        deletedAttachments: 0,
        deletedObjects: 2,
      });
      expect(storage.objects.size).toBe(0);
      expect(await db.select().from(storageObjectDeletions)).toHaveLength(0);
    });

    it("keeps an object queued when deleting it fails", async () => {
      await upload(alice, household.id, PNG, "image/png").expect(201);
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
