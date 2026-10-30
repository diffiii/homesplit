"use client";

import { CurrencyCode, IsoDate } from "@homesplit/contracts";
import { InboxIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useAppForm } from "@/components/form";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/responsive-dialog";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";
import { UserAvatar, UserLabel } from "@/components/user-avatar";
import { ApiRequestError } from "@/lib/api/api-error";
import {
  formatIsoDate,
  formatIsoDateTime,
  localDateTimeToIso,
  todayIsoDate,
} from "@/lib/dates";
import { applyServerErrors } from "@/lib/form";
import {
  amountError,
  DEFAULT_CURRENCY,
  formatMoney,
  parseAmount,
} from "@/lib/money";

const ANNA = { name: "Anna Nowak", imageUrl: null };
// A picture without a network request: a gradient standing in for a photo.
const JAN = {
  name: "Jan Kowalski",
  imageUrl: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><linearGradient id="g"><stop stop-color="#0d9488"/><stop offset="1" stop-color="#f59e0b"/></linearGradient><rect width="1" height="1" fill="url(#g)"/></svg>'
  )}`,
};

export function Kit() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8">
      <PageHeader
        actions={<ThemeMenu />}
        description="Shared components and helpers from #81. Development only."
        title="UI kit"
      />
      <Section title="Money">
        <MoneyExamples />
        <MoneyForm />
      </Section>
      <Section title="Dates">
        <DateExamples />
      </Section>
      <Section title="Avatars">
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar size="lg" user={JAN} />
          <UserAvatar size="lg" user={ANNA} />
          <UserAvatar departed size="lg" user={ANNA} />
          <UserAvatar size="sm" user={{ name: "Łukasz Żak", imageUrl: null }} />
        </div>
        <div className="flex flex-col gap-2">
          <UserLabel user={JAN} />
          <UserLabel departed user={ANNA} />
        </div>
      </Section>
      <Section title="States">
        <ListSkeleton label="Loading example" rows={2} />
        <EmptyState
          action={<Button>Add the first one</Button>}
          description="Shown before a list has anything in it."
          icon={InboxIcon}
          title="Nothing here yet"
        />
        <RetryExample />
      </Section>
      <Section title="Dialogs">
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            confirmLabel="Delete"
            description="Waits a second, then fails every other time, to show the pending and error states."
            destructive
            onConfirm={flakyAction()}
            title="Delete this?"
            trigger={
              <Button variant="destructive">
                <Trash2Icon aria-hidden data-icon="inline-start" />
                Confirm dialog
              </Button>
            }
          />
          <SheetExample />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b pb-2 text-base font-medium">{title}</h2>
      {children}
    </section>
  );
}

function MoneyExamples() {
  const rows = [
    { amountCents: 123_450, currency: "PLN" },
    { amountCents: 1999, currency: "JPY" },
    { amountCents: 1999, currency: "KWD" },
    { amountCents: 150_000, currency: "HUF" },
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm tabular-nums">
      {rows.map((money) => (
        <div className="contents" key={money.currency}>
          <dt className="text-muted-foreground">
            amountCents {money.amountCents}
          </dt>
          <dd>{formatMoney(money)}</dd>
        </div>
      ))}
      <dt className="text-muted-foreground">Owed to you</dt>
      <dd className="text-positive">
        {formatMoney(
          { amountCents: 4200, currency: "EUR" },
          { signDisplay: "exceptZero" }
        )}
      </dd>
      <dt className="text-muted-foreground">You owe</dt>
      <dd className="text-destructive">
        {formatMoney(
          { amountCents: -4200, currency: "EUR" },
          { signDisplay: "exceptZero" }
        )}
      </dd>
    </dl>
  );
}

const MoneyFormValues = z
  .object({ amount: z.string(), currency: CurrencyCode, date: IsoDate })
  .superRefine(({ amount, currency }, context) => {
    const message = amountError(amount, currency);
    if (message) {
      context.addIssue({ code: "custom", path: ["amount"], message });
    }
  });

/** Amount, currency, and date as the expense form will take them. Typing 13 shows a server error. */
function MoneyForm() {
  const form = useAppForm({
    defaultValues: {
      amount: "",
      currency: DEFAULT_CURRENCY,
      date: todayIsoDate(),
    },
    validators: { onSubmit: MoneyFormValues },
    onSubmit: async ({ value, formApi }) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const parsed = parseAmount(value.amount, value.currency);
      if (!parsed.ok) {
        return;
      }
      if (parsed.cents === 1300) {
        applyServerErrors(
          formApi,
          ApiRequestError.fromBody("api", 400, {
            code: "VALIDATION_ERROR",
            message: "Invalid request",
            details: {
              issues: [
                {
                  path: ["amount"],
                  message: "The server rejects 13 for luck.",
                },
                {
                  path: ["payers"],
                  message: "Issues without a field land here.",
                },
              ],
            },
          })
        );
        return;
      }
      const money = { amountCents: parsed.cents, currency: value.currency };
      toast.success(`${formatMoney(money)} on ${formatIsoDate(value.date)}`, {
        description: JSON.stringify(money),
      });
    },
  });

  return (
    <form.AppForm>
      <form.Form className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <form.Subscribe selector={(state) => state.values.currency}>
          {(currency) => (
            <form.AppField name="amount">
              {(field) => (
                <field.MoneyField
                  currency={currency}
                  description="Either decimal separator works."
                  label="Amount"
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
        <form.AppField name="currency">
          {(field) => <field.CurrencyField label="Currency" />}
        </form.AppField>
        <form.AppField name="date">
          {(field) => <field.DateField label="Date" />}
        </form.AppField>
        <div className="flex flex-col justify-end gap-2 sm:col-span-2">
          <form.FormError />
          <form.SubmitButton className="self-start">
            Check amount
          </form.SubmitButton>
        </div>
      </form.Form>
    </form.AppForm>
  );
}

function DateExamples() {
  const [local, setLocal] = useState("2026-03-01T18:30");
  let utc = "";
  try {
    utc = localDateTimeToIso(local);
  } catch {
    utc = "—";
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        <code>IsoDate</code> 2026-03-01 is{" "}
        <strong>{formatIsoDate("2026-03-01")}</strong> in every time zone.
      </p>
      <label className="flex flex-wrap items-center gap-2">
        Local date-time
        <input
          className="rounded-md border bg-transparent px-2 py-1"
          onChange={(event) => setLocal(event.target.value)}
          type="datetime-local"
          value={local}
        />
      </label>
      <p className="tabular-nums">
        UTC <code>{utc}</code>
        {utc !== "—" && <> · shown back as {formatIsoDateTime(utc)}</>}
      </p>
    </div>
  );
}

function RetryExample() {
  const [retrying, setRetrying] = useState(false);
  return (
    <ErrorState
      error={ApiRequestError.network("api", new TypeError("Failed to fetch"))}
      onRetry={() => {
        setRetrying(true);
        setTimeout(() => setRetrying(false), 1000);
      }}
      retrying={retrying}
    />
  );
}

function flakyAction() {
  let calls = 0;
  return async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (calls % 2 === 1) {
      throw ApiRequestError.fromBody("api", 403, {
        code: "FORBIDDEN",
        message: "Forbidden",
      });
    }
    toast.success("Deleted");
  };
}

function SheetExample() {
  return (
    <ResponsiveDialog>
      <ResponsiveDialogTrigger
        render={<Button variant="outline">Responsive dialog</Button>}
      />
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Dialog or bottom sheet</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            A centered dialog from 768px up, a bottom sheet below. Resize the
            window to compare.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody>
          <p className="text-sm">
            Forms go here; the body scrolls in the sheet.
          </p>
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose render={<Button variant="outline" />}>
            Close
          </ResponsiveDialogClose>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
