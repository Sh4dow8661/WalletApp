import { exports } from "cloudflare:workers";
import { expect } from "vitest";

import "../../src/worker/index.ts";

/**
 * Utilidades compartidas por los tests del API.
 *
 * Las peticiones van contra el Worker real (`exports.default.fetch`), así que
 * atraviesan el enrutado de Hono, el guard de sesión, la validación y D1 —
 * exactamente lo mismo que en producción.
 */

const ORIGEN = "https://walletapp.test";

/** Cliente con sesión: arrastra la cookie en cada petición. */
export interface Cliente {
  userId: string;
  email: string;
  cookie: string;
  get(ruta: string): Promise<Response>;
  post(ruta: string, body?: unknown): Promise<Response>;
  put(ruta: string, body?: unknown): Promise<Response>;
  del(ruta: string): Promise<Response>;
  /** POST con el cuerpo tal cual, sin serializar. Lo usa la importación. */
  postRaw(ruta: string, body: string, contentType: string): Promise<Response>;
  json<T>(respuesta: Response): Promise<T>;
}

let contador = 0;

/** Petición sin sesión. */
export function fetchSinSesion(ruta: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`${ORIGEN}${ruta}`, init));
}

/**
 * Registra un usuario nuevo y devuelve un cliente con su sesión.
 *
 * Al registrarse, el hook de Better Auth siembra las 3 cuentas y 14 categorías
 * por defecto (§11), así que el cliente que sale de aquí ya tiene datos.
 */
export async function crearUsuario(): Promise<Cliente> {
  const email = `usuario${++contador}-${Date.now()}@ejemplo.test`;
  const password = "contrasena-de-prueba-123";

  const respuesta = await fetchSinSesion("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: `Usuario ${contador}` }),
  });

  expect(respuesta.status, `el registro falló: ${await respuesta.clone().text()}`).toBe(
    200,
  );

  const cookie = extraerCookie(respuesta);
  expect(cookie, "el registro no devolvió cookie de sesión").toBeTruthy();

  const { user } = (await respuesta.json()) as { user: { id: string } };

  const pedir = (metodo: string) => async (ruta: string, body?: unknown) =>
    exports.default.fetch(
      new Request(`${ORIGEN}${ruta}`, {
        method: metodo,
        headers: {
          cookie,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );

  return {
    userId: user.id,
    email,
    cookie,
    get: (ruta) => pedir("GET")(ruta),
    post: pedir("POST"),
    put: pedir("PUT"),
    del: (ruta) => pedir("DELETE")(ruta),
    postRaw: (ruta, body, contentType) =>
      exports.default.fetch(
        new Request(`${ORIGEN}${ruta}`, {
          method: "POST",
          headers: { cookie, "content-type": contentType },
          body,
        }),
      ),
    json: async <T>(respuesta: Response) => (await respuesta.json()) as T,
  };
}

/** Junta las cookies de sesión de la respuesta en una cabecera `cookie`. */
function extraerCookie(respuesta: Response): string {
  return respuesta.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Lanza con el cuerpo de la respuesta si el estado no es el esperado. */
export async function esperarEstado(
  respuesta: Response,
  estado: number,
): Promise<Response> {
  if (respuesta.status !== estado) {
    throw new Error(
      `Se esperaba ${estado} pero llegó ${respuesta.status}: ${await respuesta.clone().text()}`,
    );
  }
  return respuesta;
}
