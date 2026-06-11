"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
} from "@heroui/react";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import { useHaptics } from "@/lib/hooks/use-haptics";

type RenderProp = React.ReactNode | ((onClose: () => void) => React.ReactNode);

interface ResponsiveSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Heading shown at the top of the sheet/modal. */
  title?: React.ReactNode;
  /** Body content. May be a render prop receiving `onClose`. */
  children: RenderProp;
  /** Sticky footer (typically the action buttons). */
  footer?: RenderProp;
  /** Desktop modal size; ignored on mobile (bottom sheet auto-heights). */
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** Disable closing by backdrop/escape (e.g. while submitting). */
  isDismissable?: boolean;
  scrollBehavior?: "inside" | "outside";
}

function render(node: RenderProp, onClose: () => void): React.ReactNode {
  return typeof node === "function" ? node(onClose) : node;
}

/**
 * One dialog primitive that feels native on each form factor: a bottom sheet
 * (HeroUI Drawer, swipe-to-dismiss) on phones and a centered Modal on desktop.
 * Same prop surface so callers don't branch. Fires a light haptic on open.
 */
export function ResponsiveSheet({
  isOpen,
  onOpenChange,
  title,
  children,
  footer,
  size = "md",
  isDismissable = true,
  scrollBehavior = "inside",
}: ResponsiveSheetProps) {
  const isMobile = useIsMobile();
  const { tap } = useHaptics();

  const handleOpenChange = (open: boolean) => {
    if (open) tap();
    onOpenChange(open);
  };

  if (isMobile) {
    return (
      <Drawer
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        placement="bottom"
        isDismissable={isDismissable}
        scrollBehavior={scrollBehavior}
        className="rounded-t-2xl max-h-[92dvh]"
      >
        <DrawerContent>
          {(onClose) => (
            <>
              <div className="sheet-grabber" aria-hidden />
              {title && (
                <DrawerHeader className="flex flex-col gap-1">{title}</DrawerHeader>
              )}
              <DrawerBody>{render(children, onClose)}</DrawerBody>
              {footer && (
                <DrawerFooter className="safe-area-bottom">
                  {render(footer, onClose)}
                </DrawerFooter>
              )}
            </>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      size={size}
      isDismissable={isDismissable}
      scrollBehavior={scrollBehavior}
    >
      <ModalContent>
        {(onClose) => (
          <>
            {title && (
              <ModalHeader className="flex flex-col gap-1">{title}</ModalHeader>
            )}
            <ModalBody>{render(children, onClose)}</ModalBody>
            {footer && <ModalFooter>{render(footer, onClose)}</ModalFooter>}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
