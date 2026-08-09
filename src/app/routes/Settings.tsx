import {
  CalendarDays,
  ChevronRight,
  Download,
  LogOut,
  Moon,
  Sun,
  SunMoon,
  Tag,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { csvFileName, toCsv } from "@/lib/csv.ts";
import { SUPPORTED_CURRENCIES, THEME_MODES, type ThemeMode } from "@/shared/constants.ts";

import { Button } from "../components/ui/button.tsx";
import { Card, CardTitle } from "../components/ui/card.tsx";
import { SelectField } from "../components/ui/field.tsx";
import {
  useAccounts,
  useCategories,
  useSaveSettings,
  useSettings,
} from "../hooks/api.ts";
import { api } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";
import { signOut } from "../lib/auth-client.ts";
import { useTheme } from "../lib/theme.tsx";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
import type { Transaction } from "@/shared/types.ts";

/** Ajustes. Réplica de `SettingsScreen.kt` más la zona horaria y cerrar sesión. */
export function SettingsScreen() {
  const navigate = useNavigate();
  const ajustes = useSettings();
  const guardar = useSaveSettings();
  const { mode, setMode } = useTheme();

  return (
    <div>
      <ScreenHeader title="Ajustes" />

      <div className="space-y-4 p-4">
        <Card className="space-y-4">
          <CardTitle>Apariencia</CardTitle>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tema</legend>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
              {THEME_MODES.map((valor) => {
                const Icon = valor === "LIGHT" ? Sun : valor === "DARK" ? Moon : SunMoon;
                const etiqueta =
                  valor === "LIGHT" ? "Claro" : valor === "DARK" ? "Oscuro" : "Sistema";
                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => {
                      // Se aplica al momento y se guarda en el servidor para
                      // que el otro dispositivo lo herede.
                      setMode(valor as ThemeMode);
                      guardar.mutate({ themeMode: valor });
                    }}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-xs font-medium",
                      mode === valor
                        ? "bg-white shadow-sm dark:bg-neutral-700"
                        : "opacity-60 hover:opacity-100",
                    )}
                  >
                    <Icon className="size-4" />
                    {etiqueta}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <SelectField
            label="Moneda"
            value={ajustes.data?.currency ?? "USD"}
            onChange={(e) => guardar.mutate({ currency: e.target.value as "USD" })}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Zona horaria"
            value={ajustes.data?.timeZone ?? "America/Puerto_Rico"}
            onChange={(e) => guardar.mutate({ timeZone: e.target.value })}
            hint="Determina a qué día pertenece cada gasto en el calendario y las estadísticas."
          >
            {/*
              Lista corta y útil en vez de las ~600 zonas IANA: son las de la
              región del usuario más UTC. Se puede ampliar cuando haga falta.
            */}
            {[
              "America/Puerto_Rico",
              "America/New_York",
              "America/Chicago",
              "America/Denver",
              "America/Los_Angeles",
              "America/Mexico_City",
              "America/Bogota",
              "America/Santo_Domingo",
              "Europe/Madrid",
              "UTC",
            ].map((z) => (
              <option key={z} value={z}>
                {z.replace("_", " ")}
              </option>
            ))}
          </SelectField>
        </Card>

        <Card className="divide-y divide-black/5 p-0 dark:divide-white/10">
          <EnlaceAjuste to="/cuentas" icon={Wallet} label="Cuentas" />
          <EnlaceAjuste to="/categorias" icon={Tag} label="Categorías" />
          <EnlaceAjuste
            to="/calendario"
            icon={CalendarDays}
            label="Calendario de gasto"
          />
        </Card>

        <Card className="space-y-3">
          <CardTitle>Datos</CardTitle>
          <ExportarCsv />
          <p className="text-xs opacity-60">
            El CSV lleva las transacciones con el mismo formato que la app Android. No
            incluye presupuestos ni sus enlaces.
          </p>
        </Card>

        <Button
          variant="outline"
          full
          size="lg"
          onClick={() => {
            void signOut().then(() => navigate("/login", { replace: true }));
          }}
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </Button>

        <p className="pt-2 text-center text-xs opacity-40">WalletApp · PWA</p>
      </div>
    </div>
  );
}

function EnlaceAjuste({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-14 items-center gap-3 px-4 first:rounded-t-2xl last:rounded-b-2xl hover:bg-black/3 dark:hover:bg-white/5"
    >
      <Icon className="size-5 opacity-60" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="size-4 opacity-40" />
    </Link>
  );
}

/**
 * Descarga el CSV.
 *
 * Se genera en el cliente a partir del API: se piden todas las transacciones sin
 * filtro de fecha y se resuelven los nombres de cuenta y categoría, que es lo
 * que espera el formato de `CsvExporter`.
 */
function ExportarCsv() {
  const ajustes = useSettings();
  const cuentas = useAccounts();
  const categorias = useCategories();
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportar() {
    setExportando(true);
    setError(null);
    try {
      const transacciones = await api.get<Transaction[]>("/api/transactions?limit=1000");
      const nombreCuenta = new Map((cuentas.data ?? []).map((c) => [c.id, c.name]));
      const nombreCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.name]));

      const csv = toCsv(
        transacciones.map((tx) => ({
          date: tx.date,
          type: tx.type,
          amount: tx.amount,
          categoryName: tx.categoryId ? nombreCategoria.get(tx.categoryId) : "",
          accountName: nombreCuenta.get(tx.accountId),
          transferAccountName: tx.transferAccountId
            ? nombreCuenta.get(tx.transferAccountId)
            : "",
          note: tx.note,
        })),
        ajustes.data?.timeZone ?? "America/Puerto_Rico",
      );

      // Descarga por enlace temporal: es lo que funciona igual en móvil y en
      // escritorio sin pedir permisos.
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = csvFileName();
      enlace.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el archivo");
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        full
        onClick={() => void exportar()}
        disabled={exportando}
      >
        <Download className="size-4" />
        {exportando ? "Generando…" : "Exportar CSV"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-expense">
          {error}
        </p>
      )}
    </>
  );
}
