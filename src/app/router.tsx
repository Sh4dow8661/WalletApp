import { Loader2 } from "lucide-react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";

import { useIsMobile } from "./hooks/use-breakpoint.ts";
import { useSession } from "./lib/auth-client.ts";
import { MobileLayout } from "./layouts/MobileLayout.tsx";
import { AccountFormScreen, AccountsScreen } from "./routes/Accounts.tsx";
import { BudgetFormScreen, BudgetsScreen } from "./routes/Budgets.tsx";
import { CalendarScreen } from "./routes/Calendar.tsx";
import { CategoriesScreen, CategoryFormScreen } from "./routes/Categories.tsx";
import { DashboardScreen } from "./routes/Dashboard.tsx";
import { SettingsScreen } from "./routes/Settings.tsx";
import { StatisticsScreen } from "./routes/Statistics.tsx";
import { TransactionFormScreen, TransactionsScreen } from "./routes/Transactions.tsx";
import {
  LoginScreen,
  RecuperarScreen,
  RegistroScreen,
} from "./routes/auth/AuthScreens.tsx";

/** Pantalla de carga mientras se resuelve la sesión. */
function Cargando() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Loader2 className="size-8 animate-spin text-primary" aria-label="Cargando" />
    </div>
  );
}

/**
 * Guard de rutas (§11).
 *
 * Sin sesión manda a `/login` **conservando el destino**, para volver ahí
 * después de entrar. Es solo comodidad de navegación: la seguridad de verdad
 * está en el servidor, donde toda ruta `/api` valida la sesión.
 */
function RequireAuth() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <Cargando />;
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Si ya hay sesión, las pantallas de acceso no tienen sentido. */
function RedirectIfAuthenticated() {
  const { data: session, isPending } = useSession();
  if (isPending) return <Cargando />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Elige el layout según el ancho (§10).
 *
 * En la Fase 4 solo existe el móvil; el de escritorio llega en la Fase 5. Hasta
 * entonces se usa el móvil en todos los tamaños, centrado para que no se estire.
 */
function AppShell() {
  const esMovil = useIsMobile();
  return (
    <div className={esMovil ? undefined : "mx-auto w-full max-w-2xl"}>
      <MobileLayout />
    </div>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/registro" element={<RegistroScreen />} />
        <Route path="/recuperar" element={<RecuperarScreen />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardScreen />} />
          <Route path="transacciones" element={<TransactionsScreen />} />
          <Route path="presupuestos" element={<BudgetsScreen />} />
          <Route path="estadisticas" element={<StatisticsScreen />} />
          <Route path="calendario" element={<CalendarScreen />} />
          <Route path="ajustes" element={<SettingsScreen />} />
          <Route path="cuentas" element={<AccountsScreen />} />
          <Route path="categorias" element={<CategoriesScreen />} />

          {/* Altas y ediciones. `nueva` y `:id` comparten pantalla. */}
          <Route path="transaccion/nueva" element={<TransactionFormScreen />} />
          <Route path="transaccion/:id" element={<TransactionFormScreen />} />
          <Route path="presupuesto/nuevo" element={<BudgetFormScreen />} />
          <Route path="presupuesto/:id" element={<BudgetFormScreen />} />
          <Route path="cuenta/nueva" element={<AccountFormScreen />} />
          <Route path="cuenta/:id" element={<AccountFormScreen />} />
          <Route path="categoria/nueva" element={<CategoryFormScreen />} />
          <Route path="categoria/:id" element={<CategoryFormScreen />} />
        </Route>
      </Route>

      {/* Cualquier otra ruta vuelve al inicio. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
