import { AlertTriangle, Plus, Scale, Trash2, Wallet } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import {
  type AvailabilitySummary,
  availableBalance,
  hasActiveBuffer,
  isBelowBuffer,
  summarizeAvailability,
} from "@/lib/colchon.ts";
import {
  type AccountsSummary,
  cardUtilization,
  isCreditCard,
  summarizeAccounts,
} from "@/lib/credit.ts";
import { formatMoney, parseAmountInput } from "@/lib/money.ts";
import { type Patrimonio, summarizeNetWorth } from "@/lib/patrimonio.ts";
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
import { DisponibleReal } from "../components/patrimonio.tsx";
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
  const disponibilidad = summarizeAvailability(cuentas.data ?? []);
  const patrimonio = summarizeNetWorth(cuentas.data ?? []);

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
            <ResumenPatrimonio
              resumen={resumen}
              disponibilidad={disponibilidad}
              patrimonio={patrimonio}
              currency={currency}
            />

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
  disponibilidad,
  patrimonio,
  currency,
}: {
  resumen: AccountsSummary;
  disponibilidad: AvailabilitySummary;
  patrimonio: Patrimonio;
  currency: string;
}) {
  return (
    <Card className="space-y-3">
      {/*
        Flex con wrap y NO `grid-cols-3`.

        Con tres columnas iguales, la del neto se quedaba corta en cuanto el
        número crecía —"-USD 1,105.08" pide 129 px y la columna daba 111— y el
        importe salía recortado como "-USD 1,10…". Repartir a partes iguales un
        ancho que no llega solo sirve para cortar las tres por igual.

        Así cada cifra ocupa lo que necesita y, cuando las tres no caben, la
        última baja de línea. Se gana un renglón en el peor caso y no se pierde
        ni un dígito.
      */}
      <div className="flex flex-wrap gap-x-6 gap-y-3">
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

      {/* La misma cifra y el mismo desglose que la cabecera y el Dashboard. */}
      {(patrimonio.hasAnyBuffer || patrimonio.hasCardDebt) && (
        <div className="border-t border-black/8 pt-3 dark:border-white/10">
          <DisponibleReal patrimonio={patrimonio} currency={currency} compacto />
          {disponibilidad.accountsBelowBuffer > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-expense">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              {disponibilidad.accountsBelowBuffer === 1
                ? "Una cuenta está por debajo de su colchón."
                : `${disponibilidad.accountsBelowBuffer} cuentas están por debajo de su colchón.`}
            </p>
          )}
        </div>
      )}

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
    // `shrink-0`: la cifra manda su propio ancho. Si la dejásemos encoger,
    // volveríamos al recorte por otra vía.
    <div className="shrink-0">
      <p className="text-xs opacity-60">{label}</p>
      {/*
        El importe NO se recorta nunca. Con `truncate`, un neto negativo y
        grande salía como "-USD 1,10…" en el panel de escritorio (necesitaba
        129 px y tenía 111) y en móvil se cortaban Deuda y Neto: un número a
        medias es peor que ninguno, porque se lee como si fuera otra cifra.

        Se deja que parta en dos líneas por el espacio del símbolo. Ocupa un
        renglón más en el peor caso, que es un precio ridículo comparado con
        enseñar mal el dinero.
      */}
      <p
        className={cn(
          "font-semibold tabular-nums",
          destacada ? "text-base" : "text-sm",
          className,
        )}
      >
        {formatMoney(amount, currency)}
      </p>
    </div>
  );
}

/**
 * Fila de cuenta normal.
 *
 * Con colchón se enseñan LAS DOS cifras: el balance real y el disponible.
 * Enseñar solo el disponible escondería dinero que existe de verdad, y enseñar
 * solo el balance es justo lo que hace creer que hay más de lo que se puede
 * gastar. Sin colchón, ni una palabra de más.
 */
function FilaCuenta({ cuenta, currency }: { cuenta: Account; currency: string }) {
  const conColchon = hasActiveBuffer(cuenta);
  const disponible = availableBalance(cuenta);
  const bajoColchon = isBelowBuffer(cuenta);

  return (
    // `data-cuenta` da a los e2e un ancla estable para la fila entera, igual que
    // el `data-buscar` del layout de escritorio. Sin él habría que trepar por el
    // DOM desde el nombre, y un nombre que sea prefijo de otro ("Colchón" y "Sin
    // colchón") haría casar dos filas a la vez.
    <Card
      data-cuenta={cuenta.id}
      className="transition-colors hover:bg-black/2 dark:hover:bg-white/8"
    >
      <div className="flex items-center gap-3">
        <Link
          to={`/cuentas/${cuenta.id}`}
          // min-h-11 = 44 px, el objetivo táctil de §10: al dejar de envolver
          // toda la tarjeta, este enlace se quedaba por debajo en móvil.
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
        >
          <CategoryIcon iconName={cuenta.iconName} colorHex={cuenta.colorHex} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{cuenta.name}</p>
            <p className="text-xs opacity-60">
              {ETIQUETAS_TIPO[cuenta.type]}
              {!cuenta.includeInTotal && " · fuera del total"}
            </p>
          </div>
        </Link>

        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              cuenta.currentBalance < 0 && "text-expense",
            )}
          >
            {formatMoney(cuenta.currentBalance, currency)}
          </p>
          {conColchon && (
            <p
              className={cn(
                "text-xs tabular-nums",
                bajoColchon ? "text-expense" : "opacity-60",
              )}
            >
              {formatMoney(disponible, currency)} disponible
            </p>
          )}
        </div>
      </div>

      {bajoColchon && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-expense">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          Por debajo del colchón de {formatMoney(cuenta.bufferAmount, currency)}.
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/8 pt-2 dark:border-white/10">
        <span className="text-xs opacity-50">
          {cuenta.lastReconciledAt === null
            ? "Sin cuadrar todavía"
            : `Cuadrada el ${new Date(cuenta.lastReconciledAt).toLocaleDateString("es", { day: "numeric", month: "short" })}`}
        </span>
        {/* `sm` mide 36 px de alto y §10 exige 44 en móvil. */}
        <Button asChild size="sm" variant="ghost" className="min-h-11">
          <Link to={`/cuentas/${cuenta.id}/cuadrar`}>
            <Scale />
            Cuadrar
          </Link>
        </Button>
      </div>
    </Card>
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
          pistaSinLimite="toca para ponerlo"
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
        bufferAmount: existente.bufferAmount === 0 ? "" : String(existente.bufferAmount),
        bufferApplied: existente.bufferApplied,
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
        bufferAmount: "",
        bufferApplied: true,
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
  /** Vacío = sin colchón. */
  bufferAmount: string;
  bufferApplied: boolean;
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
  const [bufferAmount, setBufferAmount] = useState(inicial.bufferAmount);
  const [bufferApplied, setBufferApplied] = useState(inicial.bufferApplied);
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

    // El colchón tampoco existe en las tarjetas: ahí no hay saldo del que
    // apartar una parte, sino deuda.
    let colchon = 0;
    if (!esTarjeta && bufferAmount.trim() !== "") {
      const parseado = parseAmountInput(bufferAmount);
      if (parseado === null || parseado < 0) {
        setErrores({ bufferAmount: "El colchón no puede ser negativo" });
        return;
      }
      colchon = parseado;
    }

    try {
      await guardar.mutateAsync({
        id,
        nuevoId: idNuevo,
        name,
        type,
        balance: importe,
        creditLimit: limite,
        bufferAmount: colchon,
        bufferApplied,
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

        {/* El colchón no tiene sentido en una tarjeta. */}
        {!esTarjeta && (
          <>
            <TextField
              label="Colchón"
              inputMode="decimal"
              value={bufferAmount}
              onChange={(e) => setBufferAmount(e.target.value)}
              error={errores.bufferAmount}
              hint="Mínimo que no quieres tocar. El dinero sigue en la cuenta, pero deja de contar como disponible. Vacío = sin colchón."
            />

            {bufferAmount.trim() !== "" && bufferAmount.trim() !== "0" && (
              <SwitchField
                label="Descontar el colchón del disponible"
                description="Si lo apagas, el importe se guarda pero no se descuenta."
                checked={bufferApplied}
                onCheckedChange={setBufferApplied}
              />
            )}
          </>
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
