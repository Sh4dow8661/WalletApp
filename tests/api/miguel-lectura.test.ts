import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import { crearUsuario, fetchSinSesion } from "./helpers.ts";

/**
 * Puerta de sólo lectura para Miguel, el mayordomo de la VM.
 *
 * No es una sesión: es un token fijo en los secretos del Worker que abre
 * únicamente peticiones GET, y siempre sobre los datos de MIGUEL_USER_ID. Lo
 * que se comprueba aquí es que no se pueda usar para nada más.
 */

const TOKEN = "token-de-pruebas-de-miguel-0123456789";

const pedir = (ruta: string, token: string, metodo = "GET") =>
  fetchSinSesion(ruta, { method: metodo, headers: { Authorization: `Bearer ${token}` } });

describe("acceso de sólo lectura de Miguel", () => {
  afterEach(() => {
    delete env.MIGUEL_TOKEN;
    delete env.MIGUEL_USER_ID;
  });

  it("sin los secretos configurados, la puerta no existe", async () => {
    const ima = await crearUsuario();
    env.MIGUEL_USER_ID = ima.userId; // sólo uno de los dos
    expect((await pedir("/api/accounts", TOKEN)).status).toBe(401);
  });

  it("con MIGUEL_TOKEN pero sin dueño, tampoco", async () => {
    env.MIGUEL_TOKEN = TOKEN;
    expect((await pedir("/api/accounts", TOKEN)).status).toBe(401);
  });

  it("ve exactamente lo mismo que el dueño con su sesión", async () => {
    const ima = await crearUsuario();
    env.MIGUEL_TOKEN = TOKEN;
    env.MIGUEL_USER_ID = ima.userId;

    const conSesion = await ima.get("/api/accounts");
    const conTokenResp = await pedir("/api/accounts", TOKEN);
    expect(conTokenResp.status).toBe(200);
    expect(await conTokenResp.json()).toEqual(await conSesion.json());
  });

  it("alcanza las transacciones y la exportación completa", async () => {
    const ima = await crearUsuario();
    env.MIGUEL_TOKEN = TOKEN;
    env.MIGUEL_USER_ID = ima.userId;

    for (const ruta of ["/api/transactions", "/api/categories", "/api/data/json"]) {
      expect((await pedir(ruta, TOKEN)).status, ruta).toBe(200);
    }
  });

  it("ve los datos del dueño, no los de otro usuario", async () => {
    const ima = await crearUsuario();
    const otro = await crearUsuario();
    env.MIGUEL_TOKEN = TOKEN;

    env.MIGUEL_USER_ID = ima.userId;
    const comoIma = await (await pedir("/api/accounts", TOKEN)).text();
    env.MIGUEL_USER_ID = otro.userId;
    const comoOtro = await (await pedir("/api/accounts", TOKEN)).text();

    // Las cuentas sembradas se llaman igual, pero los id son por usuario: si
    // salieran idénticas, el userId no vendría de la configuración.
    expect(comoIma).not.toEqual(comoOtro);
    expect(comoIma).toEqual(
      await (await ima.get("/api/accounts")).text(),
    );
  });

  it("un token equivocado no entra", async () => {
    const ima = await crearUsuario();
    env.MIGUEL_TOKEN = TOKEN;
    env.MIGUEL_USER_ID = ima.userId;
    expect((await pedir("/api/accounts", "otro-token")).status).toBe(401);
  });

  it("un token del mismo largo pero distinto tampoco", async () => {
    const ima = await crearUsuario();
    env.MIGUEL_TOKEN = TOKEN;
    env.MIGUEL_USER_ID = ima.userId;
    const casi = TOKEN.slice(0, -1) + "X";
    expect(casi.length).toBe(TOKEN.length);
    expect((await pedir("/api/accounts", casi)).status).toBe(401);
  });

  it("sin cabecera Authorization no entra", async () => {
    const ima = await crearUsuario();
    env.MIGUEL_TOKEN = TOKEN;
    env.MIGUEL_USER_ID = ima.userId;
    expect((await fetchSinSesion("/api/accounts")).status).toBe(401);
  });

  it("es de sólo lectura: nada que no sea GET pasa", async () => {
    const ima = await crearUsuario();
    env.MIGUEL_TOKEN = TOKEN;
    env.MIGUEL_USER_ID = ima.userId;

    for (const metodo of ["POST", "PUT", "DELETE", "PATCH"]) {
      const r = await pedir("/api/accounts", TOKEN, metodo);
      expect(r.status, `${metodo} debería quedar fuera`).toBe(401);
    }
  });

  it("tampoco puede importar, que es la escritura más golosa", async () => {
    const ima = await crearUsuario();
    env.MIGUEL_TOKEN = TOKEN;
    env.MIGUEL_USER_ID = ima.userId;
    expect((await pedir("/api/data/json", TOKEN, "POST")).status).toBe(401);
  });

  it("no crea nada si MIGUEL_USER_ID no existe: no siembra por error", async () => {
    env.MIGUEL_TOKEN = TOKEN;
    env.MIGUEL_USER_ID = "usuario-que-no-existe";

    // Responde, pero sin inventar al usuario: la clave es que no se siembre.
    await pedir("/api/accounts", TOKEN);
    const fila = await env.DB.prepare(
      `SELECT user_id FROM user_settings WHERE user_id = ?`,
    )
      .bind("usuario-que-no-existe")
      .first();
    expect(fila, "un GET no puede crear filas de ajustes").toBeNull();
  });
});
