import { AlertTriangle, Check } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { availableAfterReconcile, effectiveBuffer, reconcile } from "@/lib/colchon.ts";
import { isCreditCard } from "@/lib/credit.ts";
import { formatMoney, parseAmountInput } from "@/lib/money.ts";
import type { Account } from "@/shared/types.ts";

import { Button } from "../components/ui/button.tsx";
import { Card, Skeleton } from "../components/ui/card.tsx";
import { SwitchField, TextField } from "../components/ui/field.tsx";
import { useAccounts, useReconcileAccount } from "../hooks/api.ts";
import { useIdNuevo } from "../hooks/use-id-nuevo.ts";
import { useDisplaySettings } from "../hooks/use-month.tsx";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
import { ApiRequestError } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";

/**
 * Cuadre de una cuenta contra su saldo real.
 *
 * El usuario teclea lo que la cuenta tiene de verdad y la app enseña la
 * diferencia ANTES de tocar nada. Si acepta, se crea una transacción de ajuste
 * por esa diferencia: queda en el historial, con su fecha, y se puede ver o
 * deshacer después.
 *
 * Es distinto de editar el «balance actual» de la cuenta (§8.3), que despeja el
 * balance inicial y no deja rastro. Para un cuadre periódico se quiere el
 * rastro; para arreglar el punto de partida de una cuenta nueva, el otro.
 */
export function ReconcileScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cuentas = useAccounts();

  if (cuentas.isPending) {
    return (
      <div>
        <ScreenHeader title="Cuadrar cuenta" onBack={() => void navigate("/cuentas")} />
        <div className="space-y-4 p-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-14" />
        </div>
      </div>
    );
  }

  const cuenta = cuentas.data?.find((c) => c.id === id);
  if (!cuenta) {
    return (
      <div>
        <ScreenHeader title="Cuadrar cuenta" onBack={() => void navigate("/cuentas")} />
        <p className="p-4 text-sm opacity-70">Esa cuenta ya no existe.</p>
      </div>
    );
  }

  return <ReconcileForm key={cuenta.id} cuenta={cuenta} />;
}

function ReconcileForm({ cuenta }: { cuenta: Account }) {
  const navigate = useNavigate();
  const { currency } = useDisplaySettings();
  const cuadrar = useReconcileAccount();
  const idAjuste = useIdNuevo();

  const [saldoReal, setSaldoReal] = useState("");
  // El default es lo que se eligió la última vez en esta cuenta.
  const [aplicarColchon, setAplicarColchon] = useState(cuenta.bufferApplied);
  const [error, setError] = useState<string>();

  // En una tarjeta el colchón no aplica: ni se ofrece (§ petición 2, caso 5).
  const esTarjeta = isCreditCard(cuenta);
  const tieneColchon = !esTarjeta && cuenta.bufferAmount > 0;

  const real = parseAmountInput(saldoReal);
  const previsualizacion = real === null ? null : reconcile(cuenta.currentBalance, real);
  const disponibleTras =
    real === null
      ? null
      : availableAfterReconcile(
          real,
          cuenta.bufferAmount,
          tieneColchon && aplicarColchon,
        );

  async function alEnviar(event: FormEvent) {
    event.preventDefault();
    setError(undefined);

    if (real === null) {
      setError("Escribe el saldo real de la cuenta");
      return;
    }

    try {
      await cuadrar.mutateAsync({
        id: cuenta.id,
        realBalance: real,
        applyBuffer: aplicarColchon,
        adjustmentId: idAjuste,
      });
      void navigate("/cuentas");
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "No se pudo cuadrar la cuenta");
    }
  }

  return (
    <div>
      <ScreenHeader title="Cuadrar cuenta" onBack={() => void navigate("/cuentas")} />

      <form onSubmit={(e) => void alEnviar(e)} className="space-y-5 p-4">
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense"
          >
            {error}
          </p>
        )}

        <Card className="space-y-1">
          <p className="text-xs opacity-60">{cuenta.name}</p>
          <p className="text-xs opacity-60">Saldo según la app</p>
          <p className="text-2xl font-bold tabular-nums">
            {formatMoney(cuenta.currentBalance, currency)}
          </p>
          {cuenta.lastReconciledAt !== null && (
            <p className="text-xs opacity-60">
              Último cuadre:{" "}
              {new Date(cuenta.lastReconciledAt).toLocaleDateString("es", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </Card>

        <TextField
          label="Saldo real"
          inputMode="decimal"
          autoFocus
          required
          value={saldoReal}
          onChange={(e) => setSaldoReal(e.target.value)}
          hint="El que ves en el banco o al contar el efectivo."
        />

        {tieneColchon && (
          <SwitchField
            label="Descontar el colchón"
            description={`Tienes ${formatMoney(cuenta.bufferAmount, currency)} apartados en esta cuenta. Se recordará tu elección.`}
            checked={aplicarColchon}
            onCheckedChange={setAplicarColchon}
          />
        )}

        {/* La diferencia se enseña ANTES de tocar nada: se acepta viendo el
            número, no a ciegas. */}
        {previsualizacion && (
          <Card
            className={cn(
              "space-y-2",
              previsualizacion.needsAdjustment
                ? "border border-warning/40"
                : "border border-income/40",
            )}
          >
            {previsualizacion.needsAdjustment ? (
              <>
                <p className="text-xs opacity-60">Diferencia</p>
                <p
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    previsualizacion.difference > 0 ? "text-income" : "text-expense",
                  )}
                >
                  {previsualizacion.difference > 0 ? "+" : "−"}
                  {formatMoney(previsualizacion.adjustmentAmount, currency)}
                </p>
                <p className="text-xs opacity-70">
                  Se creará{" "}
                  {previsualizacion.adjustmentType === "INCOME"
                    ? "un ingreso"
                    : "un gasto"}{" "}
                  de {formatMoney(previsualizacion.adjustmentAmount, currency)} con la
                  nota «Ajuste de cuadre». Podrás verlo y borrarlo como cualquier otro
                  movimiento.
                </p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-income">
                <Check className="size-4" aria-hidden />
                La cuenta ya cuadra: no se creará ningún movimiento.
              </p>
            )}

            {disponibleTras !== null && tieneColchon && aplicarColchon && (
              <div className="border-t border-black/8 pt-2 dark:border-white/10">
                <p className="text-xs opacity-60">Disponible tras el colchón</p>
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    disponibleTras < 0 && "text-expense",
                  )}
                >
                  {formatMoney(disponibleTras, currency)}
                </p>
                {disponibleTras < 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-expense">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    Estás por debajo de tu colchón de{" "}
                    {formatMoney(
                      effectiveBuffer({ ...cuenta, bufferApplied: true }),
                      currency,
                    )}
                    .
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        <Button type="submit" full size="lg" disabled={cuadrar.isPending}>
          {cuadrar.isPending
            ? "Cuadrando…"
            : previsualizacion && !previsualizacion.needsAdjustment
              ? "Marcar como cuadrada"
              : "Cuadrar"}
        </Button>
      </form>
    </div>
  );
}
