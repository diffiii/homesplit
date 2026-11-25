"use client";

import { type AttachmentMimeType, isImageType } from "@homesplit/contracts";
import { cn } from "cn";
import {
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

/** Pixel sizes of a preview, as Tailwind classes. */
const PREVIEW_SIZES = { 40: "size-10", 48: "size-12" } as const;

/**
 * An image from `src`, or the icon for `type` when there's no `src` or it
 * fails to load, such as a HEIC outside Safari.
 */
export function FilePreview({
  size,
  src,
  type,
}: {
  size: keyof typeof PREVIEW_SIZES;
  src: string | null;
  type: AttachmentMimeType | null;
}) {
  const [broken, setBroken] = useState(false);
  const box = cn("shrink-0 rounded-md", PREVIEW_SIZES[size]);
  if (src && !broken) {
    return (
      // biome-ignore lint/performance/noImgElement: next/image can't optimize object URLs or redirects to signed URLs.
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: `onError` is a load failure, not user input.
      <img
        alt=""
        className={cn(box, "object-cover")}
        data-testid="file-preview"
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        src={src}
        width={size}
      />
    );
  }
  const Icon = fileIcon(type);
  return (
    <div
      className={cn(box, "bg-muted flex items-center justify-center")}
      data-testid="file-icon"
    >
      <Icon aria-hidden className="text-muted-foreground size-5" />
    </div>
  );
}

/** The icon for a file of `type`: a document for PDFs, a picture for images. */
function fileIcon(type: AttachmentMimeType | null): LucideIcon {
  if (type === "application/pdf") {
    return FileTextIcon;
  }
  return isImageType(type) ? FileImageIcon : FileIcon;
}
