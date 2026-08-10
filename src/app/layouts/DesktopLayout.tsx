import {
  BarChart3,
  CalendarDays,
  Keyboard,
  LayoutDashboard,
  PieChart,
  Plus,
  Receipt,
  Repeat,
  Settings,
  Tag,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

import { summarizeNetWorth } from "@/lib/patrimonio.ts";

import { DisponibleReal } from "../components/patrimonio.tsx";
import { Button } from "../components/ui/button.tsx";
import { ResponsiveDialog } from "../components/ui/responsive-dialog.tsx";
import { useAccounts } from "../hooks/api.ts";
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

/**
 * `corto` es el rótulo del rail estrecho.
 *
 * En 80 px de barra quedan unos 55 útiles, donde a 10 px de fuente entran diez
 * caracteres largos. "Transacciones" no cabe ahí de ninguna manera: o se
 * trunca con puntos suspensivos, o ensancha la barra y saca scroll horizontal.
 * Con una etiqueta corta se lee entera, que es lo que se quería desde el
 * principio. El nombre completo sigue estando en el `title`.
 */
const SECCIONES = [
  { to: "/", label: "Inicio", corto: "Inicio", icon: LayoutDashboard, end: true },
  {
    to: "/transacciones",
    label: "Transacciones",
    corto: "Movim.",
    icon: Receipt,
    end: false,
  },
  {
    to: "/presupuestos",
    label: "Presupuestos",
    corto: "Presup.",
    icon: PieChart,
    end: false,
  },
  {
    to: "/estadisticas",
    label: "Estadísticas",
    corto: "Estad.",
    icon: BarChart3,
    end: false,
  },
  {
    to: "/calendario",
    label: "Calendario",
    corto: "Calend.",
    icon: CalendarDays,
    end: false,
  },
] as const;

const SECUNDARIAS = [
  { to: "/gastos-fijos", label: "Gastos fijos", corto: "Fijos", icon: Repeat },
  { to: "/cuentas", label: "Cuentas", corto: "Cuentas", icon: Wallet },
  { to: "/categorias", label: "Categorías", corto: "Categ.", icon: Tag },
  { to: "/ajustes", label: "Ajustes", corto: "Ajustes", icon: Settings },
] as const;

export function DesktopLayout() {
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const esEscritorio = breakpoint === "desktop";
  const { label, currency, previous, next } = useMonth();
  // La cabecera ya no lee el balance del dashboard: la cifra sale de las
  // cuentas, igual que en las otras dos pantallas, para que no puedan discrepar.
  const cuentas = useAccounts();
  const patrimonio = summarizeNetWorth(cuentas.data ?? []);
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
      {/*
        Tres zonas: logo fijo arriba, lista con scroll en medio y Atajos fijo
        abajo. Antes era una sola columna sin `overflow`, así que en cuanto la
        lista no cabía —con la ventana baja, o con el rail estrecho, donde cada
        ítem ocupa el doble por llevar el texto debajo del icono— los últimos
        elementos quedaban recortados y no había forma de llegar a ellos.
      */}
      <nav
        aria-label="Navegación principal"
        className={cn(
          "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-black/8 p-3",
          "dark:border-white/10",
          esEscritorio ? "w-60" : "w-20",
        )}
      >
        <div
          className={cn(
            "mb-3 flex shrink-0 items-center gap-2 px-2 py-2",
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

        {/*
          `min-h-0` es imprescindible: dentro de un flex column, un hijo `flex-1`
          tiene `min-height: auto` por defecto y se niega a encoger por debajo de
          su contenido, así que `overflow-y-auto` nunca llegaría a activarse.
          `overscroll-contain` evita que al llegar al final se arrastre la página.
        */}
        <div
          data-menu-secciones
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-1 overscroll-contain",
            // Vertical sí, horizontal NUNCA: con `auto` en los dos ejes, un
            // ítem que se pasa cuatro píxeles saca una barra horizontal con sus
            // flechas y deja el menú desplazable de lado.
            "overflow-y-auto overflow-x-hidden",
            // Y la barra no puede robar ancho, o los rótulos se recortan.
            "scroll-sin-barra",
          )}
        >
          {SECCIONES.map((seccion) => (
            <ItemNav key={seccion.to} {...seccion} ancho={esEscritorio} />
          ))}

          <hr className="my-2 shrink-0 border-black/8 dark:border-white/10" />

          {SECUNDARIAS.map((seccion) => (
            <ItemNav key={seccion.to} {...seccion} end={false} ancho={esEscritorio} />
          ))}
        </div>

        {/* Fuera del contenedor con scroll: siempre alcanzable. */}
        <div className="mt-1 shrink-0 border-t border-black/8 pt-1 dark:border-white/10">
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
        {/*
          La cabecera va SIEMPRE, también en tablet. Antes colgaba de
          `esEscritorio` y el resultado era que entre 768 y 1279 px no quedaba
          ningún botón para crear una transacción: solo el atajo `n`. Y ese
          tramo es fácil de pisar sin ser una tablet — un monitor de 1920 con el
          escalado de Windows al 150 % da 1280 px de viewport, menos la barra de
          scroll. En tablet solo se compacta: el botón se queda en el icono.
        */}
        <header
          className={cn(
            "sticky top-0 z-20 flex items-center gap-4 border-b border-black/8 py-3 backdrop-blur",
            "bg-surface-light/95 dark:border-white/10 dark:bg-neutral-900/95",
            esEscritorio ? "px-6" : "px-4",
          )}
        >
          {/* La misma cifra y el mismo desglose que el Dashboard y Cuentas:
              las tres pantallas leen de `summarizeNetWorth`. */}
          <DisponibleReal patrimonio={patrimonio} currency={currency} compacto />

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
            <span
              className={cn(
                "text-center text-sm font-medium",
                esEscritorio ? "min-w-36" : "min-w-28",
              )}
            >
              {label}
            </span>
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
          <Button
            onClick={() => void navigate("/transacciones/nueva")}
            size={esEscritorio ? "md" : "icon"}
            aria-label="Nueva transacción"
            title="Nueva transacción"
          >
            <Plus />
            {esEscritorio && "Nueva transacción"}
          </Button>
        </header>

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
  corto,
  icon: Icon,
  end,
  ancho,
}: {
  to: string;
  label: string;
  /** Rótulo del rail estrecho. Si falta, se usa el largo. */
  corto?: string;
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
          // `min-w-0` para que el enlace pueda encoger por debajo del ancho de
          // su texto. Sin él, `truncate` no llega a activarse nunca: el
          // `white-space: nowrap` que lleva dentro fija el ancho mínimo al del
          // rótulo entero y es el propio ítem el que ensancha la barra.
          "min-w-0",
          !ancho && "flex-col gap-1 px-1 py-2 text-[10px]",
          isActive
            ? "bg-primary-light text-primary-dark dark:bg-primary/20 dark:text-primary-light"
            : "opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10",
        )
      }
    >
      <Icon className="size-5 shrink-0" />
      {/* `max-w-full` ata el rótulo al ancho disponible en los dos modos, no
          solo en el rail: en la barra ancha un nombre largo lo desbordaba
          igual. */}
      <span className="max-w-full truncate">{ancho ? label : (corto ?? label)}</span>
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
