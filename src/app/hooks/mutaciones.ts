import type { QueryClient } from "@tanstack/react-query";

import type {
  AccountInput,
  BudgetInput,
  CategoryInput,
  TransactionInput,
  UserSettingsInput,
} from "@/shared/types.ts";

import { api } from "../lib/api.ts";

/**
 * Cola de escrituras offline (§9).
 *
 * En lugar de una cola propia se usa la de TanStack Query: con
 * `networkMode: "offlineFirst"` las mutaciones que no encuentran red quedan
 * **pausadas**, se persisten en IndexedDB junto con la caché y se reanudan al
 * volver la conexión, incluso si la app se cerró por medio.
 *
 * Para que una mutación sobreviva a una recarga, su función no puede vivir
 * dentro del componente: lo que se guarda son la clave y las variables, así que
 * la función tiene que estar registrada por clave aquí. De eso va este archivo.
 *
 * Las escrituras son **idempotentes**: el identificador lo genera el cliente
 * (UUID v7) y va en el cuerpo, así que reenviar una operación pendiente no crea
 * un duplicado.
 */

export const MUTACIONES = {
  guardarCuenta: ["cuentas", "guardar"] as const,
  borrarCuenta: ["cuentas", "borrar"] as const,
  guardarCategoria: ["categorias", "guardar"] as const,
  borrarCategoria: ["categorias", "borrar"] as const,
  guardarTransaccion: ["transacciones", "guardar"] as const,
  borrarTransaccion: ["transacciones", "borrar"] as const,
  guardarPresupuesto: ["presupuestos", "guardar"] as const,
  borrarPresupuesto: ["presupuestos", "borrar"] as const,
  guardarAjustes: ["ajustes", "guardar"] as const,
};

/**
 * `id` presente significa "editar ese registro". `nuevoId` es el identificador
 * que el cliente ha generado para un alta, y viaja en el cuerpo del POST: es lo
 * que hace que reenviar una creación pendiente no cree un duplicado.
 */
type ConId<T> = T & { id?: string; nuevoId?: string };

/**
 * Registra la función de cada mutación por su clave.
 *
 * Se llama una sola vez al crear el QueryClient, **antes** de restaurar la
 * caché: si una mutación pendiente se reanuda y su clave no está registrada,
 * TanStack Query no sabe qué ejecutar y la descarta en silencio.
 */
export function registrarMutaciones(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(MUTACIONES.guardarCuenta, {
    mutationFn: ({ id, nuevoId, ...input }: ConId<AccountInput>) =>
      id
        ? api.put<{ id: string }>(`/api/accounts/${id}`, input)
        : api.post<{ id: string }>("/api/accounts", { ...input, id: nuevoId }),
  });
  queryClient.setMutationDefaults(MUTACIONES.borrarCuenta, {
    mutationFn: (id: string) => api.del<{ id: string }>(`/api/accounts/${id}`),
  });

  queryClient.setMutationDefaults(MUTACIONES.guardarCategoria, {
    mutationFn: ({ id, nuevoId, ...input }: ConId<CategoryInput>) =>
      id
        ? api.put<{ id: string }>(`/api/categories/${id}`, input)
        : api.post<{ id: string }>("/api/categories", { ...input, id: nuevoId }),
  });
  queryClient.setMutationDefaults(MUTACIONES.borrarCategoria, {
    mutationFn: (id: string) => api.del<{ id: string }>(`/api/categories/${id}`),
  });

  queryClient.setMutationDefaults(MUTACIONES.guardarTransaccion, {
    mutationFn: ({ id, nuevoId, ...input }: ConId<TransactionInput>) =>
      id
        ? api.put<{ id: string }>(`/api/transactions/${id}`, input)
        : api.post<{ id: string }>("/api/transactions", { ...input, id: nuevoId }),
  });
  queryClient.setMutationDefaults(MUTACIONES.borrarTransaccion, {
    mutationFn: (id: string) => api.del<{ id: string }>(`/api/transactions/${id}`),
  });

  queryClient.setMutationDefaults(MUTACIONES.guardarPresupuesto, {
    mutationFn: ({ id, nuevoId, ...input }: ConId<BudgetInput>) =>
      id
        ? api.put<{ id: string }>(`/api/budgets/${id}`, input)
        : api.post<{ id: string }>("/api/budgets", { ...input, id: nuevoId }),
  });
  queryClient.setMutationDefaults(MUTACIONES.borrarPresupuesto, {
    mutationFn: (id: string) => api.del<{ id: string }>(`/api/budgets/${id}`),
  });

  queryClient.setMutationDefaults(MUTACIONES.guardarAjustes, {
    mutationFn: (input: UserSettingsInput) => api.put("/api/settings", input),
  });
}
