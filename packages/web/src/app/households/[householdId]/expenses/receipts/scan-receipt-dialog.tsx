"use client";

import type { Attachment, Receipt } from "@homesplit/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScanLineIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUpload } from "@/components/file-upload";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/responsive-dialog";
import { useHouseholdId } from "@/components/shell/household-context";
import { receiptPath } from "@/components/shell/household-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { invalidate } from "@/lib/api/queries";
import { receiptListKey, receiptQuery } from "@/lib/api/receipt-queries";

/**
 * Uploads photos or PDFs of receipts and starts reading each one. One receipt
 * opens at once, while it's still being read; several stay in the list.
 */
export function ScanReceiptDialog({
  disabled = false,
  variant = "default",
}: {
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <ResponsiveDialog onOpenChange={setOpen} open={open}>
      <ResponsiveDialogTrigger
        render={<Button disabled={disabled} type="button" variant={variant} />}
      >
        <ScanLineIcon aria-hidden data-icon="inline-start" />
        Scan receipt
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent>
        {open ? <ScanReceiptForm onDone={() => setOpen(false)} /> : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ScanReceiptForm({ onDone }: { onDone: () => void }) {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  /** Receipts already started, by attachment, so trying again after a failure skips them. */
  const started = useRef(new Map<string, Receipt>());
  const scan = useMutation({
    mutationFn: async (files: Attachment[]) => {
      const results = await Promise.allSettled(
        files
          .filter(({ id }) => !started.current.has(id))
          .map(async ({ id }) => {
            const receipt = await api("createReceipt", {
              params: { householdId },
              body: { attachmentId: id },
            });
            started.current.set(id, receipt);
          })
      );
      const failed = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      );
      if (failed) {
        throw failed.reason;
      }
      return files.flatMap(({ id }) => started.current.get(id) ?? []);
    },
    onSettled: () => invalidate(queryClient, [receiptListKey(householdId)]),
    onSuccess: (receipts) => {
      for (const receipt of receipts) {
        queryClient.setQueryData(
          receiptQuery(householdId, receipt.id).queryKey,
          receipt
        );
      }
      const [first] = receipts;
      if (receipts.length === 1 && first) {
        router.push(receiptPath(householdId, first.id));
      } else {
        toast.success(`Reading ${receipts.length} receipts.`);
      }
      onDone();
    },
  });

  const count = attachments.length;
  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>Scan a receipt</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Take a photo of the receipt, or choose a photo or a PDF. HomeSplit
          reads it into a draft for you to check.
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody className="flex flex-col gap-4">
        <FileUpload
          disabled={scan.isPending}
          householdId={householdId}
          onAttachmentsChange={setAttachments}
          onPendingChange={setUploading}
        />
        {scan.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(scan.error)}</AlertDescription>
          </Alert>
        ) : null}
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <ResponsiveDialogClose render={<Button variant="outline" />}>
          Cancel
        </ResponsiveDialogClose>
        <Button
          disabled={count === 0 || uploading || scan.isPending}
          onClick={() => scan.mutate(attachments)}
          type="button"
        >
          {scan.isPending ? <Spinner data-icon="inline-start" /> : null}
          {count > 1 ? `Read ${count} receipts` : "Read receipt"}
        </Button>
      </ResponsiveDialogFooter>
    </>
  );
}
