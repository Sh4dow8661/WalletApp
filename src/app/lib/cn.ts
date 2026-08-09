import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Junta clases de Tailwind resolviendo los conflictos.
 *
 * `clsx` aplana condicionales y `twMerge` se queda con la última clase de cada
 * grupo: `cn("p-2", "p-4")` da `p-4` en vez de dejar las dos peleándose.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
