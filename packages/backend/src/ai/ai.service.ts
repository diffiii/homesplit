import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { aiUsage, householdFeatures } from "@/db/schema";
import { AppError, moduleDisabled } from "@/http/app-error";
import { aiConfig } from "./ai.config";
import { AiClient, type AiRequest } from "./ai-client";

@Injectable()
export class AiService {
  private readonly client: AiClient | null;

  constructor(@Inject(AiClient) client: AiClient | null) {
    this.client = client;
  }

  /** Call it after the route's own validation, so a bad request never uses the quota. */
  async generate<T extends z.ZodType>(
    householdId: string,
    request: AiRequest<T>
  ): Promise<z.output<T>> {
    await assertAiEnabled(householdId);
    if (!this.client) {
      throw new AppError(503, "AI_UNAVAILABLE", "AI is not configured");
    }
    await consumeRequest(householdId, aiConfig.dailyRequestLimit);
    return this.client.generate(request);
  }
}

/** Checked here rather than in the guard, so `GET` routes can't send data while `ai` is off. */
async function assertAiEnabled(householdId: string): Promise<void> {
  const [row] = await db
    .select({ aiEnabled: householdFeatures.aiEnabled })
    .from(householdFeatures)
    .where(eq(householdFeatures.organizationId, householdId))
    .limit(1);
  if (!row) {
    throw new Error(
      `Missing household_features row for organization ${householdId}`
    );
  }
  if (!row.aiEnabled) {
    throw moduleDisabled("ai");
  }
}

/** A single upsert, so concurrent requests can't overshoot the limit. */
async function consumeRequest(
  householdId: string,
  limit: number
): Promise<void> {
  const now = new Date();
  const rows = await db
    .insert(aiUsage)
    .values({
      organizationId: householdId,
      day: now.toISOString().slice(0, 10),
      requests: 1,
    })
    .onConflictDoUpdate({
      target: [aiUsage.organizationId, aiUsage.day],
      set: { requests: sql`${aiUsage.requests} + 1` },
      setWhere: sql`${aiUsage.requests} < ${limit}`,
    })
    .returning({ requests: aiUsage.requests });
  if (rows.length === 0) {
    const resetsAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );
    throw new AppError(
      429,
      "AI_LIMIT_EXCEEDED",
      "Daily AI request limit reached",
      { limit, resetsAt: resetsAt.toISOString() }
    );
  }
}
