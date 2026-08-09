/**
 * Marca local de "aquí había una sesión".
 *
 * Sirve para un caso concreto: al abrir la app **sin red**, `useSession` no
 * puede preguntarle al servidor y devuelve "no hay sesión", con lo que el guard
 * mandaría al login. Eso deja la app inservible offline, justo lo contrario de
 * lo que pide §9.
 *
 * Con esta marca, el guard distingue "el servidor dice que no estás
 * autenticado" de "no he podido preguntar", y en el segundo caso enseña la app
 * con los datos guardados.
 *
 * **No es una credencial ni una decisión de seguridad.** La sesión real sigue
 * siendo la cookie HttpOnly, y el servidor valida cada petición: con la marca
 * puesta a mano, lo único que se consigue es ver un cascarón vacío cuyas
 * peticiones devuelven 401 en cuanto haya red.
 */

const CLAVE = "walletapp:habia-sesion";

export function recordarSesion(): void {
  try {
    localStorage.setItem(CLAVE, "1");
  } catch {
    // Modo privado: sin marca, offline mandará al login. Es degradación
    // aceptable frente a romper la app.
  }
}

export function olvidarSesion(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que hacer.
  }
}

export function habiaSesion(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}
