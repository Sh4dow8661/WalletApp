import { useEffect, useState } from "react";

/**
 * Atajos de teclado del escritorio (§10).
 *
 * Solo se activan cuando el foco no está en un campo de texto: si no, escribir
 * "n" en una nota dispararía "nueva transacción". Tampoco se activan con Ctrl,
 * Alt o Meta pulsados, para no pisar los atajos del navegador.
 */

export interface Shortcut {
  /** Tecla en minúsculas, o "?" / "escape" / "arrowleft" / "arrowright". */
  key: string;
  /** Secuencia tipo "g d": primero `g`, luego la tecla. */
  chord?: string;
  description: string;
  action: () => void;
}

/** ¿El foco está en algo donde el usuario está escribiendo? */
function escribiendo(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const etiqueta = target.tagName;
  return (
    etiqueta === "INPUT" ||
    etiqueta === "TEXTAREA" ||
    etiqueta === "SELECT" ||
    target.isContentEditable
  );
}

export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  // Tecla "líder" pendiente, para las secuencias tipo `g` + `d`.
  const [lider, setLider] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const alPulsar = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();

      // Escape sí funciona dentro de un campo: es como se sale de él.
      if (key !== "escape" && escribiendo(event.target)) return;

      if (lider) {
        const combinado = shortcuts.find((s) => s.chord === `${lider} ${key}`);
        setLider(null);
        if (combinado) {
          event.preventDefault();
          combinado.action();
        }
        return;
      }

      // ¿Es el principio de una secuencia?
      if (shortcuts.some((s) => s.chord?.startsWith(`${key} `))) {
        event.preventDefault();
        setLider(key);
        return;
      }

      const directo = shortcuts.find((s) => !s.chord && s.key === key);
      if (directo) {
        event.preventDefault();
        directo.action();
      }
    };

    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [shortcuts, enabled, lider]);

  // Si se pulsa `g` y no se completa, no debe quedarse esperando para siempre.
  useEffect(() => {
    if (!lider) return;
    const temporizador = setTimeout(() => setLider(null), 2000);
    return () => clearTimeout(temporizador);
  }, [lider]);

  return { esperandoSecuencia: lider !== null };
}
