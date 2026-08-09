import { createAuthClient } from "better-auth/react";

/**
 * Cliente de Better Auth.
 *
 * La sesión vive en una cookie HttpOnly que el navegador manda sola; aquí no se
 * guarda ningún token. `useSession` consulta al servidor y cachea el resultado.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
});

export const { signIn, signUp, signOut, useSession } = authClient;
