import { ChevronDown } from "lucide-react";
import { type ComponentProps, useId } from "react";

import { cn } from "../../lib/cn.ts";

/**
 * Campos de formulario.
 *
 * Todos usan controles nativos (`input`, `select`, `textarea`) a propósito: en
 * móvil abren el teclado y los selectores del sistema, que se manejan mucho
 * mejor que cualquier réplica en JavaScript. El `id` se genera con `useId` para
 * que la etiqueta quede siempre asociada.
 */

const estiloControl = cn(
  "w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm",
  "dark:border-white/20 dark:bg-white/5",
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
  "disabled:opacity-50",
  // 44 px de alto mínimo: objetivo táctil de §10.
  "min-h-11",
);

interface FieldProps {
  label: string;
  /** Mensaje de error del servidor o de la validación local. */
  error?: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
}

/** Envoltorio con etiqueta, error y descripción, accesible. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const descripcionId = `${id}-desc`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {(error ?? hint) && (
        <p
          id={descripcionId}
          className={cn("text-xs", error ? "text-expense" : "opacity-60")}
          role={error ? "alert" : undefined}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string; hint?: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id) => (
        <input
          id={id}
          className={cn(estiloControl, error && "border-expense", className)}
          aria-invalid={error ? true : undefined}
          {...props}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  ...props
}: ComponentProps<"textarea"> & { label: string; error?: string; hint?: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id) => (
        <textarea
          id={id}
          rows={2}
          className={cn(estiloControl, "resize-y", error && "border-expense", className)}
          {...props}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; error?: string; hint?: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id) => (
        // `appearance-none` quita la flecha nativa, así que la ponemos nosotros:
        // sin ella el campo no se distinguía de un input de texto.
        <div className="relative">
          <select
            id={id}
            className={cn(
              estiloControl,
              "appearance-none pr-10",
              // El fondo tiene que ser OPACO: en tema oscuro el desplegable que
              // pinta el sistema hereda este color, y con alfa las opciones se
              // volvían ilegibles. El valor es `bg-white/5` ya compuesto sobre
              // --color-surface-dark, para que iguale al resto de campos.
              "dark:bg-[#1e1e1e]",
              error && "border-expense",
              className,
            )}
            aria-invalid={error ? true : undefined}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-60"
          />
        </div>
      )}
    </Field>
  );
}

/** Interruptor de encendido/apagado con etiqueta clicable. */
export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    // `pr-0.5` da aire al switch respecto al borde del panel: sin él queda
    // pegado a la barra de scroll cuando el formulario tiene que desplazarse.
    <div className="flex items-center justify-between gap-4 pr-0.5">
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs opacity-60">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          checked ? "bg-primary" : "bg-black/20 dark:bg-white/25",
        )}
      >
        {/*
          Geometría explícita, y no la que salga de la posición estática:
          pista 44×24, bola 20×20 anclada con `left-0.5 top-0.5` (2 px). Al
          encender se desplaza 20 px, así que queda a 2 px del borde derecho —
          el mismo aire que tiene a la izquierda cuando está apagado, y el mismo
          que arriba y abajo.

          Antes se usaba `translate-x-5.5` sin `left`, y la bola acababa fuera
          de la pista: medido, sobresalía 20 px por la derecha en encendido.
        */}
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm",
            "transition-transform duration-200 ease-out",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

/** Selector de color de la paleta de categorías. */
export function ColorPicker({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`Color ${color}`}
            aria-pressed={value === color}
            className={cn(
              "size-11 rounded-full transition-transform",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              value === color && "ring-2 ring-primary ring-offset-2",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </fieldset>
  );
}
