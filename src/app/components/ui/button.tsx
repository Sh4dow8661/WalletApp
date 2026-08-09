import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn.ts";

/**
 * Botón base.
 *
 * Los tamaños parten de 44 px de alto porque §10 exige objetivos táctiles de al
 * menos 44×44 en móvil. `icon` es cuadrado por el mismo motivo.
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium",
    "transition-colors select-none whitespace-nowrap",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    "focus-visible:ring-offset-surface-light dark:focus-visible:ring-offset-surface-dark",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-5 [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-dark active:bg-primary-dark",
        secondary:
          "bg-black/5 hover:bg-black/10 active:bg-black/15 dark:bg-white/10 dark:hover:bg-white/15",
        outline:
          "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
        ghost: "hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10",
        danger: "bg-expense text-white hover:brightness-95 active:brightness-90",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-11 px-4",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
      },
      full: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Renderiza el hijo en lugar de un <button>, para envolver enlaces. */
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  full,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, full }), className)} {...props} />
  );
}

export { buttonVariants };
