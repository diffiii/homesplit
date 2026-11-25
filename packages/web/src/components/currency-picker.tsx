"use client";

import { useMemo, useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  currencyName,
  orderCurrencies,
  supportedCurrencies,
} from "@/lib/money";
import {
  readRecentCurrencies,
  rememberCurrency,
} from "@/lib/recent-currencies";

const currencyLabel = (code: string) => `${code} · ${currencyName(code)}`;

interface CurrencyPickerProps {
  "aria-invalid"?: boolean;
  id?: string;
  onBlur?: () => void;
  onValueChange: (code: string) => void;
  /** A currency code, or `""` for none picked yet. */
  value: string;
}

/**
 * Searchable by code or name. Lists the currencies picked recently on this
 * device first, then PLN, then the rest; picking one makes it recent.
 */
export function CurrencyPicker({
  value,
  onValueChange,
  onBlur,
  id,
  "aria-invalid": invalid,
}: CurrencyPickerProps) {
  // Read on the client only; the list isn't rendered until the popup opens.
  const [recent] = useState(() =>
    typeof window === "undefined" ? [] : readRecentCurrencies()
  );
  const codes = useMemo(
    () => orderCurrencies(supportedCurrencies(), recent),
    [recent]
  );

  return (
    <Combobox
      autoHighlight
      items={codes}
      itemToStringLabel={currencyLabel}
      onValueChange={(code: string | null) => {
        if (code) {
          rememberCurrency(code);
          onValueChange(code);
        }
      }}
      // An empty value, such as a receipt's unread currency, picks none.
      value={value || null}
    >
      <ComboboxInput
        aria-invalid={invalid}
        id={id}
        onBlur={onBlur}
        placeholder="Search currencies"
      />
      <ComboboxContent>
        <ComboboxEmpty>No currency matches.</ComboboxEmpty>
        <ComboboxList>
          {(code: string) => (
            <ComboboxItem key={code} value={code}>
              <span className="w-10 shrink-0 font-medium tabular-nums">
                {code}
              </span>
              <span className="text-muted-foreground truncate">
                {currencyName(code)}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
