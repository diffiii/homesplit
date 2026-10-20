import { CreateExpenseCategoryRequest } from "@homesplit/contracts";
import { FieldApi, FormApi } from "@tanstack/react-form";
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api/api-error";
import { applyServerErrors, serverErrors, toFieldName } from "./form";

function validationError(
  issues: { path: (string | number)[]; message: string }[]
) {
  return ApiRequestError.fromBody("api", 400, {
    code: "VALIDATION_ERROR",
    message: "Invalid request",
    details: { issues },
  });
}

describe("toFieldName", () => {
  it("uses brackets for array indexes", () => {
    expect(toFieldName(["name"])).toBe("name");
    expect(toFieldName(["payers", 0, "amount"])).toBe("payers[0].amount");
    expect(toFieldName([])).toBe("");
  });
});

describe("serverErrors", () => {
  const names = new Set(["name", "payers[0].amount"]);

  it("puts each field's first issue on it", () => {
    expect(
      serverErrors(
        validationError([
          { path: ["name"], message: "Too long" },
          { path: ["name"], message: "Already taken" },
          { path: ["payers", 0, "amount"], message: "Must be positive" },
        ]),
        names
      )
    ).toEqual({
      fields: { name: "Too long", "payers[0].amount": "Must be positive" },
    });
  });

  it("sends issues without a field on screen to the form", () => {
    expect(
      serverErrors(
        validationError([
          { path: ["name"], message: "Too long" },
          { path: [], message: "Payers must add up to the total." },
        ]),
        names
      )
    ).toEqual({
      fields: { name: "Too long" },
      form: "Payers must add up to the total.",
    });
  });

  it("describes errors without issues", () => {
    expect(
      serverErrors(
        ApiRequestError.network("api", new TypeError("Failed to fetch")),
        names
      )
    ).toEqual({
      fields: {},
      form: "Couldn't reach HomeSplit. Check your connection and try again.",
    });
  });
});

describe("applyServerErrors", () => {
  it("shows server errors until the field changes", () => {
    const form = new FormApi({
      defaultValues: { name: "", icon: null } as CreateExpenseCategoryRequest,
      validators: { onSubmit: CreateExpenseCategoryRequest },
    });
    form.mount();
    const name = new FieldApi({ form, name: "name" });
    name.mount();

    applyServerErrors(
      form,
      validationError([
        { path: ["name"], message: "Already taken" },
        { path: ["icon"], message: "Not an emoji" },
      ])
    );
    expect(name.state.meta.errors).toEqual(["Already taken"]);
    expect(form.state.errors).toEqual(["Not an emoji"]);

    name.handleChange("Groceries");
    expect(name.state.meta.errors).toEqual([]);
  });
});
