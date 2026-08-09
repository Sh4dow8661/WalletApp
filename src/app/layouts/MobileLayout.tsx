import {
  BarChart3,
  LayoutDashboard,
  PieChart,
  Plus,
  Receipt,
  Settings,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { cn } from "../lib/cn.ts";

/**
 * Layout móvil (§10, < 768 px).
 *
 * Barra de navegación inferior con las 5 secciones y un botón flotante de nueva
 * transacción en Inicio y Transacciones, igual que la app Android.
 */

const SECCIONES = [
  { to: "/", label: "Inicio", icon: LayoutDashboard, end: true },
  { to: "/transacciones", label: "Transacciones", icon: Receipt, end: false },
  { to: "/presupuestos", label: "Presupuestos", icon: PieChart, end: false },
  { to: "/estadisticas", label: "Estadísticas", icon: BarChart3, end: false },
  { to: "/ajustes", label: "Ajustes", icon: Settings, end: false },
] as const;

/** Rutas donde aparece el botón flotante, como en la app Android. */
const CON_FAB = ["/", "/transacciones"];

/**
 * Las pantallas de alta y edición van a pantalla completa (§10): sin barra
 * inferior. Es lo que hace la app Android y, además, evita que la barra tape el
 * botón de guardar al final del formulario.
 */
const RUTAS_FORMULARIO = /^\/(transaccion|presupuesto|cuenta|categoria)\//;

export function MobileLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const esFormulario = RUTAS_FORMULARIO.test(location.pathname);
  const mostrarFab = !esFormulario && CON_FAB.includes(location.pathname);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Con barra inferior hay que reservarle sitio para que no tape nada. */}
      <main className={cn("flex-1", !esFormulario && "pb-20")}>
        <Outlet />
      </main>

      {mostrarFab && (
        <button
          type="button"
          onClick={() => void navigate("/transaccion/nueva")}
          aria-label="Nueva transacción"
          className={cn(
            "fixed right-4 z-30 grid size-14 place-items-center rounded-2xl",
            "bg-primary text-white shadow-lg shadow-primary/30",
            "transition-transform active:scale-95",
            // Justo encima de la barra, respetando la zona de gestos.
            "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          <Plus className="size-6" />
        </button>
      )}

      {!esFormulario && (
        <nav
          aria-label="Navegación principal"
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 border-t border-black/8 backdrop-blur",
            "bg-surface-light/95 dark:border-white/10 dark:bg-neutral-900/95",
            "pb-[env(safe-area-inset-bottom)]",
          )}
        >
          <ul className="flex">
            {SECCIONES.map(({ to, label, icon: Icon, end }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      // 44 px de alto mínimo (§10).
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2",
                      "text-[10px] font-medium transition-colors",
                      isActive ? "text-primary" : "opacity-60",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cn("size-5", isActive && "fill-primary/15")} />
                      <span className="truncate">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/**
 * Cabecera de las pantallas secundarias, con botón de volver.
 * Se queda pegada arriba al hacer scroll.
 */
export function ScreenHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex items-center gap-2 border-b border-black/8 px-2 py-2 backdrop-blur",
        "bg-surface-light/95 dark:border-white/10 dark:bg-neutral-900/95",
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="grid size-11 place-items-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M19 12H5M12 19l-7-7 7-7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <h1 className={cn("flex-1 truncate text-lg font-semibold", !onBack && "px-2")}>
        {title}
      </h1>
      {action}
    </header>
  );
}
