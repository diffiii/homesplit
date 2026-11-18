"use client";

import { useQuery } from "@tanstack/react-query";
import { InfoIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useHousehold } from "@/components/shell/household-context";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { endpointQuery } from "@/lib/api/queries";

/** How long the name must stay unchanged before a suggestion is requested. */
export const SUGGESTION_DELAY_MS = 800;
const MIN_NAME_LENGTH = 3;
const NO_SUGGESTION = "No suggestion for this name.";
/** The AI module went off or the daily limit ran out: asking again won't help. */
const STOP_STATUSES = new Set([403, 429]);

interface CategorySuggestionOptions {
  /** Puts a suggested category in the form. */
  apply: (categoryId: string) => void;
  /** The form's starting values: a category set there counts as picked. */
  initial: { categoryId: string | null; name: string };
  /** The name as typed. */
  name: string;
}

interface CategorySuggestion {
  /** What a screen reader hears when a suggestion fills the field. */
  announcement: string;
  /** Shown under the category field: the request in flight, or that the value was suggested. */
  hint: ReactNode;
  /** Call when the member chooses a category: suggestions stop for good. */
  onPick: () => void;
}

/**
 * Fills the expense's category from its name while the `ai` module is on.
 * It asks once the name has changed and then stayed the same for
 * `SUGGESTION_DELAY_MS`, at most once per distinct name, and fills only a
 * `high` confidence answer, only until the member picks a category. A later
 * answer replaces an earlier one; a name without one keeps the category and
 * the hint says there's no suggestion for this one. Failures are silent.
 */
export function useCategorySuggestion({
  name,
  initial,
  apply,
}: CategorySuggestionOptions): CategorySuggestion {
  const { household, features } = useHousehold();
  const householdId = household.id;
  const enabled = features.expenses && features.ai;
  const categories = useQuery(
    endpointQuery("listExpenseCategories", { params: { householdId } })
  );

  const [loading, setLoading] = useState(false);
  /** The category filled in and the name it was suggested for. */
  const [filled, setFilled] = useState<{
    categoryId: string;
    name: string;
  } | null>(null);
  const [initialName] = useState(() => initial.name.trim());
  /** The last name an answer arrived for, with or without a category. */
  const [answered, setAnswered] = useState<string | null>(null);
  const picked = useRef(initial.categoryId !== null);
  const stopped = useRef(false);
  /** The category to fill for each name asked about, or `null` for none. */
  const answers = useRef(new Map<string, Promise<string | null>>());

  const ask = (text: string): Promise<string | null> => {
    const known = answers.current.get(text);
    if (known) {
      return known;
    }
    const answer = api("suggestExpenseCategory", {
      params: { householdId },
      body: { name: text },
    }).then(
      ({ suggestion }) =>
        suggestion?.confidence === "high" ? suggestion.categoryId : null,
      (error: unknown) => {
        if (isApiRequestError(error) && STOP_STATUSES.has(error.status)) {
          stopped.current = true;
        }
        return null;
      }
    );
    answers.current.set(text, answer);
    return answer;
  };

  const fill = useEffectEvent((text: string, categoryId: string | null) => {
    setLoading(false);
    setAnswered(text);
    // A category the picker doesn't list yet would be saved without showing.
    if (
      categoryId === null ||
      picked.current ||
      !categories.data?.items.some(({ id }) => id === categoryId)
    ) {
      return;
    }
    apply(categoryId);
    setFilled({ categoryId, name: text });
  });

  const request = useEffectEvent(async (text: string) => {
    if (picked.current || stopped.current) {
      return null;
    }
    setLoading(true);
    return await ask(text);
  });

  useEffect(() => {
    const text = name.trim();
    if (!enabled || text.length < MIN_NAME_LENGTH || text === initialName) {
      return;
    }
    let current = true;
    const timer = setTimeout(async () => {
      const categoryId = await request(text);
      if (current) {
        fill(text, categoryId);
      }
    }, SUGGESTION_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
      setLoading(false);
    };
  }, [name, enabled, initialName]);

  const suggested = categories.data?.items.find(
    ({ id }) => id === filled?.categoryId
  );
  const shown = name.trim();
  let hint: ReactNode;
  let announcement = "";
  if (suggested && filled?.name === shown) {
    announcement = `${suggested.name} suggested as the category.`;
  } else if (suggested && answered === shown) {
    announcement = `${NO_SUGGESTION} ${suggested.name} is from an earlier name.`;
  }
  if (loading) {
    hint = (
      <span className="flex items-center gap-1.5">
        <Loader2Icon aria-hidden className="size-4 animate-spin" />
        Finding a category…
      </span>
    );
  } else if (suggested && filled?.name !== shown && answered === shown) {
    hint = (
      <span className="flex items-start gap-1.5">
        <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {NO_SUGGESTION} This one is from an earlier name.
      </span>
    );
  } else if (suggested) {
    hint = (
      <span className="flex items-center gap-1.5">
        <SparklesIcon aria-hidden className="size-4" />
        {filled?.name === shown
          ? "Suggested from the name"
          : "Suggested from an earlier name"}
      </span>
    );
  }

  return {
    hint,
    announcement,
    onPick: () => {
      picked.current = true;
      setLoading(false);
      setFilled(null);
    },
  };
}
