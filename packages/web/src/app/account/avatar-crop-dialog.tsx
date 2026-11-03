"use client";

import type { UserSummary } from "@homesplit/contracts";
import { ImageOffIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { uploadAvatar } from "@/lib/api/upload";
import { avatarUploadErrorMessage, croppedAvatar } from "@/lib/avatars";

interface AvatarCropDialogProps {
  file: File | null;
  onOpenChange: (open: boolean) => void;
  onUploaded: (user: UserSummary) => Promise<unknown>;
  open: boolean;
}

/** Crops the picked photo to a square and uploads it with progress. */
export function AvatarCropDialog({
  file,
  open,
  onOpenChange,
  onUploaded,
}: AvatarCropDialogProps) {
  const controller = useRef<AbortController | null>(null);
  // The cropper measures its frame once, so it waits for the dialog to stop
  // scaling in.
  const [shown, setShown] = useState(false);
  const close = (next: boolean) => {
    if (!next) {
      controller.current?.abort();
    }
    onOpenChange(next);
  };
  return (
    <Dialog onOpenChange={close} onOpenChangeComplete={setShown} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>
            Drag the photo or use the arrow keys to move it, and zoom to fit.
          </DialogDescription>
        </DialogHeader>
        {file ? (
          <CropEditor
            controller={controller}
            file={file}
            onUploaded={onUploaded}
            shown={shown}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface CropEditorProps {
  controller: { current: AbortController | null };
  file: File;
  onUploaded: AvatarCropDialogProps["onUploaded"];
  /** Whether the dialog has finished opening. */
  shown: boolean;
}

function CropEditor({ file, controller, onUploaded, shown }: CropEditorProps) {
  const previewUrl = useObjectUrl(file);
  const image = useRef<RefObject<HTMLImageElement | null> | null>(null);
  const zoomLabel = useId();
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<Area | null>(null);
  // HEIC outside Safari, or a file that isn't the image it claims to be.
  const [broken, setBroken] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const current = new AbortController();
    controller.current = current;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      // An image the browser can't show can't be cropped here, so it goes
      // whole and the backend crops it to its center.
      const loaded = image.current?.current;
      const upload =
        loaded && area && !broken ? await croppedAvatar(loaded, area) : file;
      const user = await uploadAvatar(upload, {
        signal: current.signal,
        onProgress: setProgress,
      });
      await onUploaded(user);
    } catch (caught) {
      if (!current.signal.aborted) {
        setError(avatarUploadErrorMessage(caught));
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {broken ? (
          <div className="bg-muted text-muted-foreground mx-auto flex aspect-square w-full max-w-64 flex-col items-center justify-center gap-2 rounded-lg p-6 text-center text-sm">
            <ImageOffIcon aria-hidden className="size-6" />
            <p>
              Your browser can't show this photo, so it will be cropped to its
              center.
            </p>
          </div>
        ) : (
          <div className="bg-muted relative mx-auto aspect-square w-full max-w-64 overflow-hidden rounded-lg">
            {previewUrl && shown ? (
              <Cropper
                aspect={1}
                crop={position}
                cropperProps={{
                  "aria-label": "Photo position",
                  "aria-roledescription": "crop area",
                  role: "group",
                }}
                cropShape="round"
                image={previewUrl}
                keyboardStep={10}
                maxZoom={MAX_ZOOM}
                mediaProps={{ onError: () => setBroken(true) }}
                minZoom={MIN_ZOOM}
                objectFit="cover"
                onCropChange={setPosition}
                onCropComplete={(_, pixels) => setArea(pixels)}
                onZoomChange={setZoom}
                setImageRef={(ref) => {
                  image.current = ref;
                }}
                showGrid={false}
                zoom={zoom}
              />
            ) : null}
          </div>
        )}
        {broken ? null : (
          <div className="flex items-center gap-3">
            <span className="sr-only" id={zoomLabel}>
              Zoom
            </span>
            <ZoomOutIcon aria-hidden className="text-muted-foreground size-4" />
            <Slider
              aria-labelledby={zoomLabel}
              disabled={!area}
              largeStep={0.5}
              max={MAX_ZOOM}
              min={MIN_ZOOM}
              onValueChange={(value) =>
                setZoom(Array.isArray(value) ? value[0] : value)
              }
              step={0.05}
              // An array, so the slider has one thumb rather than a range's two.
              value={[zoom]}
            />
            <ZoomInIcon aria-hidden className="text-muted-foreground size-4" />
          </div>
        )}
        {uploading ? (
          <Progress
            aria-label="Uploading photo"
            value={Math.round(progress * 100)}
          />
        ) : null}
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button
          disabled={uploading || !(area || broken)}
          onClick={save}
          type="button"
        >
          {uploading ? <Spinner data-icon="inline-start" /> : null}
          Save photo
        </Button>
      </DialogFooter>
    </>
  );
}

function useObjectUrl(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file]);
  return url;
}
