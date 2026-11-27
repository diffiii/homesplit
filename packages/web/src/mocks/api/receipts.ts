import type {
  Receipt,
  ReceiptItemInput,
  ReceiptSummary,
} from "@homesplit/contracts";
import { todayIsoDate } from "@/lib/dates";
import {
  type MockDb,
  type MockHousehold,
  type MockReceipt,
  type MockReceiptItem,
  now,
} from "../db";
import { conflict, invalidReference, MockApiError } from "../errors";
import type { MockRoutes } from "../routes";
import {
  asc,
  desc,
  findInHousehold,
  paginate,
  removeRow,
  sortBy,
} from "./shared";

/** What the mocks "read" from every scanned file: a small grocery receipt that adds up. */
const SAMPLE_DRAFT = {
  merchant: "Biedronka",
  currency: "PLN",
  totalCents: 1459,
  discountCents: 0,
  items: [
    {
      name: "Mleko 2% 1L",
      quantity: 2,
      unitPriceCents: 349,
      discountCents: 0,
      totalCents: 698,
    },
    {
      name: "Chleb",
      quantity: 1,
      unitPriceCents: 450,
      discountCents: 0,
      totalCents: 450,
    },
    {
      name: "Jabłka",
      quantity: 0.452,
      unitPriceCents: 689,
      discountCents: 0,
      totalCents: 311,
    },
  ],
};

/** Like `AiService`: 403 while the household's `ai` module is off. */
function assertAiEnabled(household: MockHousehold): void {
  if (!household.features.ai) {
    throw new MockApiError(
      403,
      "MODULE_DISABLED",
      "The ai module is disabled",
      { module: "ai" }
    );
  }
}

/**
 * Finishes a `processing` receipt the first time it's fetched after a scan
 * or a retry, alone or in the list, as if the model had answered by then:
 * the sample draft, or `MODULE_DISABLED` when `ai` was turned off in the
 * meantime. Screens get the `processing` receipt from the scan or retry
 * itself, so they still show the wait.
 */
function finishReading(db: MockDb, receipt: MockReceipt): void {
  if (receipt.status !== "processing") {
    return;
  }
  if (db.household(receipt.householdId)?.features.ai) {
    Object.assign(receipt, {
      ...SAMPLE_DRAFT,
      status: "ready",
      failureCode: null,
      purchasedOn: todayIsoDate(),
      items: SAMPLE_DRAFT.items.map((item, position) => ({
        ...item,
        id: crypto.randomUUID(),
        position,
      })),
    });
  } else {
    receipt.status = "failed";
    receipt.failureCode = "MODULE_DISABLED";
  }
  receipt.updatedAt = now();
  // A read is a GET, which the routes don't save after.
  db.changed();
}

function renderSummary(db: MockDb, receipt: MockReceipt): ReceiptSummary {
  return {
    id: receipt.id,
    householdId: receipt.householdId,
    attachmentId: receipt.attachmentId,
    status: receipt.status,
    failureCode: receipt.failureCode,
    merchant: receipt.merchant,
    purchasedOn: receipt.purchasedOn,
    currency: receipt.currency,
    totalCents: receipt.totalCents,
    discountCents: receipt.discountCents,
    suggestedCategory: null,
    expenseId: null,
    createdBy: db.summary(receipt.createdById),
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
  };
}

function renderReceipt(db: MockDb, receipt: MockReceipt): Receipt {
  const items = sortBy(
    receipt.items,
    asc((item) => item.position),
    asc((item) => item.id)
  );
  const itemsTotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  return {
    ...renderSummary(db, receipt),
    // The mocks don't assign items yet.
    items: items.map((item) => ({ ...item, assignments: [] })),
    itemsTotalCents,
    differenceCents:
      receipt.totalCents === null
        ? null
        : itemsTotalCents - receipt.discountCents - receipt.totalCents,
  };
}

/** Edits wait for the read, and a confirmed receipt is read-only. */
function assertEditable(receipt: MockReceipt): void {
  if (receipt.status === "processing") {
    throw conflict("RECEIPT_PROCESSING", "The receipt is still being read");
  }
  if (receipt.status === "confirmed") {
    throw conflict("RECEIPT_CONFIRMED", "The receipt is already confirmed");
  }
}

/** The new item list, keeping the IDs of the receipt's own items; others answer 400. */
function replaceItems(
  receipt: MockReceipt,
  items: ReceiptItemInput[]
): MockReceiptItem[] {
  const known = new Set(receipt.items.map(({ id }) => id));
  const unknown = items.flatMap(({ id }, index) =>
    id === undefined || known.has(id)
      ? []
      : [{ path: ["items", index, "id"], message: "Unknown item" }]
  );
  if (unknown.length > 0) {
    throw invalidReference(unknown);
  }
  return items.map(({ id, ...item }, position) => ({
    ...item,
    id: id ?? crypto.randomUUID(),
    position,
  }));
}

const receiptsOf = (db: MockDb, householdId: string) =>
  db.state.receipts.filter((receipt) => receipt.householdId === householdId);

export const receiptRoutes: MockRoutes = {
  listReceipts: {
    resolve: ({ db, household, query }) =>
      paginate(
        sortBy(
          receiptsOf(db, household.id),
          desc((receipt) => receipt.createdAt),
          desc((receipt) => receipt.id)
        ),
        query,
        (receipt) => {
          finishReading(db, receipt);
          return renderSummary(db, receipt);
        }
      ),
  },

  createReceipt: {
    module: "expenses",
    resolve: ({ db, household, userId, body }) => {
      const attachment = db.state.attachments.find(
        ({ id, householdId }) =>
          id === body.attachmentId && householdId === household.id
      );
      if (!attachment) {
        throw invalidReference([
          { path: ["attachmentId"], message: "Unknown attachment" },
        ]);
      }
      assertAiEnabled(household);
      const createdAt = now();
      const receipt: MockReceipt = {
        id: crypto.randomUUID(),
        householdId: household.id,
        attachmentId: attachment.id,
        status: "processing",
        failureCode: null,
        merchant: null,
        purchasedOn: null,
        currency: null,
        totalCents: null,
        discountCents: 0,
        items: [],
        createdById: userId,
        createdAt,
        updatedAt: createdAt,
      };
      db.state.receipts.push(receipt);
      return renderReceipt(db, receipt);
    },
  },

  getReceipt: {
    resolve: ({ db, household, params }) => {
      const receipt = findInHousehold(
        db.state.receipts,
        household.id,
        params.receiptId
      );
      finishReading(db, receipt);
      return renderReceipt(db, receipt);
    },
  },

  updateReceipt: {
    module: "expenses",
    resolve: ({ db, household, params, body }) => {
      const receipt = findInHousehold(
        db.state.receipts,
        household.id,
        params.receiptId
      );
      assertEditable(receipt);
      const { items, ...header } = body;
      if (items) {
        receipt.items = replaceItems(receipt, items);
      }
      for (const [key, value] of Object.entries(header)) {
        if (value !== undefined) {
          Object.assign(receipt, { [key]: value });
        }
      }
      receipt.status = "ready";
      receipt.failureCode = null;
      receipt.updatedAt = now();
      return renderReceipt(db, receipt);
    },
  },

  deleteReceipt: {
    module: "expenses",
    resolve: ({ db, household, params }) => {
      const receipt = findInHousehold(
        db.state.receipts,
        household.id,
        params.receiptId
      );
      if (receipt.status === "confirmed") {
        throw conflict("RECEIPT_CONFIRMED", "The receipt is already confirmed");
      }
      removeRow(db.state.receipts, receipt);
    },
  },

  retryReceipt: {
    module: "expenses",
    resolve: ({ db, household, params }) => {
      const receipt = findInHousehold(
        db.state.receipts,
        household.id,
        params.receiptId
      );
      if (receipt.status !== "failed") {
        throw conflict(
          "RECEIPT_NOT_FAILED",
          "Only a failed receipt is retried"
        );
      }
      assertAiEnabled(household);
      Object.assign(receipt, {
        status: "processing",
        failureCode: null,
        updatedAt: now(),
      });
      return renderReceipt(db, receipt);
    },
  },
};
