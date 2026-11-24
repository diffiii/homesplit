import { HouseholdIdParams } from "../features/households";
import {
  CreateReceiptRequest,
  ListReceiptsQuery,
  Receipt,
  ReceiptIdParams,
  ReceiptListResponse,
  UpdateReceiptRequest,
} from "../features/receipts";
import type { Endpoint } from "./endpoint";
import { HOUSEHOLD } from "./paths";

const RECEIPTS = `${HOUSEHOLD}/receipts`;
const RECEIPT = `${RECEIPTS}/:receiptId`;

export const receiptEndpoints = {
  listReceipts: {
    method: "GET",
    path: RECEIPTS,
    params: HouseholdIdParams,
    query: ListReceiptsQuery,
    status: 200,
    response: ReceiptListResponse,
  },
  /** Answers at once with a `processing` receipt; poll `getReceipt` for the result. */
  createReceipt: {
    method: "POST",
    path: RECEIPTS,
    params: HouseholdIdParams,
    body: CreateReceiptRequest,
    status: 201,
    response: Receipt,
  },
  getReceipt: {
    method: "GET",
    path: RECEIPT,
    params: ReceiptIdParams,
    status: 200,
    response: Receipt,
  },
  updateReceipt: {
    method: "PATCH",
    path: RECEIPT,
    params: ReceiptIdParams,
    body: UpdateReceiptRequest,
    status: 200,
    response: Receipt,
  },
  deleteReceipt: {
    method: "DELETE",
    path: RECEIPT,
    params: ReceiptIdParams,
    status: 204,
    response: null,
  },
  /** Reads a `failed` receipt again; answers with it `processing`. */
  retryReceipt: {
    method: "POST",
    path: `${RECEIPT}/retry`,
    params: ReceiptIdParams,
    status: 200,
    response: Receipt,
  },
} as const satisfies Record<string, Endpoint>;
