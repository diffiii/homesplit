"use client";

import { type ReactNode, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MockControls } from "@/mocks/browser";
import type { MockNetwork } from "@/mocks/routes";

const LATENCIES: MockNetwork["latency"][] = ["none", "realistic", "slow"];
const FAILURES: MockNetwork["failure"][] = ["none", "server-error", "offline"];

export function MocksPanel() {
  const [controls, setControls] = useState<MockControls | null>(null);
  // Bumped after a change, since the controls object itself stays the same.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      process.env.NODE_ENV === "development" &&
      process.env.NEXT_PUBLIC_API_MOCKS === "true"
    ) {
      import("@/mocks/browser")
        .then(({ startMocks }) => startMocks())
        .then(setControls);
    }
  }, []);

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8"
      id="main"
    >
      <PageHeader
        description="Data, user, and network conditions for the mock API. Changes are saved in this browser."
        title="API mocks"
      />
      {controls ? (
        <Controls
          controls={controls}
          onChange={() => setVersion((version) => version + 1)}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          The mocks are off. Start the app with{" "}
          <code>NEXT_PUBLIC_API_MOCKS=true</code> in <code>.env.local</code>.
        </p>
      )}
    </main>
  );
}

function Controls({
  controls,
  onChange,
}: {
  controls: MockControls;
  onChange: () => void;
}) {
  // A full load, so the proxy and every cached query see the new data.
  const openApp = () => window.location.assign("/");

  return (
    <>
      <Section title="Scenario">
        <p className="text-muted-foreground text-sm">
          Switching starts the scenario afresh and drops changes made since.
        </p>
        <ul className="flex flex-col gap-3">
          {controls.scenarios.map(({ name, label, description }) => (
            <li className="flex items-center justify-between gap-4" key={name}>
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-sm">
                  {label}
                  {name === controls.scenario ? (
                    <Badge className="ml-2" variant="secondary">
                      Current
                    </Badge>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-sm">
                  {description}
                </span>
              </div>
              <Button
                onClick={() => {
                  controls.switchScenario(name);
                  openApp();
                }}
                size="sm"
                variant="outline"
              >
                {name === controls.scenario ? "Reset" : "Switch"}
              </Button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Signed in as">
        <p className="text-muted-foreground text-sm">
          Every user's password is <code>homesplit</code>.
        </p>
        <ul className="flex flex-col gap-3">
          {controls.users.map((user) => (
            <li
              className="flex items-center justify-between gap-4"
              key={user.id}
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-sm">
                  {user.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </span>
                <span className="text-muted-foreground text-sm">
                  {user.households.length > 0
                    ? user.households
                        .map(({ name, role }) => `${role} in ${name}`)
                        .join(", ")
                    : "No households"}
                </span>
              </div>
              {user.id === controls.sessionUserId ? (
                <Badge variant="secondary">Signed in</Badge>
              ) : (
                <Button
                  onClick={() => {
                    controls.signInAs(user.id);
                    openApp();
                  }}
                  size="sm"
                  variant="outline"
                >
                  Sign in
                </Button>
              )}
            </li>
          ))}
        </ul>
        {controls.sessionUserId ? (
          <Button
            className="self-start"
            onClick={() => {
              controls.signInAs(null);
              onChange();
            }}
            size="sm"
            variant="ghost"
          >
            Sign out
          </Button>
        ) : null}
      </Section>

      <Section title="Network">
        <p className="text-muted-foreground text-sm">
          Applies to the application routes; Better Auth only gets the latency,
          so signing in keeps working.
        </p>
        <Choice
          label="Latency"
          onSelect={(latency) => {
            controls.setNetwork({ ...controls.network, latency });
            onChange();
          }}
          options={LATENCIES}
          value={controls.network.latency}
        />
        <Choice
          label="Failure"
          onSelect={(failure) => {
            controls.setNetwork({ ...controls.network, failure });
            onChange();
          }}
          options={FAILURES}
          value={controls.network.failure}
        />
      </Section>
    </>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  onSelect: (value: T) => void;
  options: T[];
  value: T;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="mb-2 font-medium text-sm">{label}</legend>
      {options.map((option) => (
        <Button
          aria-pressed={option === value}
          key={option}
          onClick={() => onSelect(option)}
          size="sm"
          variant={option === value ? "default" : "outline"}
        >
          {option}
        </Button>
      ))}
    </fieldset>
  );
}

function Section({ title, children }: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b pb-2 font-medium text-base">{title}</h2>
      {children}
    </section>
  );
}
