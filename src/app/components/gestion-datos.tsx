import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { useRef, useState } from "react";

import type { ResumenImportacion } from "@/lib/import-json.ts";

import { api, ApiRequestError } from "../lib/api.ts";
import { Button } from "./ui/button.tsx";
import { ResponsiveDialog } from "./ui/responsive-dialog.tsx";

/**
 * Exportar e importar datos (§12).
 *
 * El export JSON es la copia de seguridad completa y la vía de migración desde
 * la app Android; el CSV se mantiene por compatibilidad con lo que ya generaba
 * la app antigua, pero pierde bastante (ver src/lib/csv.ts).
 *
 * Importar **reemplaza** todo, así que hay confirmación explícita con el nombre
 * del archivo delante y, al terminar, un resumen de lo que entró y de lo que
 * hubo que suponer.
 */
export function GestionDatos() {
  const queryClient = useQueryClient();
  const inputArchivo = useRef<HTMLInputElement>(null);

  const [descargando, setDescargando] = useState<"json" | "csv" | null>(null);
  const [pendiente, setPendiente] = useState<{ nombre: string; contenido: string } | null>(
    null,
  );
  const [importando, setImportando] = useState(false);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function descargar(formato: "json" | "csv") {
    setDescargando(formato);
    setError(null);
    try {
      const respuesta = await fetch(`/api/data/${formato}`);
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      const blob = await respuesta.blob();
      // Enlace temporal: es lo que funciona igual en móvil y escritorio sin
      // pedir permisos ni depender de la API de acceso a archivos.
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `wallet_export_${Date.now()}.${formato}`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el archivo. Comprueba la conexión.");
    } finally {
      setDescargando(null);
    }
  }

  async function elegirArchivo(archivo: File) {
    setError(null);
    try {
      setPendiente({ nombre: archivo.name, contenido: await archivo.text() });
    } catch {
      setError("No se pudo leer el archivo.");
    }
  }

  async function importar() {
    if (!pendiente) return;

    const esJson = pendiente.nombre.toLowerCase().endsWith(".json");
    setImportando(true);
    setError(null);
    try {
      const { resumen: nuevo } = await api.postText<{ resumen: ResumenImportacion }>(
        esJson ? "/api/data/json" : "/api/data/csv",
        pendiente.contenido,
        esJson ? "application/json" : "text/csv",
      );
      setPendiente(null);
      setResumen(nuevo);
      // Todo cambió: no vale invalidar por claves, hay que tirar la caché entera.
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(
        e instanceof ApiRequestError ? e.message : "No se pudo importar el archivo.",
      );
    } finally {
      setImportando(false);
    }
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="secondary"
          full
          onClick={() => void descargar("json")}
          disabled={descargando !== null}
        >
          <Download className="size-4" />
          {descargando === "json" ? "Generando…" : "Copia de seguridad"}
        </Button>
        <Button
          variant="secondary"
          full
          onClick={() => void descargar("csv")}
          disabled={descargando !== null}
        >
          <Download className="size-4" />
          {descargando === "csv" ? "Generando…" : "Exportar CSV"}
        </Button>
      </div>

      <Button variant="outline" full onClick={() => inputArchivo.current?.click()}>
        <Upload className="size-4" />
        Importar datos
      </Button>

      {/*
        El input va oculto del todo, no en `sr-only`: quien dispara la selección
        es el botón de arriba, que ya es accesible por teclado. Dejarlo visible
        para lectores de pantalla añadiría un segundo punto de tabulación
        invisible de 1×1 px para la misma acción.
      */}
      <input
        ref={inputArchivo}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        hidden
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          // Se limpia el valor para que elegir el mismo archivo otra vez vuelva
          // a disparar el evento.
          e.target.value = "";
          if (archivo) void elegirArchivo(archivo);
        }}
      />

      <p className="text-xs opacity-60">
        La copia de seguridad (JSON) lo lleva todo: cuentas, categorías, movimientos,
        presupuestos y sus enlaces. Es también el archivo que genera «Exportar todo
        (JSON)» en la app Android. El CSV solo lleva los movimientos.
      </p>

      {error !== null && (
        <p role="alert" className="text-xs text-expense">
          {error}
        </p>
      )}

      <ResponsiveDialog
        open={pendiente !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPendiente(null);
        }}
        title="Importar y reemplazar"
        description={pendiente?.nombre}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPendiente(null)}
              className="h-11 flex-1 rounded-xl border border-black/15 text-sm font-medium dark:border-white/20"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void importar()}
              disabled={importando}
              className="h-11 flex-1 rounded-xl bg-expense text-sm font-medium text-white disabled:opacity-50"
            >
              {importando ? "Importando…" : "Reemplazar todo"}
            </button>
          </div>
        }
      >
        <div className="flex gap-3 rounded-xl bg-expense/10 p-3">
          <AlertTriangle className="size-5 shrink-0 text-expense" />
          <p className="text-sm">
            Se borrarán <strong>todas</strong> tus cuentas, categorías, movimientos y
            presupuestos actuales, y se pondrán los del archivo en su lugar. Esto no se
            puede deshacer.
          </p>
        </div>
        <p className="mt-3 text-xs opacity-60">
          Si tienes datos que quieras conservar, descarga antes una copia de seguridad.
        </p>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={resumen !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setResumen(null);
        }}
        title="Importación terminada"
        footer={
          <Button full onClick={() => setResumen(null)}>
            Entendido
          </Button>
        }
      >
        {resumen && <ResumenImportado resumen={resumen} />}
      </ResponsiveDialog>
    </>
  );
}

function ResumenImportado({ resumen }: { resumen: ResumenImportacion }) {
  const filas: [string, number][] = [
    ["Cuentas", resumen.cuentas],
    ["Categorías", resumen.categorias],
    ["Movimientos", resumen.transacciones],
    ["Presupuestos", resumen.presupuestos],
    ["Enlaces a presupuestos", resumen.enlaces],
    ["Transferencias completas", resumen.transferenciasEmparejadas],
  ];

  return (
    <div className="space-y-3">
      <dl className="divide-y divide-black/5 text-sm dark:divide-white/10">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex justify-between py-2">
            <dt className="opacity-70">{etiqueta}</dt>
            <dd className="font-medium tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>

      {resumen.avisos.length > 0 && (
        <ul className="space-y-2">
          {resumen.avisos.map((aviso) => (
            <li key={aviso} className="flex gap-2 text-xs opacity-70">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{aviso}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
