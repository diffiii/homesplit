import type {
  Chore,
  ChoreListResponse,
  CreateChoreRequest,
  ListChoresQuery,
  UpdateChoreRequest,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";

import { db } from "@/db";
import { chores } from "@/db/schema";
import { assertUsersEligible } from "@/features/households/access/household-access";
import { notFound } from "@/http/app-error";

type CreateChoreDto = z.infer<typeof CreateChoreRequest>;
type UpdateChoreDto = z.infer<typeof UpdateChoreRequest>;
type ListChoresQueryDto = z.infer<typeof ListChoresQuery>;

interface UserSummary {
  id: string;
  image: string | null;
  name: string;
}

type ChoreQueryResult = Omit<
  typeof chores.$inferSelect,
  "createdAt" | "updatedAt" | "dueAt" | "completedAt"
> & {
  createdAt: string | Date;
  updatedAt: string | Date;
  dueAt: string | Date | null;
  completedAt: string | Date | null;
  addedBy: UserSummary;
  assignedTo: UserSummary | null;
  completedBy: UserSummary | null;
};

const userSummaryFields = {
  id: true,
  name: true,
  image: true,
} as const;

@Injectable()
export class ChoresService {
  async create(
    householdId: string,
    authorId: string,
    dto: CreateChoreDto
  ): Promise<Chore> {
    if (dto.assignedToId) {
      await assertUsersEligible(
        db,
        householdId,
        [{ path: ["assignedToId"], userId: dto.assignedToId }],
        "current"
      );
    }

    const [inserted] = await db
      .insert(chores)
      .values({
        householdId,
        name: dto.name,
        description: dto.description ?? null,
        assignedToId: dto.assignedToId ?? null,
        dueAt: dto.dueAt ?? null,
        addedById: authorId,
      })
      .returning();

    return this.getById(householdId, inserted.id);
  }

  async list(
    householdId: string,
    query: ListChoresQueryDto
  ): Promise<ChoreListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const includeCompleted = query.includeCompleted ?? false;
    const offset = (page - 1) * pageSize;

    const whereConditions = [eq(chores.householdId, householdId)];
    if (!includeCompleted) {
      whereConditions.push(eq(chores.isCompleted, false));
    }

    const combinedWhere = and(...whereConditions);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chores)
      .where(combinedWhere);

    const totalItems = countResult?.count ?? 0;

    const items = await db.query.chores.findMany({
      where: combinedWhere,
      with: {
        addedBy: { columns: userSummaryFields },
        assignedTo: { columns: userSummaryFields },
        completedBy: { columns: userSummaryFields },
      },
      orderBy: (choresTable, { asc, sql: sqlOrder }) => [
        asc(choresTable.isCompleted),
        sqlOrder`${choresTable.dueAt} ASC NULLS LAST`,
        asc(choresTable.createdAt),
        asc(choresTable.id),
      ],
      limit: pageSize,
      offset,
    });

    return {
      items: items.map((item) =>
        this.mapToContract(item as unknown as ChoreQueryResult)
      ),
      page,
      pageSize,
      totalItems,
    };
  }

  async getById(householdId: string, choreId: string): Promise<Chore> {
    const chore = await db.query.chores.findFirst({
      where: and(eq(chores.id, choreId), eq(chores.householdId, householdId)),
      with: {
        addedBy: { columns: userSummaryFields },
        assignedTo: { columns: userSummaryFields },
        completedBy: { columns: userSummaryFields },
      },
    });

    if (!chore) {
      throw notFound();
    }

    return this.mapToContract(chore as unknown as ChoreQueryResult);
  }

  async update(
    householdId: string,
    choreId: string,
    dto: UpdateChoreDto
  ): Promise<Chore> {
    await this.getById(householdId, choreId);

    if (dto.assignedToId !== undefined && dto.assignedToId !== null) {
      await assertUsersEligible(
        db,
        householdId,
        [{ path: ["assignedToId"], userId: dto.assignedToId }],
        "current"
      );
    }

    const updateData: Partial<typeof chores.$inferInsert> = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }
    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }
    if (dto.assignedToId !== undefined) {
      updateData.assignedToId = dto.assignedToId;
    }
    if (dto.dueAt !== undefined) {
      updateData.dueAt = dto.dueAt;
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .update(chores)
        .set(updateData)
        .where(
          and(eq(chores.id, choreId), eq(chores.householdId, householdId))
        );
    }

    return this.getById(householdId, choreId);
  }

  async delete(householdId: string, choreId: string): Promise<void> {
    await this.getById(householdId, choreId);

    await db
      .delete(chores)
      .where(and(eq(chores.id, choreId), eq(chores.householdId, householdId)));
  }

  private mapToContract(chore: ChoreQueryResult): Chore {
    const base = {
      id: chore.id,
      householdId: chore.householdId,
      name: chore.name,
      description: chore.description,
      assignedTo: chore.assignedTo
        ? {
            id: chore.assignedTo.id,
            name: chore.assignedTo.name,
            imageUrl: chore.assignedTo.image ?? null,
          }
        : null,
      dueAt: chore.dueAt ? new Date(chore.dueAt).toISOString() : null,
      addedBy: {
        id: chore.addedBy.id,
        name: chore.addedBy.name,
        imageUrl: chore.addedBy.image ?? null,
      },
      createdAt: new Date(chore.createdAt).toISOString(),
      updatedAt: new Date(chore.updatedAt).toISOString(),
    };

    if (chore.isCompleted) {
      if (!(chore.completedAt && chore.completedBy)) {
        throw new Error("Completed chore missing completion metadata");
      }

      return {
        ...base,
        isCompleted: true as const,
        completedAt: new Date(chore.completedAt).toISOString(),
        completedBy: {
          id: chore.completedBy.id,
          name: chore.completedBy.name,
          imageUrl: chore.completedBy.image ?? null,
        },
      };
    }

    return {
      ...base,
      isCompleted: false as const,
      completedAt: null,
      completedBy: null,
    };
  }
}
