"use client";

import type { UserSummary } from "@homesplit/contracts";
import { CameraIcon, ImageIcon, Trash2Icon } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api/client";
import { avatarFileError } from "@/lib/avatars";
import { AvatarCropDialog } from "./avatar-crop-dialog";

interface AvatarFieldProps {
  onChanged: () => Promise<unknown>;
  user: Pick<UserSummary, "name" | "imageUrl">;
}

/**
 * The avatar as a button: without a photo it picks one, with one it offers
 * to change or remove it. Phones offer the camera in the picker too.
 */
export function AvatarField({ user, onChanged }: AvatarFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cropping, setCropping] = useState(false);
  const [removing, setRemoving] = useState(false);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const [picked] = Array.from(event.target.files ?? []);
    // Picking the same file again should open it again.
    event.target.value = "";
    if (!picked) {
      return;
    }
    const error = avatarFileError(picked);
    if (error) {
      toast.error(error);
      return;
    }
    setFile(picked);
    setCropping(true);
  }

  async function uploaded() {
    setCropping(false);
    toast.success("Photo saved.");
    await onChanged();
  }

  async function remove() {
    await api("deleteAvatar");
    toast.success("Photo removed.");
    await onChanged();
  }

  const button = (
    <button
      className="focus-visible:ring-ring/50 relative shrink-0 rounded-full outline-none hover:opacity-90 focus-visible:ring-3"
      onClick={user.imageUrl ? undefined : () => input.current?.click()}
      ref={trigger}
      type="button"
    >
      <span className="sr-only">
        {user.imageUrl ? "Change profile photo" : "Add profile photo"}
      </span>
      <UserAvatar
        className="size-16 *:data-[slot=avatar-fallback]:text-lg"
        decorative
        user={user}
      />
      <span className="bg-background text-foreground absolute -right-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full border shadow-sm">
        <CameraIcon aria-hidden className="size-3.5" />
      </span>
    </button>
  );

  return (
    <>
      {user.imageUrl ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={button} />
          <DropdownMenuContent align="start" className="min-w-40">
            <DropdownMenuItem onClick={() => input.current?.click()}>
              <ImageIcon aria-hidden />
              Change photo
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setRemoving(true)}
              variant="destructive"
            >
              <Trash2Icon aria-hidden />
              Remove photo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        button
      )}
      {/* `.heic` for browsers that give HEIC photos no type. */}
      <input
        accept="image/*,.heic"
        aria-label="Upload profile photo"
        hidden
        onChange={pick}
        ref={input}
        type="file"
      />
      <ConfirmDialog
        confirmLabel="Remove"
        description="People will see your initials instead."
        destructive
        finalFocus={trigger}
        onConfirm={remove}
        onOpenChange={setRemoving}
        open={removing}
        title="Remove your photo?"
      />
      <AvatarCropDialog
        file={file}
        onOpenChange={setCropping}
        onUploaded={uploaded}
        open={cropping}
      />
    </>
  );
}
