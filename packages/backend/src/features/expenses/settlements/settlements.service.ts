import {
  type ConfirmedSettlement,
  type ListSettlementHistoryQuery,
  type ProcessSettlementRequest,
  planWriteOff,
  type Settlement,
  type SettlementListResponse,
  toSafeInteger,
  WRITE_OFF_NOTE,
  type WriteOffRequest,
  type WriteOffResponse,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db, type Executor, readSnapshot, type Transaction } from "@/db";
import { settlements } from "@/db/schema";
import {
  currentMembers,
  householdBalances,
} from "@/features/expenses/balances/balances.repository";
import {
  lockHouseholdForLedgerWrite,
  lockHouseholdLedger,
} from "@/features/expenses/household-ledger-lock";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { assertUsersEligible } from "@/features/households/access/household-access";
import { hasRole } from "@/features/households/access/roles";
import { userRole } from "@/features/users/user-projections";
import { AppError, forbidden, notFound } from "@/http/app-error";

const payer = userRole("payer");
const payee = userRole("payee");
const createdBy = userRole("created_by");
const confirmedBy = userRole("confirmed_by");

const selectSettlements = (executor: Executor) =>
  executor
    .select({
      id: settlements.id,
      householdId: settlements.householdId,
      payer: payer.summary,
      payee: payee.summary,
      createdBy: createdBy.summary,
      amountCents: settlements.amountCents,
      currency: settlements.currency,
      note: settlements.note,
      createdAt: settlements.createdAt,
      confirmedBy: confirmedBy.summary,
      confirmedAt: settlements.confirmedAt,
    })
    .from(settlements)
    .innerJoin(payer.table, eq(payer.table.id, settlements.payerId))
    .innerJoin(payee.table, eq(payee.table.id, settlements.payeeId))
    .innerJoin(createdBy.table, eq(createdBy.table.id, settlements.createdById))
    // A pending payment has no confirmer; an inner join would drop it.
    .leftJoin(
      confirmedBy.table,
      eq(confirmedBy.table.id, settlements.confirmedById)
    );

type SettlementRow = Awaited<ReturnType<typeof selectSettlements>>[number];

function toSettlement(row: SettlementRow): Settlement {
  const settlement = {
    id: row.id,
    householdId: row.householdId,
    payer: row.payer,
    payee: row.payee,
    createdBy: row.createdBy,
    amount: {
      amountCents: toSafeInteger(row.amountCents),
      currency: row.currency,
    },
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
  if (row.confirmedBy === null || row.confirmedAt === null) {
    return {
      ...settlement,
      status: "pending",
      confirmedBy: null,
      confirmedAt: null,
    };
  }
  return {
    ...settlement,
    status: "confirmed",
    confirmedBy: row.confirmedBy,
    confirmedAt: row.confirmedAt.toISOString(),
  };
}

const inHousehold = (householdId: string, settlementId: string) =>
  and(
    eq(settlements.id, settlementId),
    eq(settlements.householdId, householdId)
  );

/** Locks one settlement so a confirmation and a deletion can't interleave. */
async function lockSettlement(
  tx: Transaction,
  householdId: string,
  settlementId: string
) {
  const [row] = await tx
    .select({
      payerId: settlements.payerId,
      payeeId: settlements.payeeId,
      confirmedAt: settlements.confirmedAt,
    })
    .from(settlements)
    .where(inHousehold(householdId, settlementId))
    .for("update");
  if (!row) {
    throw notFound();
  }
  return row;
}

@Injectable()
export class SettlementsService {
  list(
    householdId: string,
    { page, pageSize, status }: ListSettlementHistoryQuery
  ): Promise<SettlementListResponse> {
    const where = and(
      eq(settlements.householdId, householdId),
      status === "pending" ? isNull(settlements.confirmedAt) : undefined,
      status === "confirmed" ? isNotNull(settlements.confirmedAt) : undefined
    );
    return readSnapshot(async (tx) => {
      const rows = await selectSettlements(tx)
        .where(where)
        .orderBy(desc(settlements.createdAt), desc(settlements.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const totalItems = await tx.$count(settlements, where);
      return { items: rows.map(toSettlement), page, pageSize, totalItems };
    });
  }

  /**
   * Every call adds one ledger entry; identical payments are never merged. A
   * payment recorded by its payer waits for confirmation, and any other is
   * confirmed at once by its recorder.
   */
  record(
    { householdId, role, userId }: HouseholdContext,
    { payerId, payeeId, amount, note = null }: ProcessSettlementRequest
  ): Promise<Settlement> {
    if (userId !== payerId && userId !== payeeId && !hasRole(role, "admin")) {
      throw forbidden();
    }

    return db.transaction(async (tx) => {
      await lockHouseholdForLedgerWrite(tx, householdId);
      await assertUsersEligible(
        tx,
        householdId,
        [
          { userId: payerId, path: ["payerId"] },
          { userId: payeeId, path: ["payeeId"] },
        ],
        "party"
      );

      const [{ id }] = await tx
        .insert(settlements)
        .values({
          householdId,
          payerId,
          payeeId,
          createdById: userId,
          amountCents: BigInt(amount.amountCents),
          currency: amount.currency,
          note,
          // `now()` is the transaction's start, the same instant as `created_at`.
          ...(userId === payerId
            ? {}
            : { confirmedById: userId, confirmedAt: sql`now()` }),
        })
        .returning({ id: settlements.id });
      return this.find(tx, householdId, id);
    });
  }

  /**
   * Records every payment of `planWriteOff` at once, confirmed by the caller,
   * with ledger writes held off so the balance can't move in between. Only a
   * departed member's balance can be written off, and only while it's still
   * `amountCents` and none of their payments in that currency are pending.
   */
  writeOff(
    { householdId, userId: recorderId }: HouseholdContext,
    { userId, currency, method, amountCents }: WriteOffRequest
  ): Promise<WriteOffResponse> {
    return db.transaction(async (tx) => {
      await lockHouseholdLedger(tx, householdId);
      await assertUsersEligible(
        tx,
        householdId,
        [{ userId, path: ["userId"] }],
        "party"
      );
      const members = await currentMembers(tx, householdId);
      if (members.some(({ id }) => id === userId)) {
        throw new AppError(
          409,
          "MEMBER_NOT_DEPARTED",
          "Only a departed member's balance can be written off"
        );
      }

      const balances = (await householdBalances(tx, householdId))
        .filter((row) => row.currency === currency)
        .map((row) => ({
          user: row.user,
          amountCents: toSafeInteger(row.amountCents),
        }));
      const subject = balances.find(({ user }) => user.id === userId);
      if (subject?.amountCents !== amountCents) {
        throw new AppError(
          409,
          "BALANCE_CHANGED",
          "The balance isn't the one given"
        );
      }

      const [pending] = await tx
        .select({ id: settlements.id })
        .from(settlements)
        .where(
          and(
            eq(settlements.householdId, householdId),
            eq(settlements.currency, currency),
            isNull(settlements.confirmedAt),
            or(eq(settlements.payerId, userId), eq(settlements.payeeId, userId))
          )
        )
        .limit(1);
      if (pending) {
        throw new AppError(
          409,
          "HAS_PENDING_PAYMENTS",
          "Their pending payments must be confirmed or deleted first"
        );
      }

      const payments = planWriteOff(method, subject, balances, members);
      const inserted = await tx
        .insert(settlements)
        .values(
          payments.map((payment) => ({
            householdId,
            payerId: payment.payer.id,
            payeeId: payment.payee.id,
            createdById: recorderId,
            amountCents: BigInt(payment.amountCents),
            currency,
            note: WRITE_OFF_NOTE,
            confirmedById: recorderId,
            confirmedAt: sql`now()`,
          }))
        )
        .returning({ id: settlements.id });
      const ids = inserted.map(({ id }) => id);
      const rows = await selectSettlements(tx).where(
        inArray(settlements.id, ids)
      );
      const items = rows
        .map((row) => {
          const settlement = toSettlement(row);
          if (settlement.status !== "confirmed") {
            throw new Error(
              `Write-off payment ${settlement.id} wasn't confirmed`
            );
          }
          return settlement;
        })
        .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      return { items };
    });
  }

  /** Idempotent: a confirmed payment keeps its original confirmer and time. */
  confirm(
    { householdId, role, userId }: HouseholdContext,
    settlementId: string
  ): Promise<ConfirmedSettlement> {
    return db.transaction(async (tx) => {
      await lockHouseholdForLedgerWrite(tx, householdId);
      const stored = await lockSettlement(tx, householdId, settlementId);
      const mayConfirm =
        userId === stored.payeeId ||
        (userId !== stored.payerId && hasRole(role, "admin"));
      if (!mayConfirm) {
        throw forbidden();
      }

      if (stored.confirmedAt === null) {
        await tx
          .update(settlements)
          .set({ confirmedById: userId, confirmedAt: sql`now()` })
          .where(inHousehold(householdId, settlementId));
      }
      const settlement = await this.find(tx, householdId, settlementId);
      if (settlement.status !== "confirmed") {
        throw new Error(`Settlement ${settlementId} wasn't confirmed`);
      }
      return settlement;
    });
  }

  /** Withdraws or rejects a pending payment; confirmed ones are permanent. */
  async delete(
    { householdId, role, userId }: HouseholdContext,
    settlementId: string
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await lockHouseholdForLedgerWrite(tx, householdId);
      const stored = await lockSettlement(tx, householdId, settlementId);
      if (
        userId !== stored.payerId &&
        userId !== stored.payeeId &&
        !hasRole(role, "admin")
      ) {
        throw forbidden();
      }
      if (stored.confirmedAt !== null) {
        throw new AppError(
          409,
          "SETTLEMENT_CONFIRMED",
          "A confirmed payment can't be deleted"
        );
      }

      await tx
        .delete(settlements)
        .where(inHousehold(householdId, settlementId));
    });
  }

  async find(
    executor: Executor,
    householdId: string,
    settlementId: string
  ): Promise<Settlement> {
    const [row] = await selectSettlements(executor).where(
      inHousehold(householdId, settlementId)
    );
    if (!row) {
      throw notFound();
    }
    return toSettlement(row);
  }
}
