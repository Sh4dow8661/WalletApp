import type { ApiError } from "@/shared/types.ts";

/**
 * Cliente HTTP del API.
 *
 * El Worker sirve la app y la API en el mismo origen, así que las rutas son
 * relativas y la cookie de sesión viaja sola. No hay tokens que guardar en
 * `localStorage`: la sesión es una cookie HttpOnly que el JavaScript ni ve.
 */

/** Error del API con el detalle por campo, para poder marcar el formulario. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.fields = fields;
  }

  /** La sesión caducó o no hay: el guard debe mandar al login. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    // Un error del servidor puede no ser JSON (un 502 del borde, por ejemplo).
    let cuerpo: ApiError | null;
    try {
      cuerpo = (await response.json()) as ApiError;
    } catch {
      cuerpo = null;
    }
    throw new ApiRequestError(
      response.status,
      cuerpo?.error ?? `Error ${response.status}`,
      cuerpo?.fields ?? {},
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Construye una query string omitiendo los parámetros vacíos. */
export function queryString(
  params: Record<string, string | number | undefined | null>,
): string {
  const partes = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return partes.length > 0 ? `?${partes.join("&")}` : "";
}
