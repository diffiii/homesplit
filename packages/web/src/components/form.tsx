"use client";

import {
  type AnyFieldApi,
  createFormHook,
  createFormHookContexts,
  useStore,
} from "@tanstack/react-form";
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { CategoryPicker } from "@/components/category-picker";
import { CurrencyPicker } from "@/components/currency-picker";
import { EmojiInput } from "@/components/emoji-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

type FieldErrorItem = { message?: string } | undefined;

/** Schema issues are objects and server errors are strings; `FieldError` wants objects. */
function toErrorItems(errors: readonly unknown[]): FieldErrorItem[] {
  return errors.map((error) =>
    typeof error === "string" ? { message: error } : (error as FieldErrorItem)
  );
}

/**
 * The field's errors once the user has left it or tried to submit, so a form
 * doesn't open covered in errors. Server errors arrive after a submit.
 */
function useVisibleErrors(field: AnyFieldApi): FieldErrorItem[] {
  const errors = useStore(field.store, (state) => state.meta.errors);
  const touched = useStore(field.store, (state) => state.meta.isTouched);
  const submitted = useStore(
    field.form.store,
    (state) => state.submissionAttempts > 0
  );
  return touched || submitted ? toErrorItems(errors) : [];
}

const subscribeToNothing = () => () => undefined;

/**
 * False while React hydrates the server's HTML, and true once it handles
 * events. Before then a submit is the browser's own.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

/**
 * Keeps what the user typed or a password manager filled in before React
 * hydrated. Hydration leaves the input's text alone but not the field's value,
 * so the next render would empty the input. Run once the input mounts.
 */
function useValueFromBeforeHydration(
  field: AnyFieldApi,
  input: RefObject<HTMLInputElement | null>
): void {
  useEffect(() => {
    const typed = input.current?.value;
    if (typed && typed !== field.state.value) {
      field.handleChange(typed);
    }
  }, [field, input]);
}

interface FieldShellProps {
  children: (control: {
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    id: string;
  }) => ReactNode;
  description?: ReactNode;
  label: ReactNode;
}

/** Label, control, description, and error, wired up for screen readers. */
function FieldShell({ label, description, children }: FieldShellProps) {
  const field = useFieldContext<unknown>();
  const errors = useVisibleErrors(field);
  const id = `${field.form.formId}-${field.name}`;
  const invalid = errors.length > 0;
  const describedBy =
    [description && `${id}-description`, invalid && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({
        id,
        "aria-invalid": invalid || undefined,
        "aria-describedby": describedBy,
      })}
      {description ? (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      ) : null}
      <FieldError errors={errors} id={`${id}-error`} />
    </Field>
  );
}

interface TextFieldProps
  extends Pick<
    ComponentProps<"input">,
    "autoComplete" | "disabled" | "inputMode" | "placeholder" | "type"
  > {
  description?: ReactNode;
  label: ReactNode;
}

function TextField({ label, description, ...input }: TextFieldProps) {
  const field = useFieldContext<string>();
  const value = useStore(field.store, (state) => state.value);
  const inputRef = useRef<HTMLInputElement>(null);
  useValueFromBeforeHydration(field, inputRef);
  return (
    <FieldShell description={description} label={label}>
      {(control) => (
        <Input
          {...input}
          {...control}
          name={field.name}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
          ref={inputRef}
          value={value}
        />
      )}
    </FieldShell>
  );
}

interface MoneyFieldProps {
  /** Shown next to the amount; validation uses the same currency's exponent. */
  currency: string;
  description?: ReactNode;
  label: ReactNode;
}

/**
 * An amount as typed, kept as a string so nothing is lost before the submit
 * handler converts it with `parseAmount`. Validate it with `amountError`.
 */
function MoneyField({ label, description, currency }: MoneyFieldProps) {
  const field = useFieldContext<string>();
  const value = useStore(field.store, (state) => state.value);
  const inputRef = useRef<HTMLInputElement>(null);
  useValueFromBeforeHydration(field, inputRef);
  return (
    <FieldShell description={description} label={label}>
      {(control) => (
        <InputGroup>
          <InputGroupInput
            {...control}
            autoComplete="off"
            className="tabular-nums"
            inputMode="decimal"
            name={field.name}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder="0.00"
            ref={inputRef}
            value={value}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{currency}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      )}
    </FieldShell>
  );
}

function CurrencyField({
  label,
  description,
}: {
  description?: ReactNode;
  label: ReactNode;
}) {
  const field = useFieldContext<string>();
  const value = useStore(field.store, (state) => state.value);
  return (
    <FieldShell description={description} label={label}>
      {(control) => (
        <CurrencyPicker
          aria-invalid={control["aria-invalid"]}
          id={control.id}
          onBlur={field.handleBlur}
          onValueChange={field.handleChange}
          value={value}
        />
      )}
    </FieldShell>
  );
}

/** A calendar date as an `IsoDate` string, which is what `<input type="date">` uses too. */
function DateField({
  label,
  description,
}: {
  description?: ReactNode;
  label: ReactNode;
}) {
  const field = useFieldContext<string>();
  const value = useStore(field.store, (state) => state.value);
  const inputRef = useRef<HTMLInputElement>(null);
  useValueFromBeforeHydration(field, inputRef);
  return (
    <FieldShell description={description} label={label}>
      {(control) => (
        <Input
          {...control}
          name={field.name}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
          ref={inputRef}
          type="date"
          value={value}
        />
      )}
    </FieldShell>
  );
}

/** A yes-or-no choice, with its label and description beside the box. */
function CheckboxField({
  label,
  description,
}: {
  description?: ReactNode;
  label: ReactNode;
}) {
  const field = useFieldContext<boolean>();
  const value = useStore(field.store, (state) => state.value);
  const id = `${field.form.formId}-${field.name}`;
  return (
    <Field orientation="horizontal">
      <Checkbox
        aria-describedby={description ? `${id}-description` : undefined}
        checked={value}
        id={id}
        name={field.name}
        onBlur={field.handleBlur}
        onCheckedChange={(checked) => field.handleChange(checked)}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? (
          <FieldDescription id={`${id}-description`}>
            {description}
          </FieldDescription>
        ) : null}
      </FieldContent>
    </Field>
  );
}

export interface ChecklistOption {
  /**
   * Shown at the end of the row, such as a person's share or a
   * `RowInputField`, whose error wraps onto a line of its own.
   */
  detail?: ReactNode;
  label: ReactNode;
  value: string;
}

/**
 * Pick any number of `options`, such as the people splitting an expense. The
 * value lists the picked ones in the order of `options`.
 */
function ChecklistField({
  label,
  description,
  footer,
  options,
}: {
  description?: ReactNode;
  /** Shown under the list, above its error, such as a running total. */
  footer?: ReactNode;
  label: ReactNode;
  options: readonly ChecklistOption[];
}) {
  const field = useFieldContext<string[]>();
  const value = useStore(field.store, (state) => state.value);
  const errors = useVisibleErrors(field);
  const id = `${field.form.formId}-${field.name}`;
  const invalid = errors.length > 0;
  const describedBy =
    [description && `${id}-description`, invalid && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  const toggle = (option: string, checked: boolean) => {
    const picked = new Set(value);
    if (checked) {
      picked.add(option);
    } else {
      picked.delete(option);
    }
    field.handleChange(
      options.map((o) => o.value).filter((v) => picked.has(v))
    );
  };

  return (
    <FieldSet
      aria-describedby={describedBy}
      className="gap-2"
      data-invalid={invalid || undefined}
    >
      <FieldLegend variant="label">{label}</FieldLegend>
      {description ? (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      ) : null}
      <ul className="flex flex-col divide-y rounded-xl border">
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <li key={option.value}>
              <Field className="flex-wrap px-4 py-2" orientation="horizontal">
                <Checkbox
                  checked={value.includes(option.value)}
                  id={optionId}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onCheckedChange={(checked) => toggle(option.value, checked)}
                  value={option.value}
                />
                <FieldLabel
                  // Starting from no width, so the detail stays beside it.
                  className="min-w-0 flex-1 basis-0! font-normal"
                  htmlFor={optionId}
                >
                  {option.label}
                </FieldLabel>
                {option.detail}
              </Field>
            </li>
          );
        })}
      </ul>
      {footer}
      <FieldError errors={errors} id={`${id}-error`} />
    </FieldSet>
  );
}

interface RowInputFieldProps {
  inputMode: "decimal" | "numeric";
  /**
   * Names the input, such as "Bartek's percentage", since the row's own
   * label names its checkbox.
   */
  label: string;
  /** Called instead of `field.handleChange`, such as to keep other rows' values too. */
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** Shown after the input, such as the currency or `%`. */
  suffix?: ReactNode;
  /** What the input shows; defaults to the field's value. */
  value?: string;
}

/**
 * A short input in a `ChecklistField` row, such as what a payer paid, passed
 * as the option's `detail`. Its error takes a line of its own under the row.
 */
function RowInputField({
  label,
  suffix,
  inputMode,
  placeholder,
  value,
  onValueChange,
}: RowInputFieldProps) {
  const field = useFieldContext<string | undefined>();
  const stored = useStore(field.store, (state) => state.value);
  const errors = useVisibleErrors(field);
  const id = `${field.form.formId}-${field.name}`;
  const invalid = errors.length > 0;
  return (
    <>
      <InputGroup className="w-32 shrink-0">
        <InputGroupInput
          aria-describedby={invalid ? `${id}-error` : undefined}
          aria-invalid={invalid || undefined}
          aria-label={label}
          autoComplete="off"
          className="tabular-nums"
          id={id}
          inputMode={inputMode}
          name={field.name}
          onBlur={field.handleBlur}
          onChange={(event) =>
            (onValueChange ?? field.handleChange)(event.target.value)
          }
          placeholder={placeholder}
          value={value ?? stored ?? ""}
        />
        {suffix ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{suffix}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <FieldError
        className="basis-full pl-6"
        errors={errors}
        id={`${id}-error`}
      />
    </>
  );
}

export interface SelectFieldItem {
  label: string;
  value: string;
}

/** One of a few fixed `items`, such as how an expense is split. */
function SelectField({
  label,
  description,
  items,
}: {
  description?: ReactNode;
  items: readonly SelectFieldItem[];
  label: ReactNode;
}) {
  const field = useFieldContext<string>();
  const value = useStore(field.store, (state) => state.value);
  return (
    <FieldShell description={description} label={label}>
      {(control) => (
        <Select
          items={items}
          onOpenChange={(open) => {
            if (!open) {
              field.handleBlur();
            }
          }}
          onValueChange={(next: string | null) => {
            if (next !== null) {
              field.handleChange(next);
            }
          }}
          value={value}
        >
          <SelectTrigger {...control} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FieldShell>
  );
}

/** An optional emoji, such as a category's icon; clearing it stores `null`. */
function EmojiField({
  label,
  description,
}: {
  description?: ReactNode;
  label: ReactNode;
}) {
  const field = useFieldContext<string | null | undefined>();
  const value = useStore(field.store, (state) => state.value);
  return (
    <FieldShell description={description} label={label}>
      {(control) => (
        <EmojiInput
          {...control}
          onValueChange={(emoji) => {
            field.handleChange(emoji);
            field.handleBlur();
          }}
          value={value ?? null}
        />
      )}
    </FieldShell>
  );
}

/** One of the household's categories, or `null` for none. */
function CategoryField({
  label,
  description,
}: {
  description?: ReactNode;
  label: ReactNode;
}) {
  const field = useFieldContext<string | null | undefined>();
  const value = useStore(field.store, (state) => state.value);
  return (
    <FieldShell description={description} label={label}>
      {(control) => (
        <CategoryPicker
          {...control}
          onBlur={field.handleBlur}
          onValueChange={field.handleChange}
          value={value ?? null}
        />
      )}
    </FieldShell>
  );
}

/**
 * The `<form>` element: submits through TanStack Form and leaves validation to
 * it. Should the browser submit it before React hydrates, it posts, so what
 * was typed, such as a password, stays out of the URL.
 */
function FormRoot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const form = useFormContext();
  return (
    <form
      className={className}
      method="post"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** Form-level errors: server errors no field can show, and schema issues without a path. */
function FormError() {
  const form = useFormContext();
  const errors = useStore(form.store, (state) => state.errors);
  const messages = toErrorItems(errors)
    .map((error) => error?.message)
    .filter(Boolean);
  if (messages.length === 0) {
    return null;
  }
  return (
    <Alert variant="destructive">
      <AlertDescription>{messages.join(" ")}</AlertDescription>
    </Alert>
  );
}

/** Disabled until React hydrates, so an early click or Enter doesn't submit natively. */
function SubmitButton({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "type">) {
  const form = useFormContext();
  const submitting = useStore(form.store, (state) => state.isSubmitting);
  const hydrated = useHydrated();
  return (
    <Button
      {...props}
      disabled={!hydrated || submitting || props.disabled}
      type="submit"
    >
      {submitting ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}

/**
 * The app's form hook. Validate with the contract schema, as in
 * `validators: { onSubmit: CreateExpenseCategoryRequest }`, and on a failed
 * request call `applyServerErrors(form, error)` to show what the server said.
 */
export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    MoneyField,
    CurrencyField,
    DateField,
    CheckboxField,
    ChecklistField,
    RowInputField,
    SelectField,
    EmojiField,
    CategoryField,
  },
  formComponents: { Form: FormRoot, FormError, SubmitButton },
});
