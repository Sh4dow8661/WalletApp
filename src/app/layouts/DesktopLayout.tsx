import {
  BarChart3,
  CalendarDays,
  Keyboard,
  LayoutDashboard,
  PieChart,
  Plus,
  Receipt,
  Settings,
  Tag,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

import { formatMoney } from "@/lib/money.ts";

import { Button } from "../components/ui/button.tsx";
import { ResponsiveDialog } from "../components/ui/responsive-dialog.tsx";
import { useDashboard } from "../hooks/api.ts";
import { useBreakpoint } from "../hooks/use-breakpoint.ts";
import { type Shortcut, useShortcuts } from "../hooks/use-shortcuts.ts";
import { useMonth } from "../hooks/use-month.tsx";
import { cn } from "../lib/cn.ts";

/**
 * Layout de tablet y escritorio (§10, ≥ 768 px).
 *
 * En tablet es un rail estrecho con icono y etiqueta corta; a partir de 1280 px
 * la barra se ensancha y aparece la cabecera con el balance total. El contenido
 * se limita a 1600 px y se centra, para que no se estire sin control en un
 * monitor ancho.
 */

const SECCIONES = [
  { to: "/", label: "Inicio", icon: LayoutDashboard, end: true },
  { to: "/transacciones", label: "Transacciones", icon: Receipt, end: false },
  { to: "/presupuestos", label: "Presupuestos", icon: PieChart, end: false },
  { to: "/estadisticas", label: "Estadísticas", icon: BarChart3, end: false },
  { to: "/calendario", label: "Calendario", icon: CalendarDays, end: false },
] as const;

const SECUNDARIAS = [
  { to: "/cuentas", label: "Cuentas", icon: Wallet },
  { to: "/categorias", label: "Categorías", icon: Tag },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

export function DesktopLayout() {
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const esEscritorio = breakpoint === "desktop";
  const { year, month, label, currency, previous, next } = useMonth();
  const resumen = useDashboard(year, month);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  const atajos: Shortcut[] = [
    {
      key: "n",
      description: "Nueva transacción",
      action: () => void navigate("/transacciones/nueva"),
    },
    {
      key: "/",
      description: "Buscar en transacciones",
      action: () => {
        void navigate("/transacciones");
        // El foco se pide tras la navegación, cuando el campo ya existe.
        setTimeout(
          () => document.querySelector<HTMLInputElement>("[data-buscar]")?.focus(),
          50,
        );
      },
    },
    { key: "arrowleft", description: "Mes anterior", action: previous },
    { key: "arrowright", description: "Mes siguiente", action: next },
    { key: "?", description: "Mostrar esta ayuda", action: () => setAyudaAbierta(true) },
    {
      key: "escape",
      description: "Cerrar diálogo",
      action: () => setAyudaAbierta(false),
    },
    {
      key: "d",
      chord: "g d",
      description: "Ir a Inicio",
      action: () => void navigate("/"),
    },
    {
      key: "t",
      chord: "g t",
      description: "Ir a Transacciones",
      action: () => void navigate("/transacciones"),
    },
    {
      key: "p",
      chord: "g p",
      description: "Ir a Presupuestos",
      action: () => void navigate("/presupuestos"),
    },
    {
      key: "e",
      chord: "g e",
      description: "Ir a Estadísticas",
      action: () => void navigate("/estadisticas"),
    },
  ];

  const { esperandoSecuencia } = useShortcuts(atajos);

  return (
    <div className="flex min-h-dvh">
      <nav
        aria-label="Navegación principal"
        className={cn(
          "sticky top-0 flex h-dvh shrink-0 flex-col gap-1 border-r border-black/8 p-3",
          "dark:border-white/10",
          esEscritorio ? "w-60" : "w-20",
        )}
      >
        <div
          className={cn(
            "mb-3 flex items-center gap-2 px-2 py-2",
            !esEscritorio && "justify-center",
          )}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-white">
            <Wallet className="size-5" />
          </span>
          {esEscritorio && (
            <span className="text-lg font-bold tracking-tight">WalletApp</span>
          )}
        </div>

        {SECCIONES.map((seccion) => (
          <ItemNav key={seccion.to} {...seccion} ancho={esEscritorio} />
        ))}

        <hr className="my-2 border-black/8 dark:border-white/10" />

        {SECUNDARIAS.map((seccion) => (
          <ItemNav key={seccion.to} {...seccion} end={false} ancho={esEscritorio} />
        ))}

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => setAyudaAbierta(true)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm opacity-60",
              "transition-colors hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10",
              !esEscritorio && "justify-center px-0",
            )}
          >
            <Keyboard className="size-5 shrink-0" />
            {esEscritorio && <span>Atajos</span>}
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {esEscritorio && (
          <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-black/8 bg-surface-light/95 px-6 py-3 backdrop-blur dark:border-white/10 dark:bg-neutral-900/95">
            <div className="min-w-0">
              <p className="text-xs opacity-60">Balance total</p>
              <p className="text-xl font-bold tabular-nums">
                {formatMoney(resumen.data?.totalBalance ?? 0, currency)}
              </p>
            </div>

            {/* Selector de mes siempre visible, como pide §10. */}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={previous}
                aria-label="Mes anterior"
                className="grid size-9 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                ‹
              </button>
              <span className="min-w-36 text-center text-sm font-medium">{label}</span>
              <button
                type="button"
                onClick={next}
                aria-label="Mes siguiente"
                className="grid size-9 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                ›
              </button>
            </div>

            {/* Sin FAB en escritorio: la acción va en la cabecera (§10). */}
            <Button onClick={() => void navigate("/transacciones/nueva")}>
              <Plus />
              Nueva transacción
            </Button>
          </header>
        )}

        <main className="mx-auto w-full max-w-[1600px] flex-1">
          <Outlet />
        </main>
      </div>

      {/* Aviso discreto de que se está esperando la segunda tecla de `g …`. */}
      {esperandoSecuencia && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-white dark:text-neutral-900">
          Pulsa D, T, P o E para saltar de sección
        </div>
      )}

      <DialogoAtajos open={ayudaAbierta} onOpenChange={setAyudaAbierta} atajos={atajos} />
    </div>
  );
}

function ItemNav({
  to,
  label,
  icon: Icon,
  end,
  ancho,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  ancho: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={ancho ? undefined : label}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          !ancho && "flex-col gap-1 px-1 py-2 text-[10px]",
          isActive
            ? "bg-primary-light text-primary-dark dark:bg-primary/20 dark:text-primary-light"
            : "opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10",
        )
      }
    >
      <Icon className="size-5 shrink-0" />
      <span className={cn(!ancho && "truncate")}>{label}</span>
    </NavLink>
  );
}

/** Ayuda de atajos, abierta con `?` (§10). */
function DialogoAtajos({
  open,
  onOpenChange,
  atajos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atajos: Shortcut[];
}) {
  const etiquetaTecla = (atajo: Shortcut) =>
    atajo.chord
      ? atajo.chord.toUpperCase().replace(" ", " luego ")
      : nombreTecla(atajo.key);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Atajos de teclado"
      description="Funcionan cuando no estás escribiendo en un campo."
    >
      <ul className="space-y-2">
        {atajos.map((atajo) => (
          <li
            key={atajo.chord ?? atajo.key}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span className="opacity-80">{atajo.description}</span>
            <kbd className="shrink-0 rounded-md border border-black/15 px-2 py-0.5 font-mono text-xs dark:border-white/20">
              {etiquetaTecla(atajo)}
            </kbd>
          </li>
        ))}
      </ul>
    </ResponsiveDialog>
  );
}

function nombreTecla(key: string): string {
  switch (key) {
    case "arrowleft":
      return "←";
    case "arrowright":
      return "→";
    case "escape":
      return "Esc";
    default:
      return key.toUpperCase();
  }
}
