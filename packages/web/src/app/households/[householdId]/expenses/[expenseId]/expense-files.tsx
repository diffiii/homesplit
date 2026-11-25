"use client";

import {
  type AttachmentSummary,
  buildPath,
  type Expense,
  endpoints,
  isImageType,
} from "@homesplit/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilePreview } from "@/components/file-preview";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from "@/components/responsive-dialog";
import {
  useFeatureEnabled,
  useHouseholdId,
  usePermissions,
} from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { describeFile, FileViewer, type ListedFile } from "./file-viewer";

/**
 * The files attached to an expense, each with its thumbnail or type icon.
 * Opening one asks for a fresh download link: images open in a viewer, and
 * other files in a new tab, where the browser shows or saves them. The
 * author or an admin+ can detach files while expenses are turned on.
 */
export function ExpenseFiles({ expense }: { expense: Expense }) {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled("expenses");
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  // Stays shown after the last file is detached, so focus has somewhere to go.
  const [detached, setDetached] = useState(false);
  const [viewing, setViewing] = useState<ListedFile | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<unknown>(null);

  if (expense.attachments.length === 0 && !detached) {
    return null;
  }
  const canDetach = enabled && permissions.editExpenseAttachments(expense);
  const expenseParams = { householdId, expenseId: expense.id };

  const view = (file: ListedFile) => {
    setViewing(file);
    setViewerOpen(true);
  };

  const open = async (file: ListedFile) => {
    setOpenError(null);
    if (isImageType(file.attachment.mimeType)) {
      view(file);
      return;
    }
    // Opened during the click, since browsers may block a tab opened after
    // the request. Where they block it anyway, the viewer offers a download.
    const tab = window.open("", "_blank");
    if (!tab) {
      view(file);
      return;
    }
    setOpening(file.attachment.id);
    try {
      const { url } = await api("getAttachmentDownload", {
        params: { householdId, attachmentId: file.attachment.id },
      });
      tab.opener = null;
      tab.location.href = url;
    } catch (error) {
      tab.close();
      setOpenError(error);
    } finally {
      setOpening(null);
    }
  };

  const detach = async ({ id }: AttachmentSummary) => {
    try {
      await api("unlinkExpenseAttachment", {
        params: { ...expenseParams, attachmentId: id },
      });
    } catch (error) {
      // Someone detached it first, which is what the user wanted anyway.
      if (!(isApiRequestError(error) && error.status === 404)) {
        throw error;
      }
    }
    setDetached(true);
    const expenseKey = queryKeys.endpoint("getExpense", {
      params: expenseParams,
    });
    queryClient.setQueryData<Expense>(
      expenseKey,
      (current) =>
        current && {
          ...current,
          attachments: current.attachments.filter(
            (attachment) => attachment.id !== id
          ),
        }
    );
    await invalidate(queryClient, [
      expenseKey,
      queryKeys.endpoint("listExpenses", { params: { householdId } }),
    ]);
  };

  return (
    <section aria-labelledby="files-heading" className="flex flex-col gap-3">
      <h2
        className="text-base font-medium outline-none"
        id="files-heading"
        ref={heading}
        tabIndex={-1}
      >
        Files
      </h2>
      {expense.attachments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No files attached.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {expense.attachments.map((attachment, index) => {
            const file = { attachment, label: `File ${index + 1}` };
            const thumbnail = attachment.hasThumbnail
              ? buildPath(endpoints.getAttachmentThumbnail, {
                  householdId,
                  attachmentId: attachment.id,
                })
              : null;
            return (
              <li
                className="flex items-center gap-3 py-2 pr-2 pl-4"
                key={attachment.id}
              >
                <FilePreview
                  size={40}
                  src={thumbnail}
                  type={attachment.mimeType}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="text-sm font-medium">{file.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {describeFile(attachment)}
                  </p>
                </div>
                <Button
                  aria-label={`Open ${file.label}`}
                  disabled={opening === attachment.id}
                  onClick={() => open(file)}
                  size="sm"
                  variant="ghost"
                >
                  {opening === attachment.id ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <ExternalLinkIcon aria-hidden data-icon="inline-start" />
                  )}
                  Open
                </Button>
                {canDetach ? (
                  <ConfirmDialog
                    confirmLabel="Remove"
                    description="It will be taken off this expense and deleted. This can't be undone."
                    destructive
                    finalFocus={heading}
                    onConfirm={() => detach(attachment)}
                    title={`Remove ${file.label.toLowerCase()}?`}
                    trigger={
                      <Button
                        aria-label={`Remove ${file.label}`}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    }
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {openError === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          Couldn't open the file. {errorMessage(openError)}
        </p>
      )}
      <ResponsiveDialog onOpenChange={setViewerOpen} open={viewerOpen}>
        <ResponsiveDialogContent className="sm:max-w-2xl">
          {viewing ? (
            <FileViewer file={viewing} key={viewing.attachment.id} />
          ) : null}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </section>
  );
}
