"use client";

import { SplitMethod, type UserSummary } from "@homesplit/contracts";
import { cn } from "cn";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  type ChecklistOption,
  type SelectFieldItem,
  withForm,
} from "@/components/form";
import { Button } from "@/components/ui/button";
import { UserLabel } from "@/components/user-avatar";
import {
  type ExpenseFormValues,
  fitsSimpleMode,
  payerAmountField,
  payerAmountInputs,
  payersCheck,
  previewShares,
  type RunningCheck,
  splitCheck,
  splitField,
  splitInputs,
  type WeightedMethod,
} from "@/lib/expense-form";
import { SPLIT_METHOD_LABELS } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";

interface SplitProps {
  kept: readonly UserSummary[];
  /** Current members, the user first. */
  members: readonly UserSummary[];
  nameOf: (userId: string) => string;
  /** Everyone shown so far, so someone who left keeps a name. */
  seen: ReadonlyMap<string, UserSummary>;
  userId: string;
}

const splitProps = {} as SplitProps;

/** What each method does, under the picker. */
const METHOD_DESCRIPTIONS: Record<SplitMethod, string> = {
  equal: "Everyone checked pays the same.",
  percentage: "Each person pays a percentage of the amount.",
  shares:
    "Each person pays in proportion to their shares, like 2 for a couple.",
  exact: "Enter what each person owes.",
  adjustment: "Split equally, then add or take away an amount for some people.",
};

const METHODS: SelectFieldItem[] = SplitMethod.options.map((method) => ({
  value: method,
  label: SPLIT_METHOD_LABELS[method],
}));

/** How each method's input is named, after whose it is. */
const INPUT_NAMES: Record<WeightedMethod, string> = {
  percentage: "percentage",
  shares: "shares",
  exact: "amount",
  adjustment: "adjustment",
};

/**
 * Current members, then anyone who has left and is kept or in `ids`, each
 * flagged. Someone who left while a new expense was open has a row only
 * while checked, so it's there to uncheck.
 */
function rows(
  ids: readonly string[],
  { kept, members, seen }: Pick<SplitProps, "kept" | "members" | "seen">
): { departed: boolean; user: UserSummary }[] {
  const current = new Set(members.map(({ id }) => id));
  const departed = [...new Set([...kept.map(({ id }) => id), ...ids])]
    .filter((id) => !current.has(id))
    .map((id) => seen.get(id) ?? { id, name: "Someone", imageUrl: null });
  return [
    ...members.map((user) => ({ user, departed: false })),
    ...departed.map((user) => ({ user, departed: true })),
  ];
}

function PersonLabel({
  user,
  departed,
  userId,
  children,
}: {
  children?: ReactNode;
  departed: boolean;
  user: UserSummary;
  userId: string;
}) {
  return (
    <UserLabel
      departed={departed}
      detail={children}
      size="sm"
      user={user}
      you={user.id === userId}
    />
  );
}

/** Each participant's share of what's typed so far, by user ID. */
function sharesOf(values: ExpenseFormValues): Map<string, string> {
  return new Map(
    previewShares(values)?.map(({ userId, amountCents }) => [
      userId,
      formatMoney({ amountCents, currency: values.currency }),
    ])
  );
}

function Share({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-sm tabular-nums">{children}</span>;
}

/** Whether the inputs add up yet, announced as it changes. */
function CheckLine({ check }: { check: RunningCheck | null }) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "text-sm",
        check?.ok ? "text-muted-foreground" : "font-medium"
      )}
    >
      {check?.text}
    </p>
  );
}

/** You paid, split equally: a checklist with each person's share. */
export const SimpleSplit = withForm({
  defaultValues: {} as ExpenseFormValues,
  props: splitProps,
  render({ form, kept, members, seen, userId }) {
    return (
      <>
        <form.Subscribe selector={(state) => state.values}>
          {(values) => {
            const shares = sharesOf(values);
            return (
              <form.AppField name="participantIds">
                {(field) => (
                  <field.ChecklistField
                    description="You paid. It's split equally between everyone checked."
                    label="Split between"
                    options={rows(values.participantIds, {
                      kept,
                      members,
                      seen,
                    }).map(
                      ({ user, departed }): ChecklistOption => ({
                        value: user.id,
                        label: (
                          <PersonLabel
                            departed={departed}
                            user={user}
                            userId={userId}
                          />
                        ),
                        detail: shares.has(user.id) ? (
                          <Share>{shares.get(user.id)}</Share>
                        ) : null,
                      })
                    )}
                  />
                )}
              </form.AppField>
            );
          }}
        </form.Subscribe>
        <form.AppField name="advanced">
          {(field) => (
            <Button
              className="self-start"
              id={`${form.formId}-advanced`}
              onClick={() => {
                form.setFieldValue("payerIds", [userId]);
                form.setFieldValue("payerAmounts", null);
                form.setFieldValue("method", "equal");
                flushSync(() => field.handleChange(true));
                const id = `${form.formId}-payerIds-${userId}`;
                // biome-ignore lint/style/useDomQuerySelector: the id starts with `useId` output, which a selector would need escaped
                document.getElementById(id)?.focus();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Split another way
            </Button>
          )}
        </form.AppField>
      </>
    );
  },
});

/** Several payers and every split method, each with its inputs and running check. */
export const AdvancedSplit = withForm({
  defaultValues: {} as ExpenseFormValues,
  props: splitProps,
  render({ form, kept, members, seen, nameOf, userId }) {
    return (
      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const { currency, method } = values;
          const paid = payerAmountInputs(values);
          const shares = sharesOf(values);
          const inputs = method === "equal" ? {} : splitInputs(values, method);
          const whose = (id: string) =>
            id === userId ? "Your" : `${nameOf(id)}'s`;
          return (
            <>
              <form.AppField name="payerIds">
                {(field) => (
                  <field.ChecklistField
                    footer={<CheckLine check={payersCheck(values)} />}
                    label="Paid by"
                    options={rows(values.payerIds, { kept, members, seen }).map(
                      ({ user, departed }): ChecklistOption => ({
                        value: user.id,
                        label: (
                          <PersonLabel
                            departed={departed}
                            user={user}
                            userId={userId}
                          />
                        ),
                        detail: values.payerIds.includes(user.id) ? (
                          <form.AppField name={payerAmountField(user.id)}>
                            {(amount) => (
                              <amount.RowInputField
                                inputMode="decimal"
                                label={
                                  user.id === userId
                                    ? "Amount you paid"
                                    : `Amount ${nameOf(user.id)} paid`
                                }
                                onValueChange={(text) => {
                                  // The first edit keeps the even split the others show.
                                  if (!values.payerAmounts) {
                                    form.setFieldValue("payerAmounts", paid);
                                  }
                                  amount.handleChange(text);
                                }}
                                suffix={currency}
                                value={paid[user.id] ?? ""}
                              />
                            )}
                          </form.AppField>
                        ) : null,
                      })
                    )}
                  />
                )}
              </form.AppField>
              <form.AppField name="method">
                {(field) => (
                  <field.SelectField
                    description={METHOD_DESCRIPTIONS[method]}
                    items={METHODS}
                    label="Split"
                  />
                )}
              </form.AppField>
              <form.AppField name="participantIds">
                {(field) => (
                  <field.ChecklistField
                    footer={<CheckLine check={splitCheck(values, nameOf)} />}
                    label="Split between"
                    options={rows(values.participantIds, {
                      kept,
                      members,
                      seen,
                    }).map(({ user, departed }): ChecklistOption => {
                      const share = shares.get(user.id);
                      if (method === "equal") {
                        return {
                          value: user.id,
                          label: (
                            <PersonLabel
                              departed={departed}
                              user={user}
                              userId={userId}
                            />
                          ),
                          detail: share ? <Share>{share}</Share> : null,
                        };
                      }
                      return {
                        value: user.id,
                        label: (
                          <PersonLabel
                            departed={departed}
                            user={user}
                            userId={userId}
                          >
                            {share ? (
                              <span className="text-muted-foreground text-xs tabular-nums">
                                {share}
                              </span>
                            ) : null}
                          </PersonLabel>
                        ),
                        detail: values.participantIds.includes(user.id) ? (
                          <form.AppField name={splitField(method, user.id)}>
                            {(input) => (
                              <input.RowInputField
                                inputMode={
                                  method === "shares" ? "numeric" : "decimal"
                                }
                                label={`${whose(user.id)} ${INPUT_NAMES[method]}`}
                                onValueChange={(text) => {
                                  // The first edit keeps the even split the others show.
                                  if (!values.splits[method]) {
                                    form.setFieldValue(
                                      `splits.${method}`,
                                      inputs
                                    );
                                  }
                                  input.handleChange(text);
                                }}
                                placeholder={
                                  method === "adjustment" ? "0" : undefined
                                }
                                suffix={
                                  method === "percentage"
                                    ? "%"
                                    : method !== "shares" && currency
                                }
                                value={inputs[user.id] ?? ""}
                              />
                            )}
                          </form.AppField>
                        ) : null,
                      };
                    })}
                  />
                )}
              </form.AppField>
              {fitsSimpleMode(values, userId) ? (
                <form.AppField name="advanced">
                  {(field) => (
                    <Button
                      className="self-start"
                      onClick={() => {
                        form.setFieldValue("payerAmounts", null);
                        flushSync(() => field.handleChange(false));
                        const id = `${form.formId}-advanced`;
                        // biome-ignore lint/style/useDomQuerySelector: the id starts with `useId` output, which a selector would need escaped
                        document.getElementById(id)?.focus();
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Back to simple
                    </Button>
                  )}
                </form.AppField>
              ) : null}
            </>
          );
        }}
      </form.Subscribe>
    );
  },
});
