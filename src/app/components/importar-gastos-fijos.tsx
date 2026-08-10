import { AlertTriangle, ClipboardPaste } from "lucide-react";
import { useMemo, useState } from "react";

import { dateInputToMillis, millisToDateInput } from "@/lib/dates.ts";
import { monthlyEquivalent } from "@/lib/gastos-fijos.ts";
import {
  type ParsedFixedExpenseRow,
  claveDeNombre,
  parsePastedFixedExpenses,
} from "@/lib/importar-gastos-fijos.ts";
import { formatMoney } from "@/lib/money.ts";
import type { Account, FixedExpense } from "@/shared/types.ts";

import { useImportFixedExpenses } from "../hooks/api.ts";
import { ApiRequestError } from "../lib/api.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { SelectField, TextAreaField, TextField } from "./ui/field.tsx";
import { ResponsiveDialog } from "./ui/responsive-dialog.tsx";

/**
 * Importación de gastos fijos pegando la tabla del Excel.
 *
 * El flujo es pegar → ver lo que va a pasar → confirmar. La vista previa no es
 * un adorno: dice de cada fila si va a **crear** o **actualizar** un gasto, y
 * ese es justo el dato que hace falta para confiar en volver a pegar la hoja
 * entera sin miedo a duplicarla.
 *
 * El texto se lee en el navegador (`parsePastedFixedExpenses`) solo para poder
 * enseñar esa vista previa. El servidor lo revalida todo.
 */
export function ImportarGastosFijosDialog({
  open,
  onOpenChange,
  gastos,
  cuentas,
  currency,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Los que ya hay, para saber cuáles se van a actualizar. */
  gastos: FixedExpense[];
  cuentas: Account[];
  currency: string;
  timeZone: string;
}) {
  const importar = useImportFixedExpenses();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  // El Excel no trae ni la fecha del próximo pago ni la cuenta, así que se
  // piden una vez y valen para todas las filas nuevas. Las que ya existan no
  // se tocan: ver la nota del endpoint.
  const [hoy] = useState(() => Date.now());
  const [fecha, setFecha] = useState(() => millisToDateInput(hoy, timeZone));
  const [cuentaId, setCuentaId] = useState("");

  const { rows, issues } = useMemo(() => parsePastedFixedExpenses(texto), [texto]);

  const existentes = useMemo(
    () => new Set(gastos.map((g) => claveDeNombre(g.name))),
    [gastos],
  );

  const totalMensual = rows.reduce(
    (suma, fila) =>
      suma +
      monthlyEquivalent({
        amount: fila.amount,
        everyMonths: fila.everyMonths,
        nextDueDate: 0,
        isActive: true,
      }),
    0,
  );

  const nuevos = rows.filter((f) => !existentes.has(claveDeNombre(f.name))).length;
  const actualizados = rows.length - nuevos;

  function cerrar(abierto: boolean) {
    onOpenChange(abierto);
    if (!abierto) {
      setTexto("");
      setError(null);
      setResultado(null);
    }
  }

  async function confirmar() {
    setError(null);
    try {
      const salida = await importar.mutateAsync({
        items: rows.map((fila) => ({
          name: fila.name,
          amount: fila.amount,
          everyMonths: fila.everyMonths,
          categoryName: fila.categoryName,
        })),
        defaultNextDueDate: dateInputToMillis(fecha, timeZone),
        defaultAccountId: cuentaId || null,
      });

      const partes = [
        salida.created === 1 ? "1 gasto creado" : `${salida.created} gastos creados`,
        salida.updated === 1 ? "1 actualizado" : `${salida.updated} actualizados`,
      ];
      if (salida.createdCategories.length > 0) {
        partes.push(`categorías nuevas: ${salida.createdCategories.join(", ")}`);
      }
      setResultado(`${partes.join(" · ")}.`);
      setTexto("");
    } catch (e) {
      setError(
        e instanceof ApiRequestError
          ? (Object.values(e.fields)[0] ?? e.message)
          : "No se pudo importar",
      );
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={cerrar}
      title="Importar desde el Excel"
      description="Pega las filas tal cual salen de la hoja. Se actualizan los que ya tengas y se crean los que falten."
      footer={
        <div className="flex gap-3">
          {/* «Listo» y no «Cerrar»: la X del diálogo ya se llama Cerrar, y dos
              botones con el mismo nombre accesible dejan el diálogo ambiguo
              para quien navega por lector de pantalla. */}
          <Button variant="outline" className="flex-1" onClick={() => cerrar(false)}>
            {resultado ? "Listo" : "Cancelar"}
          </Button>
          <Button
            className="flex-1"
            onClick={() => void confirmar()}
            disabled={rows.length === 0 || importar.isPending}
          >
            {importar.isPending ? "Importando…" : `Importar ${rows.length}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {resultado && (
          <p
            role="status"
            data-testid="importacion-resultado"
            className="rounded-xl bg-primary-light px-3 py-2 text-sm text-primary-dark dark:bg-primary/20 dark:text-primary-light"
          >
            {resultado}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense"
          >
            {error}
          </p>
        )}

        <TextAreaField
          label="Filas pegadas"
          rows={6}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={
            "Claude Max\tTecnología\t$112.00\t1\nMarbete\tTransporte\t$200.00\t12"
          }
          hint="Orden de las columnas: gasto, categoría, precio por cargo y cada cuántos meses."
          className="font-mono text-xs"
        />

        {issues.length > 0 && (
          <Card className="space-y-1 bg-warning/10">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              {issues.length === 1
                ? "1 fila no se pudo leer"
                : `${issues.length} filas no se pudieron leer`}
            </p>
            <ul className="space-y-0.5">
              {issues.map((problema) => (
                <li
                  key={`${problema.line}-${problema.message}`}
                  className="text-xs opacity-70"
                >
                  Línea {problema.line}: {problema.message}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {rows.length > 0 && (
          <>
            {/* Lo que hace falta y el Excel no tiene. Solo afecta a los nuevos. */}
            <TextField
              label="Próximo pago de los gastos nuevos"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              hint="El Excel no lo trae. Lo puedes afinar después en cada gasto."
            />

            <SelectField
              label="Sale de (gastos nuevos)"
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              hint="Opcional. Hace falta para poder marcarlos como pagados."
            >
              <option value="">Sin asignar</option>
              {cuentas.map((cuenta) => (
                <option key={cuenta.id} value={cuenta.id}>
                  {cuenta.name}
                </option>
              ))}
            </SelectField>

            <VistaPrevia
              rows={rows}
              existentes={existentes}
              currency={currency}
              totalMensual={totalMensual}
              nuevos={nuevos}
              actualizados={actualizados}
            />
          </>
        )}

        {texto.trim() === "" && (
          <p className="flex items-start gap-2 text-xs opacity-60">
            <ClipboardPaste className="mt-0.5 size-4 shrink-0" aria-hidden />
            Se admiten filas separadas por tabulador (lo que copia Excel), por barras
            verticales o por punto y coma. La cabecera se ignora sola.
          </p>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/** Tabla de lo que va a pasar, fila a fila. */
function VistaPrevia({
  rows,
  existentes,
  currency,
  totalMensual,
  nuevos,
  actualizados,
}: {
  rows: ParsedFixedExpenseRow[];
  existentes: Set<string>;
  currency: string;
  totalMensual: number;
  nuevos: number;
  actualizados: number;
}) {
  return (
    <div className="space-y-2" data-testid="importacion-vista-previa">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {rows.length === 1 ? "1 fila leída" : `${rows.length} filas leídas`}
        </p>
        <p className="text-xs opacity-60">
          {nuevos} {nuevos === 1 ? "nueva" : "nuevas"} · {actualizados}{" "}
          {actualizados === 1 ? "actualizada" : "actualizadas"}
        </p>
      </div>

      {/* La tabla es ancha; que scrollee ella y no la página. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/8 text-left opacity-60 dark:border-white/10">
              <th className="py-1 pr-2 font-medium">Gasto</th>
              <th className="py-1 pr-2 font-medium">Categoría</th>
              <th className="py-1 pr-2 text-right font-medium">Recibo</th>
              <th className="py-1 pr-2 text-right font-medium">Cada</th>
              <th className="py-1 text-right font-medium">Al mes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((fila) => {
              const yaEsta = existentes.has(claveDeNombre(fila.name));
              return (
                <tr
                  key={claveDeNombre(fila.name)}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="py-1 pr-2">
                    {fila.name}
                    {/* En texto y no solo por color: sin esto, quien no
                        distinga bien los colores no sabría qué se va a pisar. */}
                    <span className="ml-1 opacity-50">
                      {yaEsta ? "· actualiza" : "· nuevo"}
                    </span>
                  </td>
                  <td className="py-1 pr-2 opacity-70">{fila.categoryName || "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatMoney(fila.amount, currency)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums opacity-70">
                    {fila.everyMonths === 1 ? "mes" : `${fila.everyMonths} m`}
                  </td>
                  <td className="py-1 text-right font-medium tabular-nums">
                    {formatMoney(fila.amount / fila.everyMonths, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/10 font-semibold dark:border-white/15">
              <td className="py-1.5" colSpan={4}>
                Equivalente mensual
              </td>
              <td
                className="py-1.5 text-right tabular-nums"
                data-testid="importacion-total"
              >
                {formatMoney(totalMensual, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
