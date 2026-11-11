"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const UNDO_DELETE_MS = 5000;

/**
 * Hides rows at once and sends their request when the Undo toast closes.
 * Leaving the page sends whatever is still waiting.
 */
export function useDeferred() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const waiting = useRef(new Map<string, () => void>());

  const show = (ids: readonly string[]) =>
    setHidden((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        next.delete(id);
      }
      return next;
    });

  useEffect(() => {
    const pending = waiting.current;
    return () => {
      for (const send of pending.values()) {
        send();
      }
    };
  }, []);

  const defer = (
    key: string,
    ids: readonly string[],
    message: string,
    request: () => void
  ) => {
    setHidden((previous) => new Set([...previous, ...ids]));
    const send = () => {
      if (waiting.current.get(key) === send) {
        waiting.current.delete(key);
        toast.dismiss(toastId);
        request();
      }
    };
    waiting.current.set(key, send);
    const toastId = toast(message, {
      duration: UNDO_DELETE_MS,
      onAutoClose: send,
      onDismiss: send,
      action: {
        label: "Undo",
        onClick: () => {
          if (waiting.current.get(key) === send) {
            waiting.current.delete(key);
          }
          show(ids);
        },
      },
    });
  };

  const sendNow = (key: string) => waiting.current.get(key)?.();

  return { hidden, show, defer, sendNow };
}
