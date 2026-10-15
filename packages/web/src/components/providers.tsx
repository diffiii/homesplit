"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getQueryClient } from "@/lib/api/query-client";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={getQueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="top-center" richColors theme={theme} />;
}
