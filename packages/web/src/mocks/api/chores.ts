import type { Chore, CompletedChore, OpenChore } from "@homesplit/contracts";
import { type MockChore, type MockDb, now } from "../db";
import type { MockRoutes } from "../routes";
import {
  asc,
  assertCurrentMembers,
  definedFields,
  findInHousehold,
  paginate,
  removeRow,
  sortBy,
} from "./shared";

export function renderChore(db: MockDb, chore: MockChore): Chore {
  const base = {
    id: chore.id,
    householdId: chore.householdId,
    name: chore.name,
    description: chore.description,
    assignedTo: chore.assignedToId ? db.summary(chore.assignedToId) : null,
    dueAt: chore.dueAt,
    addedBy: db.summary(chore.addedById),
    createdAt: chore.createdAt,
    updatedAt: chore.updatedAt,
  };
  if (chore.completedAt && chore.completedById) {
    return {
      ...base,
      isCompleted: true,
      completedAt: chore.completedAt,
      completedBy: db.summary(chore.completedById),
    };
  }
  return { ...base, isCompleted: false, completedAt: null, completedBy: null };
}

/** A newly assigned user must be a current member; one sent back unchanged isn't re-checked. */
function assertAssignee(
  db: MockDb,
  householdId: string,
  assignedToId: string | null | undefined,
  current: string | null = null
) {
  if (assignedToId && assignedToId !== current) {
    assertCurrentMembers(db, householdId, [
      { userId: assignedToId, path: ["assignedToId"] },
    ]);
  }
}

export const choreRoutes: MockRoutes = {
  listChores: {
    resolve: ({ db, household, query }) =>
      paginate(
        sortBy(
          db.state.chores.filter(
            (chore) =>
              chore.householdId === household.id &&
              (query.includeCompleted || !chore.completedAt) &&
              (query.assignedToId === undefined ||
                chore.assignedToId === query.assignedToId)
          ),
          asc((chore) => chore.completedAt !== null),
          // Chores without a deadline go last.
          asc((chore) => chore.dueAt ?? "~"),
          asc((chore) => chore.createdAt),
          asc((chore) => chore.id)
        ),
        query,
        (chore) => renderChore(db, chore)
      ),
  },

  createChore: {
    module: "chores",
    resolve: ({ db, household, userId, body }) => {
      assertAssignee(db, household.id, body.assignedToId);
      const time = now();
      const chore: MockChore = {
        id: crypto.randomUUID(),
        householdId: household.id,
        name: body.name,
        description: body.description ?? null,
        assignedToId: body.assignedToId ?? null,
        dueAt: body.dueAt ?? null,
        addedById: userId,
        createdAt: time,
        updatedAt: time,
        completedAt: null,
        completedById: null,
      };
      db.state.chores.push(chore);
      return renderChore(db, chore);
    },
  },

  getChore: {
    resolve: ({ db, household, params }) =>
      renderChore(
        db,
        findInHousehold(db.state.chores, household.id, params.choreId)
      ),
  },

  updateChore: {
    module: "chores",
    resolve: ({ db, household, params, body }) => {
      const chore = findInHousehold(
        db.state.chores,
        household.id,
        params.choreId
      );
      assertAssignee(db, household.id, body.assignedToId, chore.assignedToId);
      Object.assign(chore, definedFields(body), { updatedAt: now() });
      return renderChore(db, chore);
    },
  },

  deleteChore: {
    module: "chores",
    resolve: ({ db, household, params }) => {
      removeRow(
        db.state.chores,
        findInHousehold(db.state.chores, household.id, params.choreId)
      );
    },
  },

  // Both actions are idempotent: a repeat keeps the original actor and time.
  completeChore: {
    module: "chores",
    resolve: ({ db, household, userId, params }) => {
      const chore = findInHousehold(
        db.state.chores,
        household.id,
        params.choreId
      );
      if (!chore.completedAt) {
        chore.completedAt = now();
        chore.completedById = userId;
        chore.updatedAt = chore.completedAt;
      }
      return renderChore(db, chore) as CompletedChore;
    },
  },

  reopenChore: {
    module: "chores",
    resolve: ({ db, household, params }) => {
      const chore = findInHousehold(
        db.state.chores,
        household.id,
        params.choreId
      );
      if (chore.completedAt) {
        chore.completedAt = null;
        chore.completedById = null;
        chore.updatedAt = now();
      }
      return renderChore(db, chore) as OpenChore;
    },
  },
};
