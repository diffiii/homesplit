import type { Chore } from "@homesplit/contracts";
import { describe, expect, it } from "vitest";
import {
  changedFields,
  choreFiltersSearch,
  choreValues,
  isOverdue,
  parseChoreFilters,
  toChoreRequest,
  UNASSIGNED,
  validateChore,
} from "./chores";

const now = new Date(2026, 2, 10, 12, 0);
const at = (day: number, hours: number) =>
  new Date(2026, 2, day, hours, 0).toISOString();

const user = { id: "u1", name: "Alice", imageUrl: null };

function chore(name: string, overrides: Partial<Chore> = {}): Chore {
  return {
    id: name,
    householdId: "h1",
    name,
    description: null,
    assignedTo: null,
    dueAt: null,
    addedBy: user,
    createdAt: at(1, 9),
    updatedAt: at(1, 9),
    isCompleted: false,
    completedAt: null,
    completedBy: null,
    ...overrides,
  } as Chore;
}

describe("isOverdue", () => {
  it("is true for an open chore whose deadline has passed", () => {
    expect(isOverdue(chore("bins", { dueAt: at(10, 9) }), now)).toBe(true);
    expect(isOverdue(chore("vacuum", { dueAt: at(10, 18) }), now)).toBe(false);
    expect(isOverdue(chore("kettle"), now)).toBe(false);
    expect(
      isOverdue(
        chore("freezer", {
          dueAt: at(1, 9),
          isCompleted: true,
          completedAt: at(2, 9),
          completedBy: user,
        }),
        now
      )
    ).toBe(false);
  });
});

describe("chore form", () => {
  it("round-trips a chore through the form", () => {
    const dueAt = at(11, 9);
    const values = choreValues(
      chore("bins", { description: "Out front", assignedTo: user, dueAt })
    );
    expect(toChoreRequest(values)).toEqual({
      name: "bins",
      description: "Out front",
      assignedToId: "u1",
      dueAt,
    });
  });

  it("sends null for every cleared field", () => {
    expect(
      toChoreRequest({
        name: " Bins ",
        description: "  ",
        assignedToId: UNASSIGNED,
        dueDate: "",
        dueTime: "12:00",
      })
    ).toEqual({
      name: "Bins",
      description: null,
      assignedToId: null,
      dueAt: null,
    });
  });

  it("requires a name", () => {
    expect(validateChore({ ...choreValues(null), name: " " })).toEqual({
      fields: { name: "Enter a name." },
    });
    expect(validateChore({ ...choreValues(null), name: "Bins" })).toBe(
      undefined
    );
  });
});

describe("changedFields", () => {
  it("sends only what the form changed", () => {
    const original = chore("bins", { assignedTo: user, dueAt: at(11, 9) });
    expect(changedFields(original, choreValues(original))).toEqual({});
    expect(
      changedFields(original, {
        ...choreValues(original),
        description: "Out front",
      })
    ).toEqual({ description: "Out front" });
    expect(
      changedFields(original, { ...choreValues(original), dueDate: "" })
    ).toEqual({ dueAt: null });
  });
});

describe("chore filters", () => {
  it("reads and writes the URL's query", () => {
    expect(parseChoreFilters(new URLSearchParams(""))).toEqual({
      mine: false,
      completed: false,
    });
    const filters = { mine: true, completed: true };
    expect(choreFiltersSearch(filters)).toBe("view=mine&completed=true");
    expect(
      parseChoreFilters(new URLSearchParams(choreFiltersSearch(filters)))
    ).toEqual(filters);
  });
});
