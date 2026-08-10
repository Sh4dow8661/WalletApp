import { Plus, Trash2, Wallet } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import {
  type AccountsSummary,
  cardUtilization,
  isCreditCard,
  summarizeAccounts,
} from "@/lib/credit.ts";
import { formatMoney, parseAmountInput } from "@/lib/money.ts";
import {
  ACCOUNT_TYPES,
  CATEGORY_PALETTE,
  DEFAULT_ACCOUNT_ICON,
  type AccountType,
  type IconName,
} from "@/shared/constants.ts";
import type { Account } from "@/shared/types.ts";

import { BarraUtilizacion } from "../components/credito.tsx";
import { CategoryIcon, IconPicker } from "../components/domain.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, EmptyState, Skeleton } from "../components/ui/card.tsx";
import {
  ColorPicker,
  SelectField,
  SwitchField,
  TextField,
} from "../components/ui/field.tsx";
import { ConfirmDialog } from "../components/ui/responsive-dialog.tsx";
import { useAccounts, useDeleteAccount, useSaveAccount } from "../hooks/api.ts";
import { useDisplaySettings } from "../hooks/use-month.tsx";
import { useIdNuevo } from "../hooks/use-id-nuevo.ts";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
import { MasterDetail } from "../layouts/MasterDetail.tsx";
import { ApiRequestError } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";

const ETIQUETAS_TIPO: Record<AccountType, string> = {
  CASH: "Efectivo",
  BANK: "Banco",
  CREDIT_CARD: "Tarjeta de crédito",
};

/** Gestión de cuentas. Réplica de `AccountsScreen.kt`. */
export function AccountsScreen() {
  const cuentas = useAccounts();
  const navigate = useNavigate();
  const { currency } = useDisplaySettings();

  // Una tarjeta no es dinero que se tiene, es deuda, así que va en su propia
  // sección y no revuelta con el efectivo (ver `lib/credit.ts`).
  const regulares = cuentas.data?.filter((c) => !isCreditCard(c)) ?? [];
  const tarjetas = cuentas.data?.filter(isCreditCard) ?? [];
  const resumen = summarizeAccounts(cuentas.data ?? []);

  const lista = (
    <div>
      <ScreenHeader
        title="Cuentas"
        onBack={() => void navigate("/ajustes")}
        action={
          <Button asChild size="icon" variant="ghost" aria-label="Nueva cuenta">
            <Link to="/cuentas/nueva">
              <Plus />
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 p-4">
        {cuentas.isPending ? (
          <Skeleton className="h-32" />
        ) : cuentas.data?.length === 0 ? (
          <Card>
            <EmptyState icon={Wallet} title="Sin cuentas" />
          </Card>
        ) : (
          <>
            <ResumenPatrimonio resumen={resumen} currency={currency} />

            {regulares.length > 0 && (
              <section className="space-y-2">
                <h2 className="px-1 text-sm font-semibold opacity-70">Cuentas</h2>
                {regulares.map((cuenta) => (
                  <FilaCuenta key={cuenta.id} cuenta={cuenta} currency={currency} />
                ))}
              </section>
            )}

            {tarjetas.length > 0 && (
              <section className="space-y-2">
                <h2 className="px-1 text-sm font-semibold opacity-70">
                  Tarjetas de crédito
                </h2>
                {tarjetas.map((tarjeta) => (
                  <FilaTarjeta key={tarjeta.id} cuenta={tarjeta} currency={currency} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <MasterDetail
      lista={lista}
      vacio={{
        titulo: "Ninguna cuenta seleccionada",
        descripcion: "Elige una de la lista para editarla aquí, o crea una nueva.",
      }}
    />
  );
}

/**
 * Resumen del patrimonio, en tres cifras separadas.
 *
 * Un único "total" mezclaría dinero con deuda y saldría un número que no
 * significa nada. Activos y deuda se enseñan aparte, y el neto es la resta.
 */
function ResumenPatrimonio({
  resumen,
  currency,
}: {
  resumen: AccountsSummary;
  currency: string;
}) {
  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Cifra label="Activos" amount={resumen.assets} currency={currency} />
        <Cifra
          label="Deuda"
          amount={resumen.debt}
          currency={currency}
          className={resumen.debt > 0 ? "text-expense" : undefined}
        />
        <Cifra
          label="Neto"
          amount={resumen.net}
          currency={currency}
          className={resumen.net < 0 ? "text-expense" : undefined}
          destacada
        />
      </div>

      {resumen.totalPercent !== null && resumen.totalLevel !== null && (
        <div className="border-t border-black/8 pt-3 dark:border-white/10">
          <p className="mb-1.5 text-xs opacity-60">Utilización total del crédito</p>
          <BarraUtilizacion
            utilizacion={{
              debt: resumen.debt,
              limit: resumen.totalLimit,
              percent: resumen.totalPercent,
              level: resumen.totalLevel,
              available: null,
              isOverLimit: false,
            }}
            currency={currency}
            compacta
          />
          {resumen.cardsWithoutLimit > 0 && (
            <p className="mt-1 text-xs opacity-60">
              {resumen.cardsWithoutLimit === 1
                ? "Una tarjeta sin límite queda fuera de este porcentaje."
                : `${resumen.cardsWithoutLimit} tarjetas sin límite quedan fuera de este porcentaje.`}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Cifra({
  label,
  amount,
  currency,
  className,
  destacada = false,
}: {
  label: string;
  amount: number;
  currency: string;
  className?: string;
  destacada?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs opacity-60">{label}</p>
      <p
        className={cn(
          "truncate font-semibold tabular-nums",
          destacada ? "text-base" : "text-sm",
          className,
        )}
      >
        {formatMoney(amount, currency)}
      </p>
    </div>
  );
}

function FilaCuenta({ cuenta, currency }: { cuenta: Account; currency: string }) {
  return (
    <Link to={`/cuentas/${cuenta.id}`} className="block">
      <Card className="flex items-center gap-3 py-3 transition-colors hover:bg-black/2 dark:hover:bg-white/8">
        <CategoryIcon iconName={cuenta.iconName} colorHex={cuenta.colorHex} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{cuenta.name}</p>
          <p className="text-xs opacity-60">
            {ETIQUETAS_TIPO[cuenta.type]}
            {!cuenta.includeInTotal && " · fuera del total"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            cuenta.currentBalance < 0 && "text-expense",
          )}
        >
          {formatMoney(cuenta.currentBalance, currency)}
        </span>
      </Card>
    </Link>
  );
}

/**
 * Fila de tarjeta: enseña la DEUDA, no el balance en negativo.
 *
 * "−300 $" obliga a traducir mentalmente el signo cada vez; "300 $ de deuda"
 * se entiende de un vistazo, que es de lo que se trata.
 */
function FilaTarjeta({ cuenta, currency }: { cuenta: Account; currency: string }) {
  const utilizacion = cardUtilization(cuenta);

  return (
    <Link to={`/cuentas/${cuenta.id}`} className="block">
      <Card className="space-y-2.5 transition-colors hover:bg-black/2 dark:hover:bg-white/8">
        <div className="flex items-center gap-3">
          <CategoryIcon iconName={cuenta.iconName} colorHex={cuenta.colorHex} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{cuenta.name}</p>
            <p className="text-xs opacity-60">
              Deuda
              {!cuenta.includeInTotal && " · fuera del total"}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              utilizacion.debt > 0 && "text-expense",
            )}
          >
            {formatMoney(utilizacion.debt, currency)}
          </span>
        </div>

        <BarraUtilizacion
          utilizacion={utilizacion}
          currency={currency}
          enlaceConfigurar={`/cuentas/${cuenta.id}`}
        />
      </Card>
    </Link>
  );
}

/**
 * Alta y edición de cuenta.
 *
 * El campo de balance cambia de significado según el caso (§8.3): al crear es el
 * balance **inicial**; al editar es el balance **actual** deseado y el servidor
 * recalcula el inicial. La etiqueta y la ayuda lo dicen explícitamente.
 */
export function AccountFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cuentas = useAccounts();
  const editando = id !== undefined;

  // Se carga primero y se monta después, con `key`: así el estado del
  // formulario arranca en `useState` y no hace falta volcarlo desde un efecto.
  if (cuentas.isPending) {
    return (
      <div>
        <ScreenHeader
          title={editando ? "Editar cuenta" : "Nueva cuenta"}
          onBack={() => void navigate("/cuentas")}
        />
        <div className="space-y-4 p-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </div>
    );
  }

  const existente = cuentas.data?.find((c) => c.id === id);
  const inicial = existente
    ? {
        name: existente.name,
        type: existente.type,
        // Al editar se muestra el balance ACTUAL, no el inicial (§8.3).
        balance: String(existente.currentBalance),
        creditLimit: existente.creditLimit === null ? "" : String(existente.creditLimit),
        colorHex: existente.colorHex,
        iconName: existente.iconName,
        includeInTotal: existente.includeInTotal,
        currentBalance: existente.currentBalance,
      }
    : {
        name: "",
        type: "CASH" as AccountType,
        balance: "0",
        creditLimit: "",
        colorHex: CATEGORY_PALETTE[8],
        iconName: "Payments" as IconName,
        includeInTotal: true,
        currentBalance: 0,
      };

  return <AccountForm key={id ?? "nueva"} id={id} inicial={inicial} />;
}

interface ValoresCuenta {
  name: string;
  type: AccountType;
  balance: string;
  /** Vacío = sin límite configurado. */
  creditLimit: string;
  colorHex: string;
  iconName: IconName;
  includeInTotal: boolean;
  currentBalance: number;
}

function AccountForm({
  id,
  inicial,
}: {
  id: string | undefined;
  inicial: ValoresCuenta;
}) {
  const navigate = useNavigate();
  const editando = id !== undefined;

  const guardar = useSaveAccount();
  const borrar = useDeleteAccount();
  const { currency } = useDisplaySettings();

  const [name, setName] = useState(inicial.name);
  const [type, setType] = useState<AccountType>(inicial.type);
  const [balance, setBalance] = useState(inicial.balance);
  const [creditLimit, setCreditLimit] = useState(inicial.creditLimit);
  const [colorHex, setColorHex] = useState<string>(inicial.colorHex);
  const [iconName, setIconName] = useState<IconName>(inicial.iconName);
  const [includeInTotal, setIncludeInTotal] = useState(inicial.includeInTotal);
  // Id generado en cliente: hace idempotente la creación (§9).
  const idNuevo = useIdNuevo();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const esTarjeta = type === "CREDIT_CARD";

  function cambiarTipo(nuevo: AccountType) {
    setType(nuevo);
    // Igual que `AddEditAccountViewModel.setType`: el icono sigue al tipo.
    setIconName(DEFAULT_ACCOUNT_ICON[nuevo]);
  }

  async function alEnviar(event: FormEvent) {
    event.preventDefault();
    setErrores({});

    const importe = parseAmountInput(balance);
    if (importe === null) {
      setErrores({ balance: "Balance inválido" });
      return;
    }

    // El límite solo existe en las tarjetas. En cualquier otro tipo se manda
    // null para que el servidor lo limpie si la cuenta venía de ser tarjeta.
    let limite: number | null = null;
    if (esTarjeta && creditLimit.trim() !== "") {
      limite = parseAmountInput(creditLimit);
      if (limite === null || limite <= 0) {
        setErrores({ creditLimit: "El límite debe ser un número mayor que cero" });
        return;
      }
    }

    try {
      await guardar.mutateAsync({
        id,
        nuevoId: idNuevo,
        name,
        type,
        balance: importe,
        creditLimit: limite,
        colorHex,
        iconName,
        includeInTotal,
      });
      void navigate("/cuentas");
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrores(
          Object.keys(error.fields).length > 0
            ? error.fields
            : { general: error.message },
        );
      } else {
        setErrores({ general: "No se pudo guardar" });
      }
    }
  }

  return (
    <div>
      <ScreenHeader
        title={editando ? "Editar cuenta" : "Nueva cuenta"}
        onBack={() => void navigate("/cuentas")}
        action={
          editando ? (
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              aria-label="Eliminar"
              className="grid size-11 place-items-center rounded-xl text-expense hover:bg-expense/10"
            >
              <Trash2 className="size-5" />
            </button>
          ) : null
        }
      />

      <form onSubmit={(e) => void alEnviar(e)} className="space-y-5 p-4">
        {errores.general && (
          <p
            role="alert"
            className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense"
          >
            {errores.general}
          </p>
        )}

        <div className="flex justify-center py-2">
          <CategoryIcon iconName={iconName} colorHex={colorHex} size={72} />
        </div>

        <TextField
          label="Nombre"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errores.name}
        />

        <SelectField
          label="Tipo"
          value={type}
          onChange={(e) => cambiarTipo(e.target.value as AccountType)}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ETIQUETAS_TIPO[t]}
            </option>
          ))}
        </SelectField>

        <TextField
          label={editando ? "Balance actual" : "Balance inicial"}
          inputMode="decimal"
          required
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          error={errores.balance}
          hint={
            esTarjeta
              ? "En una tarjeta, un saldo negativo es deuda. Ej.: −300 significa que debes 300."
              : editando
                ? "Escribe el saldo real de la cuenta y se cuadrará sola: las transacciones no se tocan."
                : "Con cuánto empieza la cuenta."
          }
        />

        {/* Solo tiene sentido en una tarjeta, así que solo aparece ahí. */}
        {esTarjeta && (
          <TextField
            label="Límite de crédito"
            inputMode="decimal"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            error={errores.creditLimit}
            hint="Déjalo vacío si no lo sabes: entonces no se calcula el porcentaje de utilización."
          />
        )}

        <SwitchField
          label="Contar en el balance total"
          description="Si lo apagas, la cuenta sigue visible pero no suma al total del inicio."
          checked={includeInTotal}
          onCheckedChange={setIncludeInTotal}
        />

        <ColorPicker
          label="Color"
          colors={CATEGORY_PALETTE}
          value={colorHex}
          onChange={setColorHex}
        />

        <IconPicker
          label="Icono"
          value={iconName}
          colorHex={colorHex}
          onChange={setIconName}
        />

        <Button type="submit" full size="lg" disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </form>

      <ConfirmDialog
        open={confirmarBorrado}
        onOpenChange={setConfirmarBorrado}
        title="¿Eliminar la cuenta?"
        description={`Se eliminarán también TODAS sus transacciones, incluidas las transferencias con otras cuentas. Saldo actual: ${formatMoney(inicial.currentBalance, currency)}.`}
        onConfirm={() => {
          if (!id) return;
          borrar.mutate(id, { onSuccess: () => void navigate("/cuentas") });
        }}
      />
    </div>
  );
}
