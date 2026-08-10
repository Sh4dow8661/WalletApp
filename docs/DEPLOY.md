# Despliegue

La app entera —SPA y API— es **un solo Worker** de Cloudflare con una base D1
detrás. No hay servidor que mantener ni contenedor que construir.

Todo lo que se usa entra en el plan gratuito de Cloudflare.

---

## Lo que ya está montado

|                   |                                                        |
| ----------------- | ------------------------------------------------------ |
| **URL**           | https://walletapp.imanolhidalgo08.workers.dev          |
| **Worker**        | `walletapp`                                            |
| **Base de datos** | D1 `walletapp-db`                                      |
| **Secreto**       | `BETTER_AUTH_SECRET`, puesto con `wrangler secret put` |

El `database_id` de D1 sí vive en `wrangler.jsonc`: no es un secreto. Lo que
**nunca** va ahí son los secretos ni el identificador de la cuenta.

---

## Desplegar

```bash
pnpm deploy
```

Eso compila (`tsc -b && vite build`) y sube. El despliegue es **atómico**: la
versión nueva entra de golpe, sin dejar a nadie a medias.

Antes de desplegar conviene pasar las mismas comprobaciones que la CI:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

### El despliegue es a mano, a propósito

La CI de GitHub **verifica pero no despliega**. Automatizarlo obligaría a
guardar en los secretos del repositorio un token de API de Cloudflare con
permiso de escritura sobre Workers y D1, y esa es una decisión del dueño de la
cuenta. Si algún día se quiere, hace falta:

1. Crear el token en el panel de Cloudflare (plantilla «Edit Cloudflare
   Workers», acotado a esta cuenta).
2. Guardarlo como secreto `CLOUDFLARE_API_TOKEN` del repositorio.
3. Añadir un job con `cloudflare/wrangler-action`.

Mientras tanto, `pnpm deploy` desde el PC no necesita ningún token en disco: la
sesión de `wrangler login` es OAuth y vive en el perfil del usuario.

---

## Migraciones de la base

Las migraciones están en `migrations/` y se aplican por separado del despliegue,
que es lo correcto: el esquema y el código cambian a ritmos distintos.

```bash
pnpm db:migrate:local     # la D1 de desarrollo (Miniflare)
pnpm db:migrate:remote    # producción
```

Para ver qué falta por aplicar:

```bash
pnpm exec wrangler d1 migrations list walletapp-db --remote
```

> Ojo con el orden: si una migración quita o renombra una columna, hay que
> desplegar **primero** el código que ya no la usa. Al revés, la versión antigua
> seguiría consultando algo que ya no existe durante los segundos que tarde el
> despliegue.

`pnpm db:generate` genera una migración nueva a partir de los cambios en
`src/worker/db/schema.ts`. Revísala antes de aplicarla: Drizzle acierta casi
siempre, pero un renombrado lo interpreta como borrar y crear.

---

## Secretos y variables

**Secretos** (cifrados, invisibles después de ponerlos):

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

Para generar uno:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> Rotar `BETTER_AUTH_SECRET` **cierra todas las sesiones abiertas**, en todos los
> dispositivos. No es grave —basta con volver a entrar— pero conviene saberlo.

**Variables** (en claro, en `wrangler.jsonc`):

- `ALLOW_SIGNUP` — `"false"` cierra el registro. Ver más abajo.

En local, ambas cosas van en `.dev.vars`, que no se versiona. Hay una plantilla
en `.dev.vars.example`.

---

## El registro está cerrado

`ALLOW_SIGNUP` está en `"false"`: el registro devuelve
`400 EMAIL_PASSWORD_SIGN_UP_DISABLED` y solo se entra con las cuentas que ya
existen. La URL del Worker es pública, así que dejarlo abierto solo servía para
que cualquiera que diese con ella pudiera crearse una cuenta.

Para dar de alta a alguien más: poner `"true"` en `wrangler.jsonc`,
`pnpm deploy`, crear la cuenta, y volver a cerrarlo.

> **Comprueba que hay al menos una cuenta antes de cerrar.** Cerrar el registro
> sobre una base vacía deja la app inaccesible, sin forma de entrar desde fuera:
>
> ```bash
> pnpm exec wrangler d1 execute walletapp-db --remote --command "SELECT email FROM user"
> ```

---

## Instalar la app

Es una PWA: se instala desde el propio navegador, sin tiendas.

**Android (Chrome)** — abre la URL, menú ⋮ → «Instalar aplicación». Queda con su
icono en el lanzador y arranca a pantalla completa.

**Escritorio (Chrome o Edge)** — el icono de instalar aparece a la derecha de la
barra de direcciones. También desde menú ⋮ → «Instalar WalletApp».

**iOS (Safari)** — Compartir → «Añadir a pantalla de inicio». iOS no ofrece el
diálogo de instalación de Chrome, pero el resultado es equivalente.

Una vez instalada se actualiza sola: cuando hay versión nueva, la app avisa con
un aviso para recargar en vez de recargarse sola a mitad de un formulario.

---

## Ver qué está pasando

```bash
pnpm exec wrangler tail                       # registro en vivo
pnpm exec wrangler deployments list           # historial de versiones
pnpm exec wrangler d1 info walletapp-db       # tamaño y uso de la base
```

La observabilidad está activada en `wrangler.jsonc`, así que el panel de
Cloudflare guarda además peticiones, errores y tiempos.

### Volver atrás

```bash
pnpm exec wrangler rollback [id-de-version]
```

El rollback solo afecta al **código**. Si la versión mala aplicó una migración,
la base sigue migrada: eso hay que deshacerlo aparte y a mano.

---

## Copias de seguridad de los datos

D1 tiene _Time Travel_: reconstruye la base en cualquier punto de los últimos 30
días.

```bash
pnpm exec wrangler d1 time-travel info walletapp-db
pnpm exec wrangler d1 time-travel restore walletapp-db --timestamp <ISO-8601>
```

Al margen de eso, **Ajustes → Datos → Copia de seguridad** descarga un `.json`
con absolutamente todo, que se puede volver a importar desde la misma pantalla.
Esa es la copia que no depende de Cloudflare (ver [MIGRATION.md](MIGRATION.md)).
