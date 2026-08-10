import { onlineManager } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";

import { useBreakpoint } from "./hooks/use-breakpoint.ts";
import { DesktopLayout } from "./layouts/DesktopLayout.tsx";
import { MobileLayout } from "./layouts/MobileLayout.tsx";
import { useSession } from "./lib/auth-client.ts";
import { habiaSesion, olvidarSesion, recordarSesion } from "./lib/sesion-recordada.ts";
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
  const { data: session, isPending, error } = useSession();
  const location = useLocation();

  // Se recuerda que hubo sesión para poder abrir la app sin red (§9).
  useEffect(() => {
    if (session) recordarSesion();
  }, [session]);

  /**
   * "El servidor dice que no estás autenticado" y "no he podido preguntárselo"
   * son cosas distintas, y confundirlas deja la app inservible sin red.
   *
   * No basta con mirar `navigator.onLine`: hay redes que responden pero no
   * llegan, y el propio `setOffline` de las pruebas no siempre lo actualiza. La
   * señal fiable es que la consulta de sesión haya fallado.
   */
  const noSePudoComprobar = error !== null || !onlineManager.isOnline();

  if (isPending) return <Cargando />;

  if (!session) {
    // Si no se pudo comprobar y consta que había sesión, se enseña la app con
    // los datos guardados. El servidor sigue validando cada petición, así que
    // esto no abre ninguna puerta: sin cookie válida no llegaría ningún dato.
    if (noSePudoComprobar && habiaSesion()) return <Outlet />;

    // Aquí sí: el servidor ha contestado que no hay sesión.
    olvidarSesion();
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/** Si ya hay sesión, las pantallas de acceso no tienen sentido. */
function RedirectIfAuthenticated() {
  const { data: session, isPending, error } = useSession();

  if (isPending) return <Cargando />;

  // Sin poder comprobar la sesión, se manda a la app si consta que la había;
  // allí el guard decidirá con la misma información.
  if (!session && (error !== null || !onlineManager.isOnline()) && habiaSesion()) {
    return <Navigate to="/" replace />;
  }

  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Elige el layout según el ancho (§10).
 *
 * Las rutas y los datos son los mismos en los dos; lo único que cambia es la
 * composición: barra inferior y pantalla completa en móvil, barra lateral y
 * master-detail a partir de tablet.
 */
function AppShell() {
  return useBreakpoint() === "mobile" ? <MobileLayout /> : <DesktopLayout />;
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

          {/*
            Las altas y ediciones son rutas HIJAS de su lista. Así el mismo
            árbol sirve para las dos composiciones: en escritorio el detalle se
            pinta al lado de la lista (master-detail), y en móvil la sustituye.
          */}
          <Route path="transacciones" element={<TransactionsScreen />}>
            <Route path="nueva" element={<TransactionFormScreen />} />
            <Route path=":id" element={<TransactionFormScreen />} />
          </Route>

          <Route path="presupuestos" element={<BudgetsScreen />}>
            <Route path="nuevo" element={<BudgetFormScreen />} />
            <Route path=":id" element={<BudgetFormScreen />} />
          </Route>

          <Route path="cuentas" element={<AccountsScreen />}>
            <Route path="nueva" element={<AccountFormScreen />} />
            <Route path=":id" element={<AccountFormScreen />} />
          </Route>

          <Route path="categorias" element={<CategoriesScreen />}>
            <Route path="nueva" element={<CategoryFormScreen />} />
            <Route path=":id" element={<CategoryFormScreen />} />
          </Route>

          <Route path="estadisticas" element={<StatisticsScreen />} />
          <Route path="calendario" element={<CalendarScreen />} />
          <Route path="ajustes" element={<SettingsScreen />} />
        </Route>
      </Route>

      {/* Cualquier otra ruta vuelve al inicio. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
