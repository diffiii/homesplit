"use client";

import {
  type AnyFieldApi,
  createFormHook,
  createFormHookContexts,
  useStore,
} from "@tanstack/react-form";
import type { ComponentProps, ReactNode } from "react";
import { CurrencyPicker } from "@/components/currency-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
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
    "autoComplete" | "inputMode" | "placeholder" | "type"
  > {
  description?: ReactNode;
  label: ReactNode;
}

function TextField({ label, description, ...input }: TextFieldProps) {
  const field = useFieldContext<string>();
  const value = useStore(field.store, (state) => state.value);
  return (
    <FieldShell description={description} label={label}>
      {(control) => (
        <Input
          {...input}
          {...control}
          name={field.name}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
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
  return (
    <FieldShell description={description} label={label}>
      {(control) => (
        <Input
          {...control}
          name={field.name}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
          type="date"
          value={value}
        />
      )}
    </FieldShell>
  );
}

/** The `<form>` element: submits through TanStack Form and leaves validation to it. */
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

function SubmitButton({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "type">) {
  const form = useFormContext();
  const submitting = useStore(form.store, (state) => state.isSubmitting);
  return (
    <Button {...props} disabled={submitting || props.disabled} type="submit">
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
  fieldComponents: { TextField, MoneyField, CurrencyField, DateField },
  formComponents: { Form: FormRoot, FormError, SubmitButton },
});
