import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./db/schema.ts";
import { seedNewUser } from "./db/seed.ts";

/**
 * Better Auth con email + contraseña y las sesiones en D1.
 *
 * Se construye **por petición**, no a nivel de módulo: en Workers los bindings
 * (env.DB) solo existen dentro del handler. Instanciarlo arriba haría que el
 * Worker fallara al arrancar.
 */
export function createAuth(env: Env, request?: Request) {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),

    secret: env.BETTER_AUTH_SECRET,
    // El origen sale de la petición en vez de estar fijo: el Worker sirve la app
    // y la API juntas, así que vale igual en localhost:5173 que en producción,
    // sin tener que declarar la URL en ningún sitio.
    ...(request ? { baseURL: new URL(request.url).origin } : {}),
    basePath: "/api/auth",

    emailAndPassword: {
      enabled: true,
      // §11: poder cerrar el registro público una vez creada mi cuenta.
      disableSignUp: env.ALLOW_SIGNUP === "false",
      minPasswordLength: 8,
      // El correo de verificación necesitaría un proveedor de email que todavía
      // no existe; sin esto, nadie podría entrar tras registrarse.
      requireEmailVerification: false,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 días
      updateAge: 60 * 60 * 24, // refresca la sesión como mucho una vez al día
    },

    // §11: rate limiting básico. Better Auth ya aprieta más los endpoints
    // sensibles; esto es el techo general.
    //
    // Se apaga únicamente en los tests de integración, que crean decenas de
    // usuarios en segundos y chocarían con el límite de registro. La condición
    // es la presencia de un binding que solo inyecta la configuración de
    // pruebas: en producción no existe, así que el límite no se puede quedar
    // apagado por accidente.
    rateLimit: {
      enabled: !("TEST_MIGRATIONS" in env),
      window: 60,
      // El techo general es alto a propósito. `/get-session` se consulta en cada
      // navegación, así que un límite bajo tumba la sesión de un usuario normal
      // que se mueve rápido por la app: el cliente recibe 429, cree que no hay
      // sesión y lo manda al login. Lo que sí interesa apretar son los endpoints
      // vulnerables a fuerza bruta, y esos tienen su propia regla.
      max: 200,
      customRules: {
        // Lectura pura y sin secretos: no tiene sentido limitarla.
        "/get-session": false,
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 300, max: 3 },
        "/forget-password": { window: 300, max: 3 },
      },
    },

    databaseHooks: {
      user: {
        create: {
          /**
           * §11: al registrarse se siembran las 3 cuentas y 14 categorías por
           * defecto, más la fila de ajustes.
           *
           * Va después de crear el usuario y en su propio batch. Si fallara, el
           * usuario existiría sin datos iniciales; `ensureSeeded` en el
           * middleware lo detecta en la siguiente petición y lo repara.
           */
          after: async (user) => {
            await seedNewUser(env.DB, user.id, Date.now());
          },
        },
      },
    },

    advanced: {
      // §11: HttpOnly + Secure + SameSite=Lax.
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      },
      database: {
        // Los IDs de las tablas de auth los genera Better Auth; las del dominio
        // usan uuidv7 (src/lib/id.ts).
        generateId: () => crypto.randomUUID(),
      },
    },

    // Google OAuth queda preparado pero apagado (§11). Para activarlo basta con
    // poner los secretos y descomentar:
    // socialProviders: {
    //   google: {
    //     clientId: env.GOOGLE_CLIENT_ID,
    //     clientSecret: env.GOOGLE_CLIENT_SECRET,
    //   },
    // },
  });
}

export type Auth = ReturnType<typeof createAuth>;
