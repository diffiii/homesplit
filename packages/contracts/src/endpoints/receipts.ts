import { HouseholdIdParams } from "../features/households";
import {
  AssignReceiptItemsRequest,
  ConfirmReceiptRequest,
  ConfirmReceiptResponse,
  CreateReceiptRequest,
  ListReceiptsQuery,
  Receipt,
  ReceiptIdParams,
  ReceiptListResponse,
  ReceiptSplit,
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
  /** Replaces the assignments of the listed items only. */
  assignReceiptItems: {
    method: "PUT",
    path: `${RECEIPT}/assignments`,
    params: ReceiptIdParams,
    body: AssignReceiptItemsRequest,
    status: 200,
    response: Receipt,
  },
  /** Each person's amount as the receipt would split now. */
  getReceiptSplit: {
    method: "GET",
    path: `${RECEIPT}/split`,
    params: ReceiptIdParams,
    status: 200,
    response: ReceiptSplit,
  },
  /** Creates the expense and confirms the receipt, in one transaction. */
  confirmReceipt: {
    method: "POST",
    path: `${RECEIPT}/confirm`,
    params: ReceiptIdParams,
    body: ConfirmReceiptRequest,
    status: 200,
    response: ConfirmReceiptResponse,
  },
} as const satisfies Record<string, Endpoint>;
