import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { useAppForm } from "./form";

function NameForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: ({ value }) => onSubmit(value.name),
  });
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="name">
          {(field) => <field.TextField label="Name" />}
        </form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

/** The form as the server sends it, before React hydrates it. */
function renderServerHtml(ui: ReactElement): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToString(ui);
  document.body.append(container);
  onTestFinished(() => container.remove());
  return container;
}

describe("useAppForm", () => {
  it("can't be submitted by the browser before React hydrates", () => {
    const container = renderServerHtml(<NameForm onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    // Should it submit anyway, what was typed goes in the body, not the URL.
    expect(container.querySelector("form")).toHaveAttribute("method", "post");
  });

  it("keeps what was typed before React hydrates", async () => {
    const onSubmit = vi.fn();
    const ui = <NameForm onSubmit={onSubmit} />;
    const container = renderServerHtml(ui);
    // Typed, or filled in by a password manager, with no React to see it.
    (screen.getByLabelText("Name") as HTMLInputElement).value = "Alice";

    render(ui, { container, hydrate: true });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith("Alice");
    expect(screen.getByLabelText("Name")).toHaveValue("Alice");
  });
});
