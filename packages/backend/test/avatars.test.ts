import { readFileSync } from "node:fs";
import { AVATAR_UPLOAD_FIELD, UserSummary } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { AVATAR_SIZE } from "@/features/users/avatar-image";
import { InMemoryObjectStorage } from "@/storage/in-memory-object-storage";
import { AVATAR_STORAGE, ObjectStorage } from "@/storage/object-storage";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import { createUser, type TestUser } from "./helpers/fixtures";

const AVATAR = "/api/me/avatar";

/** Matches `AVATAR_MAX_BYTES` in vitest.config.mts. */
const MAX_BYTES = 65_536;

const PUBLIC_URL = "https://avatars.invalid/";

/** A 48×32 image saved by macOS as an iPhone would. */
const HEIC = readFileSync("test/fixtures/photo.heic");
const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n");
const AVIF = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypavif"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("mif1avif"),
]);

const photo = () =>
  sharp({ create: { width: 60, height: 40, channels: 3, background: "#c33" } });

const keyOf = (url: string | null) => (url ?? "").slice(PUBLIC_URL.length);

const storedImage = async (id: string) =>
  (await db.select().from(user).where(eq(user.id, id)))[0].image;

describe("avatars", () => {
  let app: INestApplication;
  let storage: InMemoryObjectStorage;
  let attachmentStorage: InMemoryObjectStorage;
  let alice: TestUser;
  let jpeg: Buffer;
  let png: Buffer;
  let webp: Buffer;

  beforeAll(async () => {
    // With EXIF a camera would add, which the stored avatar must not keep.
    jpeg = await photo()
      .jpeg()
      .withExif({ IFD0: { Artist: "Alice" } })
      .toBuffer();
    png = await photo().png().toBuffer();
    webp = await photo().webp().toBuffer();
    app = await createTestApp();
    const avatars = app.get(AVATAR_STORAGE);
    const attachments = app.get(ObjectStorage);
    if (
      !(
        avatars instanceof InMemoryObjectStorage &&
        attachments instanceof InMemoryObjectStorage
      )
    ) {
      throw new Error("Tests expect STORAGE_DRIVER=memory");
    }
    storage = avatars;
    attachmentStorage = attachments;
  });

  beforeEach(async () => {
    storage.objects.clear();
    attachmentStorage.objects.clear();
    alice = await createUser(app, "Alice");
  });

  afterAll(async () => {
    await app?.close();
  });

  const upload = (caller: TestUser, content: Buffer, contentType: string) =>
    caller.client
      .put(AVATAR)
      .attach(AVATAR_UPLOAD_FIELD, content, { filename: "a", contentType });

  async function uploadAvatar(caller: TestUser): Promise<UserSummary> {
    const response = await upload(caller, png, "image/png").expect(200);
    return UserSummary.parse(response.body);
  }

  it.each([
    ["JPEG", () => jpeg, "image/jpeg"],
    ["PNG", () => png, "image/png"],
    ["WebP", () => webp, "image/webp"],
    ["HEIC", () => HEIC, "image/heic"],
  ])(
    "stores a %s as a square WebP without metadata",
    async (_type, content, contentType) => {
      const response = await upload(alice, content(), contentType).expect(200);

      const { imageUrl } = UserSummary.parse(response.body);
      expect(keyOf(imageUrl)).toMatch(
        new RegExp(`^${alice.id}/[0-9a-f-]{36}\\.webp$`)
      );
      expect(await storedImage(alice.id)).toBe(imageUrl);
      const stored = storage.objects.get(keyOf(imageUrl));
      expect(stored?.contentType).toBe("image/webp");
      // Avatars never land in the private attachments bucket.
      expect(attachmentStorage.objects.size).toBe(0);
      const metadata = await sharp(stored?.body).metadata();
      expect(metadata).toMatchObject({
        format: "webp",
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
      });
      expect(metadata.exif).toBeUndefined();
    }
  );

  it("rejects a file over the maximum size", async () => {
    const padded = Buffer.concat([
      png,
      Buffer.alloc(MAX_BYTES + 1 - png.length),
    ]);

    const response = await upload(alice, padded, "image/png").expect(413);

    expectApiError(response, "PAYLOAD_TOO_LARGE");
    expect(storage.objects.size).toBe(0);
  });

  it.each([
    ["a PDF declared as a JPEG", () => PDF, "image/jpeg"],
    ["text declared as a PNG", () => Buffer.from("hello"), "image/png"],
    ["an AVIF declared as HEIC", () => AVIF, "image/heic"],
    ["a JPEG header alone", () => jpeg.subarray(0, 64), "image/jpeg"],
  ])("rejects %s", async (_label, content, contentType) => {
    const response = await upload(alice, content(), contentType).expect(415);

    expectApiError(response, "UNSUPPORTED_FILE_TYPE");
    expect(storage.objects.size).toBe(0);
    expect(await storedImage(alice.id)).toBeNull();
  });

  it("replaces the avatar and deletes the previous object", async () => {
    const first = await uploadAvatar(alice);

    const second = await uploadAvatar(alice);

    expect(second.imageUrl).not.toBe(first.imageUrl);
    expect([...storage.objects.keys()]).toEqual([keyOf(second.imageUrl)]);
  });

  it("deletes the avatar and its object", async () => {
    await uploadAvatar(alice);

    await alice.client.delete(AVATAR).expect(204);

    expect(await storedImage(alice.id)).toBeNull();
    expect(storage.objects.size).toBe(0);
    await alice.client.delete(AVATAR).expect(204);
  });

  it("never deletes another user's avatar", async () => {
    const bob = await createUser(app, "Bob");
    const bobs = await uploadAvatar(bob);

    const response = await alice.client
      .patch("/api/me")
      .send({ imageUrl: bobs.imageUrl })
      .expect(400);
    expectApiError(response, "VALIDATION_ERROR");
    await alice.client.delete(AVATAR).expect(204);

    expect([...storage.objects.keys()]).toEqual([keyOf(bobs.imageUrl)]);
  });

  it("requires a session", async () => {
    await createClient(app).put(AVATAR).expect(401);
    await createClient(app).delete(AVATAR).expect(401);
  });
});
