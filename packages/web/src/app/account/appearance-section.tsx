"use client";

import { THEME_OPTIONS } from "@/components/theme-menu";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

/** The theme, remembered on this device rather than with the account. */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <section
      aria-labelledby="appearance-heading"
      className="flex flex-col gap-3"
    >
      <h2 className="font-medium text-base" id="appearance-heading">
        Appearance
      </h2>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Theme</legend>
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <Button
            aria-pressed={theme === value}
            key={value}
            onClick={() => setTheme(value)}
            variant={theme === value ? "secondary" : "outline"}
          >
            <Icon aria-hidden data-icon="inline-start" />
            {label}
          </Button>
        ))}
      </fieldset>
      <p className="text-muted-foreground text-sm">
        System follows your device's light or dark setting. The choice is saved
        on this device only.
      </p>
    </section>
  );
}
