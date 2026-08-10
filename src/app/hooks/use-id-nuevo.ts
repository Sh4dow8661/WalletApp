import { useState } from "react";

import { uuidv7 } from "@/lib/id.ts";

/**
 * Identificador para un registro nuevo, estable durante toda la vida del
 * formulario.
 *
 * Es lo que hace **idempotentes** las escrituras de la cola offline (§9): si una
 * creación se queda pendiente y se reenvía —o el usuario le da a guardar dos
 * veces— llega siempre con el mismo id, así que no se crea un duplicado. Por eso
 * se genera una sola vez al montar y no en cada envío.
 */
export function useIdNuevo(): string {
  const [id] = useState(() => uuidv7());
  return id;
}
