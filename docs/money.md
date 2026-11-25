# Money: currencies, limits, and rounding

These rules apply to every task that stores, accepts, or calculates amounts, including expenses (#37, #38), settlements (#40 to #42), and receipts (#56). The constants live in [money primitives](../packages/contracts/src/common/money.ts), the shared money math in [`distribute.ts`](../packages/contracts/src/common/distribute.ts) and [`safe-integer.ts`](../packages/contracts/src/common/safe-integer.ts), and the allocation engine in [`allocation`](../packages/contracts/src/features/expenses/allocation).

## Minor units

Every amount is an integer number of the currency's ISO 4217 minor unit, in a field named `amountCents` or ending in `Cents`. The name is historical: `amountCents: 1999` is 19.99 in PLN or EUR, ¥1999 in JPY, and 1.999 in KWD.

The backend adds, compares, and splits integers, and never converts between currencies. Clients format amounts with the ISO 4217 exponent for the currency. The one place the backend needs the exponent is reading a receipt (#55): the model replies with decimal amounts, which the server converts with the exponent from `Intl.NumberFormat` (2 while the currency is unknown), rounding half away from zero.

## Supported currencies

`CurrencyCode` accepts every ISO 4217 code that `z.currencyCode()` knows, except the codes in `UNSUPPORTED_CURRENCY_CODES`:

- **No minor unit:** `XAU`, `XAG`, `XPD`, and `XPT` (precious metals), `XBA`, `XBB`, `XBC`, `XBD`, `XDR`, `XSU`, and `XUA` (units of account), `XTS` (testing), and `XXX` (no currency). ISO 4217 defines no minor unit for them, so `amountCents` would have no meaning.
- **Fund codes:** `BOV`, `CHE`, `CHW`, `CLF`, `COU`, `MXV`, `USN`, `UYI`, `UYW`, and `XAD`. They're indexed or settlement units that nobody pays a housemate in.

The list is a blocklist, so a currency added to ISO 4217 is accepted as soon as Zod's list includes it. A new code without a minor unit, or a new fund code, has to be added to the list by hand.

Each expense and settlement has one currency, and its payers, allocation amounts, and splits inherit it. Balances and suggestions are grouped by currency, and currencies are never converted or netted.

## Limits

| Constant | Value | Applies to |
| --- | --- | --- |
| `MAX_AMOUNT_CENTS` | 10^12 | Expense totals, payer amounts, exact allocation amounts, and payments recorded with `POST /settlements` (at most `MAX_AMOUNT_CENTS`); adjustments (between minus and plus the expense total) |
| `MAX_SHARES` | 1,000,000 | Shares held by one participant in a `shares` split |
| `FULL_PERCENTAGE_BASIS_POINTS` | 10,000 | Percentage splits, which add up to exactly this |

Request schemas use the bounded primitives `BoundedCents`, `BoundedPositiveCents`, and `BoundedPositiveMoney`. Response amounts such as balances and suggestions use the unbounded `Cents` and `PositiveCents`, because they're sums over many entries and can exceed a single request's limit. They're still safe integers. A [write-off](api/expenses.md#write-offs)'s `amountCents` is a balance too, so it's an unbounded `Cents`, and the payments a write-off records can exceed `MAX_AMOUNT_CENTS`.

## Database and API integers

- **API:** amounts are JSON numbers. Every integer in a request or response is a safe JavaScript integer (`z.int()`, at most 2^53 − 1 in absolute value).
- **Database:** amounts are `bigint` columns, and basis points and shares are `integer` columns.
- **Reading:** node-postgres returns `bigint` and `numeric` values, including every `SUM(...)`, as strings. Each one goes through `toSafeInteger` from `@homesplit/contracts`, which throws when the value isn't a safe integer instead of losing precision. Don't use `Number(...)` or Drizzle's `mode: "number"` on these columns.
- **Arithmetic:** backend calculations that multiply amounts, such as splitting a total by weights, use `bigint` internally and convert back to `number` at the end.

## Rounding

Splitting an amount into parts uses the largest remainder method, implemented by `distributeProportionally`:

1. Each part gets `floor(total × weight / sum of weights)`.
2. The units left over, fewer than the number of parts, go one at a time to the parts with the largest remainder of that division.
3. Ties go to the lower key. The allocation engine uses the user ID as the key; `Id` lowercases UUIDs when parsing, so each user has one key.

The tie-breaker depends only on the keys, so reordering the inputs never changes anyone's amount. The function takes a weight per key and returns an amount per key; the amounts always add up exactly to the total. Every method of the allocation engine follows this rule:

- **`equal`:** every participant has a weight of 1.
- **`percentage`:** the weights are basis points, adding up to 10,000.
- **`shares`:** the weights are shares.
- **`exact`:** the amounts are used as given and must add up to the total.
- **`adjustment`:** the total minus the sum of adjustments is split equally, and then each adjustment is added. Nobody's share may be negative before rounding: `(total − sum of adjustments) / participants + adjustment ≥ 0` for every participant. Checking before rounding means the leftover units never decide whether an input is valid, so validity doesn't depend on user IDs. No adjustment may be below minus the total, and the adjustments may add up to at most the total, so the equally split part is never negative. Together they keep every adjustment within plus or minus the total, and every split can still be entered: each person's share minus the largest share is a valid set of adjustments. Expenses saved before these two rules keep their adjustments until someone edits them; the edit form then asks for adjustments that follow them.

Amounts that are fractions before rounding, such as receipt items split by shares (#56), express each person's amount as a weight over a common denominator and round once with `distributeProportionally`.

Because ties always go to the lower user ID, the same person receives the leftover units in every expense with the same participants. The amounts involved are below one minor unit per participant per expense. If that becomes a problem, the key can be replaced with one seeded by the expense ID.
