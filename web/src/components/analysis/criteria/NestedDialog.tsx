import type { ReactNode, RefObject } from 'react';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../ui/dialog';

interface Props {
  /** Контент нижньої модалки — рендер усередині її DOM, інакше її фокус-пастка блокує поля вводу. */
  portalRef: RefObject<HTMLElement | null>;
  title: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md';
  role?: 'dialog' | 'alertdialog';
}

/**
 * Діалог поверх вікна «Плюси та мінуси» (чи майстра): modal=false + рендер у DOM нижньої модалки
 * (docs/instructions/chakra-nested-dialog-focus.md), закриття — лише хрестиком, кнопкою чи Escape.
 * Монтувати лише на час показу (`{cond && <… />}`): Ark Portal читає portalRef один раз при монтуванні.
 */
export function NestedDialog({ portalRef, title, onClose, footer, children, size = 'sm', role = 'dialog' }: Props) {
  return (
    <DialogRoot
      open
      role={role}
      onOpenChange={(d) => !d.open && onClose()}
      size={size}
      placement="center"
      scrollBehavior="inside"
      modal={false}
      closeOnInteractOutside={false}
    >
      <DialogBackdrop />
      <DialogContent portalRef={portalRef}>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
