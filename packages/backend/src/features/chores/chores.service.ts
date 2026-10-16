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
import { chores, householdFeatures, member, type user } from "@/db/schema";
import { AppError, moduleDisabled, notFound } from "@/http/app-error";

type CreateChoreDto = z.infer<typeof CreateChoreRequest>;
type UpdateChoreDto = z.infer<typeof UpdateChoreRequest>;
type ListChoresQueryDto = z.infer<typeof ListChoresQuery>;

type UserWithSummaryFields = typeof user.$inferSelect;

type ChoreQueryResult = typeof chores.$inferSelect & {
  addedBy: UserWithSummaryFields;
  assignedTo: UserWithSummaryFields | null;
  completedBy: UserWithSummaryFields | null;
};

const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function isValidIsoDateTime(val: string): boolean {
  return ISO_DATETIME_REGEX.test(val);
}

@Injectable()
export class ChoresService {
  private async assertModuleEnabled(householdId: string): Promise<void> {
    const row = await db.query.householdFeatures.findFirst({
      where: eq(householdFeatures.organizationId, householdId),
    });

    if (row && !row.choresEnabled) {
      throw moduleDisabled("chores");
    }
  }

  private async assertEligibleMember(
    householdId: string,
    userId: string
  ): Promise<void> {
    const row = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, householdId),
        eq(member.userId, userId)
      ),
    });

    if (!row) {
      throw new AppError(
        400,
        "INVALID_REFERENCE",
        "Assigned user is not an eligible household member"
      );
    }
  }

  async create(
    householdId: string,
    authorId: string,
    dto: CreateChoreDto
  ): Promise<Chore> {
    await this.assertModuleEnabled(householdId);

    if (dto.dueAt && !isValidIsoDateTime(dto.dueAt)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "dueAt must be a full ISO 8601 datetime"
      );
    }

    if (dto.assignedToId) {
      await this.assertEligibleMember(householdId, dto.assignedToId);
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
        addedBy: true,
        assignedTo: true,
        completedBy: true,
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
      items: items.map((item) => this.mapToContract(item)),
      page,
      pageSize,
      totalItems,
    };
  }

  async getById(householdId: string, choreId: string): Promise<Chore> {
    const chore = await db.query.chores.findFirst({
      where: and(eq(chores.id, choreId), eq(chores.householdId, householdId)),
      with: {
        addedBy: true,
        assignedTo: true,
        completedBy: true,
      },
    });

    if (!chore) {
      throw notFound();
    }

    return this.mapToContract(chore);
  }

  async update(
    householdId: string,
    choreId: string,
    dto: UpdateChoreDto
  ): Promise<Chore> {
    await this.assertModuleEnabled(householdId);
    await this.getById(householdId, choreId);

    if (dto.dueAt && !isValidIsoDateTime(dto.dueAt)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "dueAt must be a full ISO 8601 datetime"
      );
    }

    if (dto.assignedToId !== undefined && dto.assignedToId !== null) {
      await this.assertEligibleMember(householdId, dto.assignedToId);
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
    await this.assertModuleEnabled(householdId);
    await this.getById(householdId, choreId);

    await db
      .delete(chores)
      .where(and(eq(chores.id, choreId), eq(chores.householdId, householdId)));
  }

  private mapToContract(chore: ChoreQueryResult): Chore {
    const createdAtIso =
      toIsoString(chore.createdAt) ?? new Date().toISOString();
    const updatedAtIso =
      toIsoString(chore.updatedAt) ?? new Date().toISOString();

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
      dueAt: toIsoString(chore.dueAt),
      addedBy: {
        id: chore.addedBy.id,
        name: chore.addedBy.name,
        imageUrl: chore.addedBy.image ?? null,
      },
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
    };

    if (chore.isCompleted) {
      return {
        ...base,
        isCompleted: true as const,
        completedAt: toIsoString(chore.completedAt) ?? new Date().toISOString(),
        completedBy: chore.completedBy
          ? {
              id: chore.completedBy.id,
              name: chore.completedBy.name,
              imageUrl: chore.completedBy.image ?? null,
            }
          : {
              id: chore.addedBy.id,
              name: chore.addedBy.name,
              imageUrl: chore.addedBy.image ?? null,
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
