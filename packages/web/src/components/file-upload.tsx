"use client";

import {
  type Attachment,
  type AttachmentMimeType,
  isImageType,
} from "@homesplit/contracts";
import { cn } from "cn";
import {
  CameraIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  type LucideIcon,
  PaperclipIcon,
  RotateCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { uploadAttachment } from "@/lib/api/upload";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPE_NAMES,
  attachmentFileError,
  attachmentTypeOf,
  formatFileSize,
  uploadErrorMessage,
} from "@/lib/attachments";

type UploadStatus =
  | "rejected"
  | "uploading"
  | "uploaded"
  | "failed"
  | "canceled";

interface UploadItem {
  attachment: Attachment | null;
  /** Why the file was rejected or its upload failed. */
  error: string | null;
  file: File;
  key: string;
  /** An object URL for images, revoked when the item goes. */
  previewUrl: string | null;
  /** Share sent so far, from 0 to 1. */
  progress: number;
  status: UploadStatus;
  type: AttachmentMimeType | null;
}

interface FileUploadProps {
  disabled?: boolean;
  householdId: string;
  /** Called with the uploaded attachments, in the order they were added, whenever that list changes. */
  onAttachmentsChange?: (attachments: Attachment[]) => void;
  /** Called when files start or stop uploading, so a form can wait for them. */
  onPendingChange?: (pending: boolean) => void;
}

/**
 * Takes photos with the camera or picks files, checks their type and size,
 * and uploads each as a household attachment with progress, cancel, and
 * retry. Images are previewed where the browser can show them.
 */
export function FileUpload({ disabled = false, ...options }: FileUploadProps) {
  const { items, add, cancel, retry, remove } = useFileUploads(options);
  const cameraInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    add(Array.from(event.target.files ?? []));
    // Picking the same file again should add it again.
    event.target.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled}
          onClick={() => cameraInput.current?.click()}
          type="button"
          variant="outline"
        >
          <CameraIcon aria-hidden data-icon="inline-start" />
          Take photo
        </Button>
        <Button
          disabled={disabled}
          onClick={() => filesInput.current?.click()}
          type="button"
          variant="outline"
        >
          <PaperclipIcon aria-hidden data-icon="inline-start" />
          Choose files
        </Button>
        {/* Phones open the camera; elsewhere it picks an image. */}
        <input
          accept="image/*"
          aria-label="Take photo"
          capture="environment"
          disabled={disabled}
          hidden
          onChange={pick}
          ref={cameraInput}
          type="file"
        />
        <input
          accept={ATTACHMENT_ACCEPT}
          aria-label="Choose files"
          disabled={disabled}
          hidden
          multiple
          onChange={pick}
          ref={filesInput}
          type="file"
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {ATTACHMENT_TYPE_NAMES}, up to {formatFileSize(ATTACHMENT_MAX_BYTES)}{" "}
        each.
      </p>
      {items.length > 0 ? (
        <ul aria-label="Files" className="flex flex-col gap-2">
          {items.map((item) => (
            <UploadRow
              actions={{
                cancel: () => cancel(item),
                retry: () => retry(item),
                remove: () => remove(item),
              }}
              item={item}
              key={item.key}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type UploadOptions = Omit<FileUploadProps, "disabled">;

/**
 * The added files and their uploads. The callbacks run as the state changes,
 * not from an effect, since uploads finish after the render that started them.
 */
function useFileUploads({
  householdId,
  onAttachmentsChange,
  onPendingChange,
}: UploadOptions) {
  const [items, setItems] = useState<UploadItem[]>([]);
  // The latest items and callbacks, for uploads that finish after a render.
  const itemsRef = useRef<UploadItem[]>([]);
  const callbacks = useRef({ onAttachmentsChange, onPendingChange });
  const controllers = useRef(new Map<string, AbortController>());
  const nextKey = useRef(0);

  useEffect(() => {
    callbacks.current = { onAttachmentsChange, onPendingChange };
  });

  useEffect(
    () => () => {
      for (const controller of controllers.current.values()) {
        controller.abort();
      }
      for (const item of itemsRef.current) {
        revokePreview(item);
      }
    },
    []
  );

  function update(change: (items: UploadItem[]) => UploadItem[]) {
    const previous = itemsRef.current;
    const next = change(previous);
    itemsRef.current = next;
    setItems(next);

    const attachments = uploadedOf(next);
    if (!sameAttachments(uploadedOf(previous), attachments)) {
      callbacks.current.onAttachmentsChange?.(attachments);
    }
    if (isPending(previous) !== isPending(next)) {
      callbacks.current.onPendingChange?.(isPending(next));
    }
  }

  function patch(key: string, changes: Partial<UploadItem>) {
    update((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item))
    );
  }

  function start({ key, file }: UploadItem) {
    const controller = new AbortController();
    controllers.current.set(key, controller);
    uploadAttachment(householdId, file, {
      signal: controller.signal,
      onProgress: (progress) => patch(key, { progress }),
    })
      .then(
        (attachment) =>
          patch(key, { status: "uploaded", progress: 1, attachment }),
        (error: unknown) => {
          // Canceling or removing has already updated the item.
          if (!controller.signal.aborted) {
            patch(key, { status: "failed", error: uploadErrorMessage(error) });
          }
        }
      )
      .finally(() => {
        if (controllers.current.get(key) === controller) {
          controllers.current.delete(key);
        }
      });
  }

  /** Check each file, then upload the ones that pass. */
  function add(files: File[]) {
    const added = files.map((file): UploadItem => {
      const type = attachmentTypeOf(file);
      const error = attachmentFileError(file);
      nextKey.current += 1;
      return {
        key: String(nextKey.current),
        file,
        type,
        previewUrl:
          !error && isImageType(type) ? URL.createObjectURL(file) : null,
        status: error ? "rejected" : "uploading",
        progress: 0,
        error,
        attachment: null,
      };
    });
    update((current) => [...current, ...added]);
    for (const item of added) {
      if (item.status === "uploading") {
        start(item);
      }
    }
  }

  function cancel(item: UploadItem) {
    controllers.current.get(item.key)?.abort();
    patch(item.key, { status: "canceled", progress: 0 });
  }

  function retry(item: UploadItem) {
    patch(item.key, { status: "uploading", progress: 0, error: null });
    start(item);
  }

  function remove(item: UploadItem) {
    controllers.current.get(item.key)?.abort();
    revokePreview(item);
    update((current) => current.filter(({ key }) => key !== item.key));
  }

  return { items, add, cancel, retry, remove };
}

type RowAction = "cancel" | "retry" | "remove";

/** The buttons a row offers in each status. */
const ROW_ACTIONS: Record<UploadStatus, readonly RowAction[]> = {
  uploading: ["cancel"],
  failed: ["retry", "remove"],
  canceled: ["retry", "remove"],
  uploaded: ["remove"],
  rejected: ["remove"],
};

const ACTION_BUTTONS: Record<
  RowAction,
  { icon: LucideIcon; label: (name: string) => string }
> = {
  cancel: { icon: XIcon, label: (name) => `Cancel uploading ${name}` },
  retry: { icon: RotateCwIcon, label: (name) => `Retry uploading ${name}` },
  remove: { icon: Trash2Icon, label: (name) => `Remove ${name}` },
};

interface UploadRowProps {
  actions: Record<RowAction, () => void>;
  item: UploadItem;
}

function UploadRow({ item, actions }: UploadRowProps) {
  const { file, status, error } = item;
  const percent = Math.round(item.progress * 100);
  return (
    <li className="flex items-center gap-3 rounded-lg border p-2">
      <Preview item={item} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        {status === "rejected" || status === "failed" ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            {formatFileSize(file.size)} · {STATUS_LABELS[status](percent)}
          </p>
        )}
        {status === "uploading" ? (
          <Progress aria-label={`Uploading ${file.name}`} value={percent} />
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1">
        {ROW_ACTIONS[status].map((action) => {
          const { icon: Icon, label } = ACTION_BUTTONS[action];
          return (
            <Button
              aria-label={label(file.name)}
              key={action}
              onClick={actions[action]}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Icon aria-hidden />
            </Button>
          );
        })}
      </div>
    </li>
  );
}

/** What a row says about a file that has no error. */
const STATUS_LABELS: Record<
  Exclude<UploadStatus, "rejected" | "failed">,
  (percent: number) => string
> = {
  uploading: (percent) => `Uploading ${percent}%`,
  uploaded: () => "Uploaded",
  canceled: () => "Canceled",
};

/** The image itself, or an icon for files the browser can't show, such as PDFs and HEIC outside Safari. */
function Preview({ item }: { item: UploadItem }) {
  const [broken, setBroken] = useState(false);
  const box = "size-12 shrink-0 rounded-md";
  if (item.previewUrl && !broken) {
    return (
      // biome-ignore lint/performance/noImgElement: next/image can't optimize a local object URL.
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: `onError` is a load failure, not user input.
      <img
        alt=""
        className={cn(box, "object-cover")}
        data-testid="file-preview"
        height={48}
        onError={() => setBroken(true)}
        src={item.previewUrl}
        width={48}
      />
    );
  }
  const Icon = fileIcon(item.type);
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
export function fileIcon(type: AttachmentMimeType | null): LucideIcon {
  if (type === "application/pdf") {
    return FileTextIcon;
  }
  return isImageType(type) ? FileImageIcon : FileIcon;
}

function revokePreview(item: UploadItem) {
  if (item.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function uploadedOf(items: UploadItem[]): Attachment[] {
  return items.flatMap(({ attachment, status }) =>
    status === "uploaded" && attachment ? [attachment] : []
  );
}

function sameAttachments(a: Attachment[], b: Attachment[]): boolean {
  return (
    a.length === b.length && a.every(({ id }, index) => id === b[index]?.id)
  );
}

function isPending(items: UploadItem[]): boolean {
  return items.some(({ status }) => status === "uploading");
}
