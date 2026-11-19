import type {
  ClearPurchasedShoppingItemsResponse,
  CreateShoppingItemRequest,
  ListShoppingItemsQuery,
  PurchasedShoppingItem,
  PurchaseReceiptShoppingItemsResponse,
  ShoppingItem,
  ShoppingItemListResponse,
  UnpurchasedShoppingItem,
  UpdateShoppingItemRequest,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db, type Executor, readSnapshot } from "@/db";
import { shoppingItems } from "@/db/schema";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { userRole } from "@/features/users/user-projections";
import { notFound } from "@/http/app-error";

const addedBy = userRole("added_by");
const purchasedBy = userRole("purchased_by");

const selectItems = (executor: Executor) =>
  executor
    .select({
      id: shoppingItems.id,
      householdId: shoppingItems.householdId,
      name: shoppingItems.name,
      quantity: shoppingItems.quantity,
      unit: shoppingItems.unit,
      addedBy: addedBy.summary,
      addedAt: shoppingItems.addedAt,
      purchasedBy: purchasedBy.summary,
      purchasedAt: shoppingItems.purchasedAt,
    })
    .from(shoppingItems)
    .innerJoin(addedBy.table, eq(addedBy.table.id, shoppingItems.addedById))
    .leftJoin(
      purchasedBy.table,
      eq(purchasedBy.table.id, shoppingItems.purchasedById)
    );

type ShoppingItemRow = Awaited<ReturnType<typeof selectItems>>[number];

function toShoppingItem(row: ShoppingItemRow): ShoppingItem {
  const item = {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    addedBy: row.addedBy,
    addedAt: row.addedAt.toISOString(),
  };
  if (row.purchasedBy === null || row.purchasedAt === null) {
    return {
      ...item,
      isPurchased: false,
      purchasedBy: null,
      purchasedAt: null,
    };
  }
  return {
    ...item,
    isPurchased: true,
    purchasedBy: row.purchasedBy,
    purchasedAt: row.purchasedAt.toISOString(),
  };
}

const inHousehold = (householdId: string, itemId: string) =>
  and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, householdId));

async function findItem(
  executor: Executor,
  householdId: string,
  itemId: string
): Promise<ShoppingItem> {
  const [row] = await selectItems(executor).where(
    inHousehold(householdId, itemId)
  );
  if (!row) {
    throw notFound();
  }
  return toShoppingItem(row);
}

@Injectable()
export class ShoppingItemsService {
  list(
    householdId: string,
    { page, pageSize, includePurchased }: ListShoppingItemsQuery
  ): Promise<ShoppingItemListResponse> {
    const where = and(
      eq(shoppingItems.householdId, householdId),
      includePurchased ? undefined : isNull(shoppingItems.purchasedAt)
    );
    return readSnapshot(async (tx) => {
      const rows = await selectItems(tx)
        .where(where)
        .orderBy(
          asc(sql`${shoppingItems.purchasedAt} IS NOT NULL`),
          asc(shoppingItems.addedAt),
          asc(shoppingItems.id)
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const totalItems = await tx.$count(shoppingItems, where);
      return {
        items: rows.map(toShoppingItem),
        page,
        pageSize,
        totalItems,
      };
    });
  }

  create(
    { householdId, userId }: HouseholdContext,
    { name, quantity, unit = null }: CreateShoppingItemRequest
  ): Promise<ShoppingItem> {
    return db.transaction(async (tx) => {
      const [{ id }] = await tx
        .insert(shoppingItems)
        .values({ householdId, name, quantity, unit, addedById: userId })
        .returning({ id: shoppingItems.id });
      return findItem(tx, householdId, id);
    });
  }

  get(householdId: string, itemId: string): Promise<ShoppingItem> {
    return findItem(db, householdId, itemId);
  }

  update(
    householdId: string,
    itemId: string,
    patch: UpdateShoppingItemRequest
  ): Promise<ShoppingItem> {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(shoppingItems)
        .set(patch)
        .where(inHousehold(householdId, itemId))
        .returning({ id: shoppingItems.id });
      if (updated.length === 0) {
        throw notFound();
      }
      return findItem(tx, householdId, itemId);
    });
  }

  async delete(householdId: string, itemId: string): Promise<void> {
    const deleted = await db
      .delete(shoppingItems)
      .where(inHousehold(householdId, itemId))
      .returning({ id: shoppingItems.id });
    if (deleted.length === 0) {
      throw notFound();
    }
  }

  async purchase(
    { householdId, userId }: HouseholdContext,
    itemId: string
  ): Promise<PurchasedShoppingItem> {
    const item = await this.transition(householdId, itemId, true, {
      purchasedAt: sql`now()`,
      purchasedById: userId,
    });
    if (!item.isPurchased) {
      throw new Error("Shopping item not purchased after purchase");
    }
    return item;
  }

  async unpurchase(
    householdId: string,
    itemId: string
  ): Promise<UnpurchasedShoppingItem> {
    const item = await this.transition(householdId, itemId, false, {
      purchasedAt: null,
      purchasedById: null,
    });
    if (item.isPurchased) {
      throw new Error("Shopping item still purchased after unpurchase");
    }
    return item;
  }

  /**
   * Marks several of the household's items purchased by `purchasedById` at
   * `purchasedAt`, as `purchase` would, in one update. Only unpurchased items
   * change, and the rows are locked first, so an update that waited on a
   * concurrent purchase sees it and skips the item: each item is purchased
   * once. Items purchased or gone meanwhile, and
   * other households' items, are reported as skipped.
   */
  purchaseMany(
    householdId: string,
    itemIds: readonly string[],
    { purchasedById, purchasedAt }: { purchasedAt: Date; purchasedById: string }
  ): Promise<PurchaseReceiptShoppingItemsResponse> {
    const ofHousehold = and(
      eq(shoppingItems.householdId, householdId),
      inArray(shoppingItems.id, [...itemIds])
    );
    return db.transaction(async (tx) => {
      // Locked in ID order first, so two requests for overlapping items
      // queue up instead of deadlocking.
      await tx
        .select({ id: shoppingItems.id })
        .from(shoppingItems)
        .where(ofHousehold)
        .orderBy(asc(shoppingItems.id))
        .for("update");
      const updated = await tx
        .update(shoppingItems)
        .set({ purchasedById, purchasedAt })
        .where(and(ofHousehold, isNull(shoppingItems.purchasedAt)))
        .returning({ id: shoppingItems.id });
      const rows = await selectItems(tx).where(ofHousehold);
      const found = new Map(rows.map((row) => [row.id, toShoppingItem(row)]));
      const marked = new Set(updated.map(({ id }) => id));

      const purchased: PurchasedShoppingItem[] = [];
      const skipped: PurchaseReceiptShoppingItemsResponse["skipped"] = [];
      for (const itemId of itemIds) {
        const item = found.get(itemId);
        if (item?.isPurchased && marked.has(itemId)) {
          purchased.push(item);
        } else {
          skipped.push({
            itemId,
            reason: item ? "ALREADY_PURCHASED" : "NOT_FOUND",
          });
        }
      }
      return { purchased, skipped };
    });
  }

  async clearPurchased(
    householdId: string
  ): Promise<ClearPurchasedShoppingItemsResponse> {
    const deleted = await db
      .delete(shoppingItems)
      .where(
        and(
          eq(shoppingItems.householdId, householdId),
          isNotNull(shoppingItems.purchasedAt)
        )
      )
      .returning({ id: shoppingItems.id });
    return { deletedCount: deleted.length };
  }

  private transition(
    householdId: string,
    itemId: string,
    isPurchased: boolean,
    metadata: PgUpdateSetSource<typeof shoppingItems>
  ): Promise<ShoppingItem> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ purchasedAt: shoppingItems.purchasedAt })
        .from(shoppingItems)
        .where(inHousehold(householdId, itemId))
        .for("update");
      if (!current) {
        throw notFound();
      }

      if ((current.purchasedAt !== null) !== isPurchased) {
        await tx
          .update(shoppingItems)
          .set(metadata)
          .where(inHousehold(householdId, itemId));
      }

      return findItem(tx, householdId, itemId);
    });
  }
}
