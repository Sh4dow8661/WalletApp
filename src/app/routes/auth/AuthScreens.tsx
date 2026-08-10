import { Wallet } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { Button } from "../../components/ui/button.tsx";
import { TextField } from "../../components/ui/field.tsx";
import { signIn, signUp } from "../../lib/auth-client.ts";

/**
 * Pantallas de acceso: /login, /registro y /recuperar (§11).
 *
 * La sesión la crea el servidor y viaja en una cookie HttpOnly; aquí no se
 * guarda ningún token.
 */

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <div className="space-y-3 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-light dark:bg-primary/20">
          <Wallet className="size-7 text-primary" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm opacity-60">{subtitle}</p>
        </div>
      </div>
      {children}
      <p className="text-center text-sm opacity-70">{footer}</p>
    </main>
  );
}

/** Mensaje de error del formulario, en un sitio fijo para que no salte el layout. */
function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense">
      {message}
    </p>
  );
}

export function LoginScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // A dónde volver tras entrar: el guard guarda aquí el destino original.
  const destino = (location.state as { from?: string } | null)?.from ?? "/";

  async function alEnviar(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setEnviando(true);

    const { error: fallo } = await signIn.email({ email, password });

    setEnviando(false);
    if (fallo) {
      // Mensaje genérico a propósito: distinguir "no existe" de "contraseña
      // incorrecta" revelaría qué correos están registrados.
      setError("Correo o contraseña incorrectos");
      return;
    }
    void navigate(destino, { replace: true });
  }

  return (
    <AuthShell
      title="WalletApp"
      subtitle="Entra para ver tus finanzas"
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/registro" className="font-medium text-primary hover:underline">
            Crear una
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void alEnviar(e)} className="space-y-4">
        <ErrorBanner message={error} />
        <TextField
          label="Correo"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" full size="lg" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
        <Link
          to="/recuperar"
          className="block text-center text-sm opacity-70 hover:underline"
        >
          Olvidé mi contraseña
        </Link>
      </form>
    </AuthShell>
  );
}

export function RegistroScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // El servidor exige 8 caracteres; comprobarlo aquí evita un viaje inútil.
    if (password.length < 8) {
      setError("La contraseña necesita al menos 8 caracteres");
      return;
    }

    setEnviando(true);
    const { error: fallo } = await signUp.email({ email, password, name: name || email });
    setEnviando(false);

    if (fallo) {
      setError(
        fallo.status === 403
          ? "El registro está cerrado en esta instancia"
          : (fallo.message ?? "No se pudo crear la cuenta"),
      );
      return;
    }
    // Al registrarse, el servidor siembra cuentas y categorías (§11).
    void navigate("/", { replace: true });
  }

  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Empiezas con tus cuentas y categorías listas"
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void alEnviar(e)} className="space-y-4">
        <ErrorBanner message={error} />
        <TextField
          label="Nombre"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Correo"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          required
          hint="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" full size="lg" disabled={enviando}>
          {enviando ? "Creando…" : "Crear cuenta"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function RecuperarScreen() {
  return (
    <AuthShell
      title="Recuperar contraseña"
      subtitle="Todavía no está disponible"
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Volver a entrar
        </Link>
      }
    >
      {/*
        Recuperar la contraseña necesita enviar correo, y no hay proveedor de
        email configurado. Better Auth ya expone el endpoint; falta conectarlo.
        Mejor decirlo claro que enseñar un formulario que no hace nada.
      */}
      <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm">
        Enviar el enlace de recuperación necesita un servicio de correo, que aún no está
        configurado. Si pierdes el acceso, la contraseña se puede restablecer desde la
        base de datos.
      </p>
    </AuthShell>
  );
}
