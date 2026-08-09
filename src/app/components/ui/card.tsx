import type { ComponentProps } from "react";

import { cn } from "../../lib/cn.ts";

/** Tarjeta: el contenedor de casi todo en el dashboard y las listas. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/8 bg-white p-4",
        "dark:border-white/10 dark:bg-white/5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-sm font-semibold opacity-70", className)} {...props} />;
}

/** Estado vacío, con su explicación y una acción opcional. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {Icon && <Icon className="size-10 opacity-25" />}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-sm opacity-60">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Barra de carga discreta, para no dejar la pantalla en blanco. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-black/8 dark:bg-white/10", className)}
      {...props}
    />
  );
}
