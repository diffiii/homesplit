"use client";

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete";
import { UNIT_SUGGESTIONS } from "@/lib/shopping";

interface UnitPickerProps {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  id?: string;
  onBlur?: () => void;
  onValueChange: (unit: string) => void;
  value: string;
}

export function UnitPicker({
  value,
  onValueChange,
  onBlur,
  ...input
}: UnitPickerProps) {
  return (
    <Autocomplete
      items={UNIT_SUGGESTIONS}
      onValueChange={(next) => onValueChange(next)}
      value={value}
    >
      <AutocompleteInput {...input} onBlur={onBlur} placeholder="pcs, kg, …" />
      <AutocompleteContent>
        <AutocompleteList>
          {(unit: string) => (
            <AutocompleteItem key={unit} value={unit}>
              {unit}
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  );
}
