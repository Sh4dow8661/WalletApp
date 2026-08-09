import { Plus, Trash2, Wallet } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { formatMoney, parseAmountInput } from "@/lib/money.ts";
import {
  ACCOUNT_TYPES,
  CATEGORY_PALETTE,
  DEFAULT_ACCOUNT_ICON,
  type AccountType,
  type IconName,
} from "@/shared/constants.ts";

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
import { useDisplaySettings } from "../hooks/use-month.ts";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
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

  return (
    <div>
      <ScreenHeader
        title="Cuentas"
        onBack={() => void navigate("/ajustes")}
        action={
          <Button asChild size="icon" variant="ghost" aria-label="Nueva cuenta">
            <Link to="/cuenta/nueva">
              <Plus />
            </Link>
          </Button>
        }
      />

      <div className="space-y-2 p-4">
        {cuentas.isPending ? (
          <Skeleton className="h-32" />
        ) : cuentas.data?.length === 0 ? (
          <Card>
            <EmptyState icon={Wallet} title="Sin cuentas" />
          </Card>
        ) : (
          cuentas.data?.map((cuenta) => (
            <Link key={cuenta.id} to={`/cuenta/${cuenta.id}`} className="block">
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
          ))
        )}
      </div>
    </div>
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
          onBack={() => void navigate(-1)}
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
        colorHex: existente.colorHex,
        iconName: existente.iconName,
        includeInTotal: existente.includeInTotal,
        currentBalance: existente.currentBalance,
      }
    : {
        name: "",
        type: "CASH" as AccountType,
        balance: "0",
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
  const [colorHex, setColorHex] = useState<string>(inicial.colorHex);
  const [iconName, setIconName] = useState<IconName>(inicial.iconName);
  const [includeInTotal, setIncludeInTotal] = useState(inicial.includeInTotal);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

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

    try {
      await guardar.mutateAsync({
        id,
        name,
        type,
        balance: importe,
        colorHex,
        iconName,
        includeInTotal,
      });
      void navigate(-1);
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
        onBack={() => void navigate(-1)}
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
            editando
              ? "Escribe el saldo real de la cuenta y se cuadrará sola: las transacciones no se tocan."
              : "Con cuánto empieza la cuenta."
          }
        />

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
          borrar.mutate(id, { onSuccess: () => void navigate(-1) });
        }}
      />
    </div>
  );
}
