import type {
  Chore,
  ChoreListResponse,
  CreateChoreRequest,
} from "@homesplit/contracts";
import type { InfiniteData } from "@tanstack/react-query";
import { isoToLocalDateTime, localDateTimeToIso } from "./dates";
import type { ServerErrors } from "./form";

/** The assignee select's value for nobody. */
export const UNASSIGNED = "unassigned";

export interface ChoreFormValues {
  assignedToId: string;
  description: string;
  /** An `IsoDate`, or empty for no deadline. */
  dueDate: string;
  /** `HH:MM`, used only with a date. */
  dueTime: string;
  name: string;
}

/** The time a newly picked deadline starts with. */
const DEFAULT_DUE_TIME = "12:00";

export function choreValues(chore: Chore | null): ChoreFormValues {
  const [dueDate = "", dueTime = DEFAULT_DUE_TIME] = chore?.dueAt
    ? isoToLocalDateTime(chore.dueAt).split("T")
    : [];
  return {
    name: chore?.name ?? "",
    description: chore?.description ?? "",
    assignedToId: chore?.assignedTo?.id ?? UNASSIGNED,
    dueDate,
    dueTime,
  };
}

export function validateChore(
  values: ChoreFormValues
): ServerErrors | undefined {
  const fields: Record<string, string> = {};
  if (!values.name.trim()) {
    fields.name = "Enter a name.";
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

export type ChoreBody = Required<CreateChoreRequest>;

export function toChoreRequest(values: ChoreFormValues): ChoreBody {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    assignedToId:
      values.assignedToId === UNASSIGNED ? null : values.assignedToId,
    dueAt: values.dueDate
      ? localDateTimeToIso(`${values.dueDate}T${values.dueTime}`)
      : null,
  };
}

/**
 * Only the fields the form changed, so an edit doesn't undo what someone else
 * changed meanwhile, or send back an assignee who has since left.
 */
export function changedFields(
  chore: Chore,
  values: ChoreFormValues
): Partial<ChoreBody> {
  const before = toChoreRequest(choreValues(chore));
  const after = toChoreRequest(values);
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) => before[key as keyof ChoreBody] !== value
    )
  );
}

export function isOverdue(
  chore: Pick<Chore, "dueAt" | "isCompleted">,
  now = new Date()
): boolean {
  return (
    !chore.isCompleted && chore.dueAt !== null && new Date(chore.dueAt) < now
  );
}

export type ChorePages = InfiniteData<ChoreListResponse>;

const listOrder = (chore: Chore) =>
  [
    Number(chore.isCompleted),
    chore.dueAt ?? "~",
    chore.createdAt,
    chore.id,
  ].join(" ");

/** Puts `chore` where the server's list order has it, replacing its old copy. */
export function placeChore(data: ChorePages, chore: Chore): ChorePages {
  const order = listOrder(chore);
  let placed = false;
  const pages = data.pages.map((page, index) => {
    const items = page.items.filter((item) => item.id !== chore.id);
    let at = placed ? -1 : items.findIndex((item) => listOrder(item) > order);
    if (at < 0 && !placed && index === data.pages.length - 1) {
      at = items.length;
    }
    if (at >= 0) {
      placed = true;
      items.splice(at, 0, chore);
    }
    return { ...page, items };
  });
  return { ...data, pages };
}

export interface ChoreFilters {
  completed: boolean;
  mine: boolean;
}

export function parseChoreFilters(search: URLSearchParams): ChoreFilters {
  return {
    mine: search.get("view") === "mine",
    completed: search.get("completed") === "true",
  };
}

export function choreFiltersSearch(filters: ChoreFilters): string {
  const search = new URLSearchParams();
  if (filters.mine) {
    search.set("view", "mine");
  }
  if (filters.completed) {
    search.set("completed", "true");
  }
  return search.toString();
}
