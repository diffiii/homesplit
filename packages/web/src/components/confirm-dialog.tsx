"use client";

import type { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { type ReactElement, type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/error-message";

interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel: string;
  /** Explains a failure the generic messages don't cover, such as a 409. */
  describeError?: (error: unknown) => string;
  description?: ReactNode;
  /** Styles the confirm button for actions that delete or can't be undone. */
  destructive?: boolean;
  /** Where focus goes on close, when the element that opened the dialog may be gone. */
  finalFocus?: AlertDialogPrimitive.Popup.Props["finalFocus"];
  /**
   * Runs the action. The dialog stays open, with its buttons disabled, until
   * the promise settles; it closes on success and shows the error otherwise.
   */
  onConfirm: () => unknown;
  /** Called when the dialog opens or closes, for a dialog opened from elsewhere, such as a menu. */
  onOpenChange?: (open: boolean) => void;
  /** Controls the dialog when given; leave it out to let `trigger` open it. */
  open?: boolean;
  title: ReactNode;
  /** The button that opens the dialog, unless `open` controls it. */
  trigger?: ReactElement;
}

/** Asks before an action the user may not mean, such as deleting or leaving. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  describeError = errorMessage,
  onConfirm,
  finalFocus,
  open: controlledOpen,
  onOpenChange,
}: ConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
          setError(null);
        }
      }}
      open={open}
    >
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {error === null ? null : (
          <p className="text-destructive text-sm" role="alert">
            {describeError(error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={confirm}
            variant={destructive ? "destructive" : "default"}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
