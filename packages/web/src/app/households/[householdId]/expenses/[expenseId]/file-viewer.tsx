"use client";

import type { AttachmentSummary } from "@homesplit/contracts";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/error-state";
import {
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { useHouseholdId } from "@/components/shell/household-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { endpointQuery } from "@/lib/api/queries";
import {
  ATTACHMENT_TYPE_LABELS,
  formatFileSize,
  isImageType,
} from "@/lib/attachments";

/** A file as the page lists it: numbered, since files keep no name. */
export interface ListedFile {
  attachment: AttachmentSummary;
  label: string;
}

/** A file's type and size, such as "PDF document · 210 kB". */
export const describeFile = ({ mimeType, sizeBytes }: AttachmentSummary) =>
  `${ATTACHMENT_TYPE_LABELS[mimeType]} · ${formatFileSize(sizeBytes)}`;

/**
 * An image, or a note for other files, with a link to download it. The link
 * is fetched each time the viewer opens, since links expire after a few
 * minutes. Goes inside a `ResponsiveDialogContent`.
 */
export function FileViewer({ file }: { file: ListedFile }) {
  const householdId = useHouseholdId();
  const { attachment, label } = file;
  const link = useQuery({
    ...endpointQuery("getAttachmentDownload", {
      params: { householdId, attachmentId: attachment.id },
    }),
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  // Some images, such as HEIC outside Safari, can't be shown.
  const [broken, setBroken] = useState(!isImageType(attachment.mimeType));
  const url = link.data?.url;

  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{label}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {describeFile(attachment)}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody>
        {url === undefined && !link.isError ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner aria-label="Loading the file" />
          </div>
        ) : null}
        {link.isError ? (
          <ErrorState
            error={link.error}
            onRetry={link.refetch}
            retrying={link.isRefetching}
            title="Couldn't open the file"
          />
        ) : null}
        {url && broken ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            This file can't be shown here. Download it to open it.
          </p>
        ) : null}
        {url && !broken ? (
          // biome-ignore lint/performance/noImgElement: next/image can't optimize a signed storage URL.
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: `onError` is a load failure, not user input.
          // biome-ignore lint/correctness/useImageSize: the size isn't known until it loads, and CSS fits it to the viewer.
          <img
            alt={`${label}, ${ATTACHMENT_TYPE_LABELS[attachment.mimeType]}`}
            className="bg-muted max-h-[70vh] w-full rounded-md object-contain"
            onError={() => setBroken(true)}
            src={url}
          />
        ) : null}
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <ResponsiveDialogClose render={<Button variant="outline" />}>
          Close
        </ResponsiveDialogClose>
        {url ? (
          <a
            className={buttonVariants()}
            download
            href={url}
            rel="noopener"
            target="_blank"
          >
            <DownloadIcon aria-hidden data-icon="inline-start" />
            Download
          </a>
        ) : null}
      </ResponsiveDialogFooter>
    </>
  );
}
