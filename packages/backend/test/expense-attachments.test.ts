import {
  ATTACHMENT_UPLOAD_FIELD,
  AttachmentSummary,
  Expense,
  ExpenseAttachmentListResponse,
  ExpenseListResponse,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { attachments, expenseAttachments } from "@/db/schema";
import { AttachmentsCleanupService } from "@/features/attachments/attachments-cleanup.service";
import { InMemoryObjectStorage } from "@/storage/in-memory-object-storage";
import { ObjectStorage } from "@/storage/object-storage";
import { expectApiError } from "./helpers/api";
import { createTestApp } from "./helpers/app";
import { insertExpense } from "./helpers/expenses";
import {
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";
import { sendDuring } from "./helpers/locks";

/** A complete 1×1 grayscale PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==",
  "base64"
);
const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n");

const UNKNOWN_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

/** Matches `ATTACHMENT_MAX_PER_EXPENSE` in vitest.config.mts. */
const MAX_PER_EXPENSE = 2;

/** Past `ATTACHMENT_UNREFERENCED_TTL_HOURS`, the default 24. */
const AFTER_TTL_MS = 25 * 60 * 60 * 1000;

const householdPath = (householdId: string) => `/api/households/${householdId}`;
const expensePath = (householdId: string, expenseId: string) =>
  `${householdPath(householdId)}/expenses/${expenseId}`;
const linksPath = (householdId: string, expenseId: string) =>
  `${expensePath(householdId, expenseId)}/attachments`;
const linkPath = (
  householdId: string,
  expenseId: string,
  attachmentId: string
) => `${linksPath(householdId, expenseId)}/${attachmentId}`;

describe("expense attachments", () => {
  let app: INestApplication;
  let storage: InMemoryObjectStorage;
  let cleanup: AttachmentsCleanupService;

  beforeAll(async () => {
    app = await createTestApp();
    const provided = app.get(ObjectStorage);
    if (!(provided instanceof InMemoryObjectStorage)) {
      throw new Error("Tests expect STORAGE_DRIVER=memory");
    }
    storage = provided;
    cleanup = app.get(AttachmentsCleanupService);
  });

  beforeEach(() => {
    storage.objects.clear();
  });

  afterAll(async () => {
    await app?.close();
  });

  /**
   * Alice owns the household and Carol is its member, each with an expense of
   * their own. Bob owns another household.
   */
  async function setup() {
    const { alice, bob } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    const { household } = alice;
    await inviteAndAccept(alice, household, carol);
    const expenseId = await insertExpense(db, {
      householdId: household.id,
      authorId: alice.id,
    });
    const carolsExpenseId = await insertExpense(db, {
      householdId: household.id,
      authorId: carol.id,
    });
    return { alice, bob, carol, household, expenseId, carolsExpenseId };
  }

  async function upload(
    user: TestUser,
    household: TestHousehold,
    content = PNG,
    contentType = "image/png"
  ): Promise<AttachmentSummary> {
    const response = await user.client
      .post(`${householdPath(household.id)}/attachments`)
      .attach(ATTACHMENT_UPLOAD_FIELD, content, {
        filename: "receipt",
        contentType,
      })
      .expect(201);
    return AttachmentSummary.parse(response.body);
  }

  const link = (
    user: TestUser,
    household: TestHousehold,
    expenseId: string,
    attachmentId: string
  ) =>
    user.client.post(linksPath(household.id, expenseId)).send({ attachmentId });

  const unlink = (
    user: TestUser,
    household: TestHousehold,
    expenseId: string,
    attachmentId: string
  ) => user.client.delete(linkPath(household.id, expenseId, attachmentId));

  async function getExpense(
    user: TestUser,
    household: TestHousehold,
    expenseId: string
  ): Promise<Expense> {
    const response = await user.client
      .get(expensePath(household.id, expenseId))
      .expect(200);
    return Expense.parse(response.body);
  }

  async function listLinks(
    user: TestUser,
    household: TestHousehold,
    expenseId: string
  ): Promise<AttachmentSummary[]> {
    const response = await user.client
      .get(linksPath(household.id, expenseId))
      .expect(200);
    return ExpenseAttachmentListResponse.parse(response.body).items;
  }

  const attachmentRows = async () =>
    (await db.select({ id: attachments.id }).from(attachments)).map(
      ({ id }) => id
    );

  describe("linking", () => {
    it("returns summaries with every expense read", async () => {
      const { alice, carol, household, expenseId, carolsExpenseId } =
        await setup();
      expect(await listLinks(alice, household, expenseId)).toEqual([]);
      // `upload` parses the response as a summary, which is what links show.
      const image = await upload(alice, household);
      const pdf = await upload(carol, household, PDF, "application/pdf");
      expect(image.hasThumbnail).toBe(true);
      expect(pdf.hasThumbnail).toBe(false);

      const linked = await link(alice, household, expenseId, image.id);
      expect(linked.status).toBe(201);
      expect(linked.body).toEqual(image);
      await link(alice, household, expenseId, pdf.id).expect(201);
      // One file may be linked to several expenses, but once to each.
      await link(carol, household, carolsExpenseId, pdf.id).expect(201);
      const twice = await link(alice, household, expenseId, pdf.id).expect(409);
      expectApiError(twice, "ATTACHMENT_ALREADY_LINKED");

      const expense = await getExpense(carol, household, expenseId);
      expect(expense.attachments).toEqual([image, pdf]);
      expect(JSON.stringify(expense)).not.toContain("url");
      expect(await listLinks(carol, household, expenseId)).toEqual([
        image,
        pdf,
      ]);
      const { body } = await carol.client
        .get(`${householdPath(household.id)}/expenses`)
        .expect(200);
      expect(
        ExpenseListResponse.parse(body).items.map((item) => item.attachments)
      ).toEqual(expect.arrayContaining([[image, pdf], [pdf]]));
    });

    it("rejects another household's file and an unknown one", async () => {
      const { alice, bob, household, expenseId } = await setup();
      const bobsFile = await upload(bob, bob.household);

      const foreign = await link(alice, household, expenseId, bobsFile.id);
      const unknown = await link(alice, household, expenseId, UNKNOWN_ID);

      for (const response of [foreign, unknown]) {
        expect(response.status).toBe(400);
        expectApiError(response, "INVALID_REFERENCE");
        expect(response.body.details.issues).toEqual([
          { path: ["attachmentId"], message: "Unknown attachment" },
        ]);
      }
      // The database keeps the link in the file's household too.
      await expect(
        db.insert(expenseAttachments).values({
          expenseId,
          attachmentId: bobsFile.id,
          householdId: household.id,
        })
      ).rejects.toMatchObject({
        cause: { constraint: "expense_attachments_attachment_fk" },
      });
    });

    it("caps the files linked to one expense", async () => {
      const { alice, household, expenseId, carolsExpenseId } = await setup();
      const files = [
        await upload(alice, household),
        await upload(alice, household),
        await upload(alice, household),
      ];
      await link(alice, household, expenseId, files[0].id).expect(201);
      await link(alice, household, expenseId, files[1].id).expect(201);

      const over = await link(alice, household, expenseId, files[2].id).expect(
        409
      );

      expectApiError(over, "EXPENSE_ATTACHMENT_LIMIT_REACHED");
      expect(over.body.details).toEqual({ limit: MAX_PER_EXPENSE });
      // Another expense has its own cap, and unlinking frees a place.
      await link(alice, household, carolsExpenseId, files[2].id).expect(201);
      await unlink(alice, household, expenseId, files[0].id).expect(204);
      await link(alice, household, expenseId, files[2].id).expect(201);
    });

    it("hides another household's expense", async () => {
      const { bob, household, expenseId } = await setup();
      const bobsFile = await upload(bob, bob.household);

      await bob.client.get(linksPath(household.id, expenseId)).expect(404);
      await bob.client.get(linksPath(bob.household.id, expenseId)).expect(404);
      await link(bob, bob.household, expenseId, bobsFile.id).expect(404);
    });

    it("lets only the expense's author or an admin+ link and unlink", async () => {
      const { alice, carol, household, expenseId, carolsExpenseId } =
        await setup();
      const file = await upload(carol, household);

      const forbidden = await link(carol, household, expenseId, file.id).expect(
        403
      );
      expectApiError(forbidden, "FORBIDDEN");
      await link(carol, household, carolsExpenseId, file.id).expect(201);
      // Alice owns the household, so she may change Carol's expense.
      await link(alice, household, expenseId, file.id).expect(201);
      await unlink(carol, household, expenseId, file.id).expect(403);
      await unlink(alice, household, carolsExpenseId, file.id).expect(204);
    });
  });

  it("unlinks a file and keeps it until cleanup", async () => {
    const { alice, household, expenseId } = await setup();
    const file = await upload(alice, household);
    await link(alice, household, expenseId, file.id).expect(201);

    await unlink(alice, household, expenseId, file.id).expect(204);

    expect(await listLinks(alice, household, expenseId)).toEqual([]);
    expect(await attachmentRows()).toEqual([file.id]);
    const again = await unlink(alice, household, expenseId, file.id).expect(
      404
    );
    expectApiError(again, "NOT_FOUND");
  });

  it("deletes the links of a deleted expense and leaves the files to cleanup", async () => {
    const { alice, household, expenseId, carolsExpenseId } = await setup();
    const own = await upload(alice, household);
    const shared = await upload(alice, household, PDF, "application/pdf");
    await link(alice, household, expenseId, own.id).expect(201);
    await link(alice, household, expenseId, shared.id).expect(201);
    await link(alice, household, carolsExpenseId, shared.id).expect(201);

    await alice.client.delete(expensePath(household.id, expenseId)).expect(204);

    const links = await db.select().from(expenseAttachments);
    expect(links.map(({ attachmentId }) => attachmentId)).toEqual([shared.id]);
    expect(await attachmentRows()).toHaveLength(2);
    // Past the TTL, cleanup deletes the unlinked file, with its thumbnail, and
    // keeps the linked one.
    expect(await cleanup.run(new Date(Date.now() + AFTER_TTL_MS))).toEqual({
      deletedAttachments: 1,
      deletedObjects: 2,
      failedObjects: 0,
    });
    expect(await attachmentRows()).toEqual([shared.id]);
    expect([...storage.objects.keys()]).toEqual([
      `households/${household.id}/attachments/${shared.id}`,
    ]);
  });

  it("rejects linking and unlinking while the module is off, and keeps reads", async () => {
    const { alice, household, expenseId } = await setup();
    const file = await upload(alice, household);
    await link(alice, household, expenseId, file.id).expect(201);
    await alice.client
      .patch(`${householdPath(household.id)}/features`)
      .send({ expenses: false })
      .expect(200);

    const linking = await link(alice, household, expenseId, UNKNOWN_ID);
    const unlinking = await unlink(alice, household, expenseId, file.id);

    for (const response of [linking, unlinking]) {
      expect(response.status).toBe(403);
      expectApiError(response, "MODULE_DISABLED");
    }
    expect(await listLinks(alice, household, expenseId)).toEqual([file]);
    expect((await getExpense(alice, household, expenseId)).attachments).toEqual(
      [file]
    );
  });

  describe("racing cleanup", () => {
    it("answers 400 when cleanup deletes the file first", async () => {
      const { alice, household, expenseId } = await setup();
      const file = await upload(alice, household);

      // Holds the row the way cleanup does, then deletes it.
      const response = await sendDuring(
        (tx) => tx.delete(attachments).where(eq(attachments.id, file.id)),
        () => link(alice, household, expenseId, file.id)
      );

      expect(response.status).toBe(400);
      expectApiError(response, "INVALID_REFERENCE");
    });

    it("lets cleanup skip a file while a link to it is written", async () => {
      const { alice, household } = await setup();
      const file = await upload(alice, household);

      // Holds the row the way a link in progress does.
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT 1 FROM ${attachments} WHERE ${attachments.id} = ${file.id} FOR KEY SHARE`
        );
        expect(
          await cleanup.run(new Date(Date.now() + AFTER_TTL_MS))
        ).toMatchObject({ deletedAttachments: 0 });
      });

      expect(await attachmentRows()).toEqual([file.id]);
    });
  });
});
