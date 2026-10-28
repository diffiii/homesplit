import type {
  CreateShoppingItemRequest,
  ListShoppingItemsQuery,
  ShoppingItem,
  ShoppingItemListResponse,
  UpdateShoppingItemRequest,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
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
}
