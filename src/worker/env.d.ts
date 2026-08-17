/**
 * Secretos que `wrangler types` no puede conocer.
 *
 * `worker-configuration.d.ts` se regenera con `pnpm cf-typegen` y perdería
 * cualquier cosa añadida a mano, así que lo del proyecto vive aquí. Este archivo
 * no importa ni exporta nada a propósito: así es global y TypeScript lo fusiona
 * con el `interface Env` generado en vez de crear otro distinto.
 *
 * Los dos son opcionales porque un despliegue sin ellos tiene que seguir
 * funcionando: si falta cualquiera, la puerta de lectura de Miguel no existe.
 */
interface Env {
  /**
   * Token de sólo lectura para Miguel, el mayordomo de la VM. Se pone con
   * `wrangler secret put MIGUEL_TOKEN`.
   */
  MIGUEL_TOKEN?: string;
  /**
   * De quién son los datos que ve ese token. Va en configuración del servidor y
   * jamás en la petición: quien llama no elige a quién mira (§11).
   */
  MIGUEL_USER_ID?: string;
  /**
   * `"true"` deja que Miguel apunte gastos: **sólo** `POST /api/transactions`.
   * Sin esto, su token no escribe nada. Es para que Ima le mande la foto de un
   * recibo y él lo registre, sin darle nada más de escritura.
   */
  MIGUEL_PUEDE_APUNTAR?: string;
}
