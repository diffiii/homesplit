"use client";

import { cn } from "cn";
import {
  type ComponentProps,
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  use,
} from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

const SheetContext = createContext(false);

interface ResponsiveDialogProps {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

/**
 * A dialog that's a bottom sheet on phones, where a centered dialog leaves the
 * keyboard covering its buttons. Its parts take the same props either way.
 */
export function ResponsiveDialog({
  children,
  open,
  onOpenChange,
}: ResponsiveDialogProps) {
  const sheet = useIsMobile();
  const Root = sheet ? Drawer : Dialog;
  return (
    <SheetContext value={sheet}>
      <Root onOpenChange={(next) => onOpenChange?.(next)} open={open}>
        {children}
      </Root>
    </SheetContext>
  );
}

interface PartProps {
  children?: ReactNode;
  className?: string;
}

/** Pass the button to open it as `render`, as with Base UI triggers. */
export function ResponsiveDialogTrigger({
  render,
  children,
}: {
  children?: ReactNode;
  render: ReactElement;
}) {
  const Trigger = use(SheetContext) ? DrawerTrigger : DialogTrigger;
  return <Trigger render={render}>{children}</Trigger>;
}

export function ResponsiveDialogClose({
  render,
  children,
}: {
  children?: ReactNode;
  render: ReactElement;
}) {
  const Close = use(SheetContext) ? DrawerClose : DialogClose;
  return <Close render={render}>{children}</Close>;
}

export function ResponsiveDialogContent({
  children,
  className,
  finalFocus,
  initialFocus,
}: PartProps & {
  /** Where focus goes on close, when the element that opened the dialog may be gone. */
  finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"];
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  if (use(SheetContext)) {
    return (
      <DrawerContent
        className={cn("pb-[env(safe-area-inset-bottom)]", className)}
        finalFocus={finalFocus}
        initialFocus={initialFocus}
      >
        {children}
      </DrawerContent>
    );
  }
  return (
    <DialogContent
      className={className}
      finalFocus={finalFocus}
      initialFocus={initialFocus}
    >
      {children}
    </DialogContent>
  );
}

export function ResponsiveDialogHeader({ children, className }: PartProps) {
  const Header = use(SheetContext) ? DrawerHeader : DialogHeader;
  return <Header className={className}>{children}</Header>;
}

export function ResponsiveDialogTitle({ children, className }: PartProps) {
  const Title = use(SheetContext) ? DrawerTitle : DialogTitle;
  return <Title className={className}>{children}</Title>;
}

export function ResponsiveDialogDescription({
  children,
  className,
}: PartProps) {
  const Description = use(SheetContext) ? DrawerDescription : DialogDescription;
  return <Description className={className}>{children}</Description>;
}

/** The dialog's fields; scrolls inside the sheet when the keyboard leaves little room. */
export function ResponsiveDialogBody({ children, className }: PartProps) {
  const sheet = use(SheetContext);
  return (
    <div className={cn(sheet && "min-h-0 overflow-y-auto p-4", className)}>
      {children}
    </div>
  );
}

export function ResponsiveDialogFooter({ children, className }: PartProps) {
  if (use(SheetContext)) {
    return (
      <DrawerFooter className={cn("*:h-11", className)}>
        {children}
      </DrawerFooter>
    );
  }
  return <DialogFooter className={className}>{children}</DialogFooter>;
}
