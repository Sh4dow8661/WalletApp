import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Drawer } from "vaul";

import { useIsMobile } from "../../hooks/use-breakpoint.ts";
import { cn } from "../../lib/cn.ts";

/**
 * Diálogo que se adapta al dispositivo (§10).
 *
 * En móvil es un panel que sube desde abajo, con su asa para arrastrarlo: es el
 * gesto que se espera en un teléfono. En tablet y escritorio es un diálogo
 * centrado. El contenido es el mismo en los dos casos, solo cambia el envoltorio.
 */
interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Pie fijo, para los botones de acción. */
  footer?: React.ReactNode;
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: ResponsiveDialogProps) {
  const esMovil = useIsMobile();

  if (esMovil) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Drawer.Content
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col",
              "rounded-t-2xl bg-surface-light outline-none dark:bg-neutral-900",
            )}
          >
            {/* Asa de arrastre. */}
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-black/20 dark:bg-white/25" />
            <div className="px-4 pt-3">
              <Drawer.Title className="text-lg font-semibold">{title}</Drawer.Title>
              {description && (
                <Drawer.Description className="mt-1 text-sm opacity-60">
                  {description}
                </Drawer.Description>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
            {footer && (
              <div className="border-t border-black/8 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/10">
                {footer}
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(32rem,calc(100vw-2rem))]",
            "-translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl outline-none",
            "bg-surface-light dark:bg-neutral-900",
          )}
        >
          <div className="flex items-start justify-between gap-4 p-5 pb-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm opacity-60">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Cerrar"
              className="rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-2">{children}</div>
          {footer && (
            <div className="border-t border-black/8 p-5 dark:border-white/10">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Confirmación para acciones destructivas.
 *
 * §8.7 pide avisar antes de borrar una cuenta (se lleva sus transacciones) o una
 * categoría (deja los gastos sin clasificar), así que la consecuencia concreta
 * va en `description`, no un "¿Seguro?" genérico.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Eliminar",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 flex-1 rounded-xl border border-black/15 text-sm font-medium dark:border-white/20"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="h-11 flex-1 rounded-xl bg-expense text-sm font-medium text-white"
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div />
    </ResponsiveDialog>
  );
}
