import type { AnyFormApi } from "@tanstack/react-form";
import { issuesOf } from "./api/api-error";
import { errorMessage } from "./api/error-message";

/** TanStack Form's name for an issue path: `["payers", 0, "amount"]` is `payers[0].amount`. */
export function toFieldName(path: readonly (string | number)[]): string {
  return path.reduce<string>((name, segment) => {
    if (typeof segment === "number") {
      return `${name}[${segment}]`;
    }
    return name ? `${name}.${segment}` : segment;
  }, "");
}

export interface ServerErrors {
  fields: Record<string, string>;
  /** Shown above the submit button: issues no field on screen can show, or the error itself. */
  form?: string;
}

/**
 * Split a failed submit into messages for the fields on screen and one for
 * the form. Each field shows its first issue. Issues for fields that aren't
 * rendered go to the form, so nothing the server said is lost.
 */
export function serverErrors(
  error: unknown,
  fieldNames: ReadonlySet<string>
): ServerErrors {
  const fields: Record<string, string> = {};
  const unplaced: string[] = [];
  for (const { path, message } of issuesOf(error)) {
    const name = toFieldName(path);
    if (fieldNames.has(name)) {
      fields[name] ??= message;
    } else {
      unplaced.push(message);
    }
  }
  if (unplaced.length > 0) {
    return { fields, form: unplaced.join(" ") };
  }
  if (Object.keys(fields).length > 0) {
    return { fields };
  }
  return { fields, form: errorMessage(error) };
}

/**
 * Show a failed submit on the form. The messages sit in the `onServer` slot,
 * so each one clears as soon as the user edits its field or submits again.
 * TanStack Form clears that slot only while running the form's validators,
 * so the form needs some, which the contract schema provides.
 */
export function applyServerErrors(
  form: Pick<AnyFormApi, "fieldInfo" | "setErrorMap">,
  error: unknown
): void {
  showServerErrors(
    form,
    serverErrors(error, new Set(Object.keys(form.fieldInfo)))
  );
}

/** Show messages of the screen's own, such as a taken email, the same way. */
export function showServerErrors(
  form: Pick<AnyFormApi, "setErrorMap">,
  { fields, form: formError }: ServerErrors
): void {
  form.setErrorMap({ onServer: { form: formError, fields } });
}
