import { cn } from "cn";
import { CheckIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { formatMoney } from "@/lib/money";

/*
 * Pieces of the app with example data, for the landing page. Each is one
 * image to screen readers, labelled with what it shows, since the copy next
 * to it already says what the feature does.
 */

const ALICE = { name: "Alice Nowak", imageUrl: null };
const BARTEK = { name: "Bartek Kowalski", imageUrl: null };
const CELINA = { name: "Celina Wiśniewska", imageUrl: null };

const pln = (amountCents: number) =>
  formatMoney({ amountCents, currency: "PLN" });

interface Payment {
  amountCents: number;
  payee: typeof ALICE;
  payer: typeof ALICE;
}

const SUGGESTED_PAYMENTS: readonly Payment[] = [
  { payer: BARTEK, payee: ALICE, amountCents: 8640 },
  { payer: CELINA, payee: ALICE, amountCents: 4210 },
];

const firstName = (user: typeof ALICE) => user.name.split(" ")[0];

/**
 * The hero: who pays whom to even out a household, each payment drawn as the
 * logo's line between two dots, growing from the payer towards the payee.
 */
export function SettleUpPreview() {
  const label = SUGGESTED_PAYMENTS.map(
    (payment) =>
      `${firstName(payment.payer)} pays ${firstName(payment.payee)} ${pln(payment.amountCents)}`
  ).join(", ");
  return (
    <figure className="flex flex-col gap-6">
      <div
        aria-label={`Suggested payments: ${label}.`}
        className="flex flex-col gap-8 sm:gap-10"
        role="img"
      >
        {SUGGESTED_PAYMENTS.map((payment, index) => (
          <div
            className="grid grid-cols-[4.5rem_1fr_4.5rem] items-end gap-2 sm:grid-cols-[5.5rem_1fr_5.5rem]"
            key={payment.payer.name}
            style={
              { "--even-delay": `${200 + index * 450}ms` } as CSSProperties
            }
          >
            <Person user={payment.payer} />
            <div className="flex flex-col gap-2 pb-[1.375rem] sm:pb-6">
              <span className="text-center text-2xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                {pln(payment.amountCents)}
              </span>
              <EvenLine />
            </div>
            <Person user={payment.payee} />
          </div>
        ))}
      </div>
      <figcaption className="text-muted-foreground text-sm">
        Two payments, and everyone in Flat on Piękna is even.
      </figcaption>
    </figure>
  );
}

function Person({ user }: { user: typeof ALICE }) {
  return (
    <span className="flex flex-col items-center gap-2 text-sm">
      <UserAvatar
        className="size-12 sm:size-14 [&_[data-slot=avatar-fallback]]:text-base"
        decorative
        user={user}
      />
      {firstName(user)}
    </span>
  );
}

/** A dot at each end and the line between, drawn once when the page loads. */
function EvenLine() {
  return (
    <span className="relative flex h-3 items-center">
      <span className="bg-primary absolute left-0 size-3 rounded-full" />
      <span className="bg-primary mx-1.5 h-0.5 flex-1 origin-left motion-safe:animate-[even-line_700ms_cubic-bezier(0.3,0.7,0.2,1)_var(--even-delay)_both]" />
      <span className="bg-primary absolute right-0 size-3 rounded-full motion-safe:animate-[even-dot_250ms_ease-out_calc(var(--even-delay)+650ms)_both]" />
    </span>
  );
}

/** A bordered piece of the app, as lists and forms show up in it. */
function Surface({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn("bg-card rounded-xl border text-sm", className)}
      role="img"
    >
      {children}
    </div>
  );
}

function Check({ checked }: { checked: boolean }) {
  return checked ? (
    <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full">
      <CheckIcon className="size-3.5" strokeWidth={3} />
    </span>
  ) : (
    <span className="border-foreground/40 size-5 shrink-0 rounded-full border-2" />
  );
}

const SHOPPING = [
  { name: "Milk", detail: "2 l", bought: true },
  { name: "Washing-up liquid", detail: null, bought: true },
  { name: "Bread", detail: null, bought: false },
] as const;

export function ShoppingPreview() {
  return (
    <Surface label="A shopping list: milk and washing-up liquid bought by Celina, bread still to buy.">
      <ul className="divide-y">
        {SHOPPING.map((item) => (
          <li className="flex items-center gap-3 px-4 py-3" key={item.name}>
            <Check checked={item.bought} />
            <span
              className={cn(
                "flex-1",
                item.bought && "text-muted-foreground line-through"
              )}
            >
              {item.name}
            </span>
            {item.detail ? (
              <span className="text-muted-foreground tabular-nums">
                {item.detail}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground border-t px-4 py-3">
        Celina bought 2 items
      </p>
    </Surface>
  );
}

export function ExpensePreview() {
  return (
    <Surface label="An expense: Celina paid PLN 64.80 at Lidl, split equally, PLN 21.60 each for Alice, Bartek, and Celina.">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <span className="font-medium">Lidl</span>
        <span className="font-medium tabular-nums">{pln(6480)}</span>
      </div>
      <p className="text-muted-foreground px-4 pb-3">
        Paid by Celina, split equally
      </p>
      <ul className="divide-y border-t">
        {[ALICE, BARTEK, CELINA].map((user) => (
          <li className="flex items-center gap-3 px-4 py-2.5" key={user.name}>
            <UserAvatar decorative size="sm" user={user} />
            <span className="flex-1">{firstName(user)}</span>
            <span className="tabular-nums">{pln(2160)}</span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

export function PaymentsPreview() {
  return (
    <Surface label="Payments to Celina: Bartek's PLN 21.60 is confirmed, Alice's PLN 21.60 is waiting for Celina to confirm.">
      <ul className="divide-y">
        <li className="flex flex-col gap-2 px-4 py-3">
          <span className="flex items-center gap-3">
            <UserAvatar decorative size="sm" user={BARTEK} />
            <span className="flex-1">Bartek paid Celina</span>
            <span className="tabular-nums">{pln(2160)}</span>
          </span>
          <Badge className="ml-9" variant="secondary">
            <CheckIcon />
            Confirmed
          </Badge>
        </li>
        <li className="flex flex-col gap-2 px-4 py-3">
          <span className="flex items-center gap-3">
            <UserAvatar decorative size="sm" user={ALICE} />
            <span className="flex-1">Alice paid Celina</span>
            <span className="tabular-nums">{pln(2160)}</span>
          </span>
          <Badge className="ml-9" variant="outline">
            Waiting for Celina to confirm
          </Badge>
        </li>
      </ul>
    </Surface>
  );
}

const CHORES = [
  {
    name: "Clean the bathroom",
    who: ALICE,
    when: "Overdue since Tuesday",
    tone: "overdue",
  },
  {
    name: "Take out the recycling",
    who: BARTEK,
    when: "Due today",
    tone: "due",
  },
  {
    name: "Descale the kettle",
    who: null,
    when: "Due Sunday, anyone can take it",
    tone: "due",
  },
  {
    name: "Water the plants",
    who: CELINA,
    when: "Done by Celina",
    tone: "done",
  },
] as const;

export function ChoresPreview() {
  return (
    <Surface
      className="w-full"
      label="Chores: Alice's bathroom cleaning is overdue, Bartek's recycling is due today, descaling the kettle is due Sunday and unassigned, and Celina has watered the plants."
    >
      <ul className="divide-y">
        {CHORES.map((chore) => (
          <li className="flex items-center gap-3 px-4 py-3" key={chore.name}>
            <Check checked={chore.tone === "done"} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  chore.tone === "done" && "text-muted-foreground line-through"
                )}
              >
                {chore.name}
              </span>
              <span
                className={cn(
                  "text-muted-foreground",
                  chore.tone === "overdue" && "text-destructive"
                )}
              >
                {chore.when}
              </span>
            </span>
            {chore.who ? (
              <UserAvatar decorative size="sm" user={chore.who} />
            ) : null}
          </li>
        ))}
      </ul>
    </Surface>
  );
}
