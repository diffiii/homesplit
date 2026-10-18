import { PowerOffIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Above a module's screen while it's off: everything stays visible, nothing can change. */
export function ModuleDisabledAlert({ module }: { module: string }) {
  return (
    <Alert>
      <PowerOffIcon aria-hidden />
      <AlertTitle>{module} are turned off</AlertTitle>
      <AlertDescription>
        You can still look through them. An admin can turn them back on in
        settings.
      </AlertDescription>
    </Alert>
  );
}
