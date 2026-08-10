import { expect, test } from "@playwright/test";

/**
 * Comportamiento de PWA (§9).
 *
 * Estos tests corren contra el **build servido**, no contra `vite dev`: el
 * service worker está desactivado en desarrollo (si no, el HMR serviría
 * archivos cacheados y los cambios no se verían).
 *
 * Se lanzan con `pnpm test:e2e:pwa`, que levanta `pnpm preview` aparte.
 */

const BASE = "http://localhost:4173";

test.describe("PWA", () => {
  test("el manifest declara lo que pide §9", async ({ request }) => {
    const respuesta = await request.get(`${BASE}/manifest.webmanifest`);
    expect(respuesta.ok()).toBe(true);

    const manifest = (await respuesta.json()) as Record<string, unknown>;

    expect(manifest.name).toBe("WalletApp");
    expect(manifest.short_name).toBe("Wallet");
    expect(manifest.display).toBe("standalone");
    expect(manifest.display_override).toEqual(["window-controls-overlay", "standalone"]);
    expect(manifest.theme_color).toBe("#0E9F6E");
    expect(manifest.background_color).toBe("#FAFAFA");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.lang).toBe("es");
    expect(manifest.dir).toBe("ltr");
    expect(manifest.orientation).toBe("any");
  });

  test("hay iconos de 192, 512 y uno maskable", async ({ request }) => {
    const manifest = (await (
      await request.get(`${BASE}/manifest.webmanifest`)
    ).json()) as {
      icons: { src: string; sizes: string; purpose?: string }[];
    };

    const tamanos = manifest.icons.map((i) => i.sizes);
    expect(tamanos).toContain("192x192");
    expect(tamanos).toContain("512x512");
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);

    // Y existen de verdad, no solo declarados.
    for (const icono of manifest.icons) {
      const r = await request.get(`${BASE}${icono.src}`);
      expect(r.ok(), `${icono.src} no se sirve`).toBe(true);
    }
  });

  test("hay capturas narrow y wide, sin las que Chrome no ofrece instalar", async ({
    request,
  }) => {
    const manifest = (await (
      await request.get(`${BASE}/manifest.webmanifest`)
    ).json()) as {
      screenshots: { src: string; form_factor: string; sizes: string }[];
    };

    const factores = manifest.screenshots.map((s) => s.form_factor);
    expect(factores).toContain("narrow");
    expect(factores).toContain("wide");

    for (const captura of manifest.screenshots) {
      const r = await request.get(`${BASE}${captura.src}`);
      expect(r.ok(), `${captura.src} no se sirve`).toBe(true);
    }
  });

  test("los accesos directos apuntan a rutas que existen", async ({ request }) => {
    const manifest = (await (
      await request.get(`${BASE}/manifest.webmanifest`)
    ).json()) as {
      shortcuts: { name: string; url: string }[];
    };

    expect(manifest.shortcuts.map((s) => s.name)).toEqual([
      "Nueva transacción",
      "Presupuestos",
      "Estadísticas",
    ]);

    for (const atajo of manifest.shortcuts) {
      // La SPA responde 200 con el shell en cualquier ruta suya.
      const r = await request.get(`${BASE}${atajo.url}`);
      expect(r.ok(), `${atajo.url} no responde`).toBe(true);
    }
  });

  test("el service worker se registra y precachea el shell", async ({ page }) => {
    await page.goto(`${BASE}/login`);

    const estado = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const registro = await navigator.serviceWorker.getRegistration();
      return {
        activo: !!registro?.active,
        caches: await caches.keys(),
      };
    });

    expect(estado.activo).toBe(true);
    expect(estado.caches.some((c) => c.includes("precache"))).toBe(true);
  });

  test("la app abre sin red y avisa de que los datos son los guardados", async ({
    page,
    context,
  }) => {
    // 1. Con red: entrar y cargar datos, que es lo que llena la caché.
    await page.goto(`${BASE}/login`);
    const estado = await page.evaluate(async () => {
      const pedir = (ruta: string, cuerpo: unknown) =>
        fetch(ruta, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
      const cred = {
        email: "pwa@walletapp.test",
        password: "contrasena-pwa-1234",
        name: "PWA",
      };
      let r = await pedir("/api/auth/sign-up/email", cred);
      if (!r.ok) {
        r = await pedir("/api/auth/sign-in/email", {
          email: cred.email,
          password: cred.password,
        });
      }
      return r.status;
    });
    expect(estado).toBe(200);

    await page.goto(`${BASE}/`);
    // Acotado al contenido: "Balance total" también está en la cabecera fija.
    await expect(page.getByRole("main").getByText("Cuentas")).toBeVisible();
    await expect(page.getByText("Efectivo")).toBeVisible();
    await page.waitForLoadState("networkidle");
    // Que la caché termine de persistirse en IndexedDB.
    await page.waitForTimeout(1000);

    // 2. Sin red: la app tiene que seguir abriendo.
    await context.setOffline(true);
    await page.reload();
    // `setOffline` corta las peticiones pero no siempre actualiza
    // `navigator.onLine`; en un dispositivo real el navegador emite este evento
    // y es lo que escucha el `onlineManager` de TanStack Query.
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // 1. La app abre: el shell viene del precache y el guard no expulsa al
    //    login por no poder comprobar la sesión.
    await expect(page).toHaveURL(`${BASE}/`);
    await expect(page.getByRole("link", { name: "Transacciones" })).toBeVisible({
      timeout: 15_000,
    });

    // 2. Y se avisa de que lo que se ve puede estar desactualizado (§9).
    await expect(page.getByText("Sin conexión")).toBeVisible({ timeout: 15_000 });

    // 3. Los datos guardados en IndexedDB se muestran en modo lectura.
    await expect(page.getByText("Efectivo")).toBeVisible({ timeout: 15_000 });

    await context.setOffline(false);
  });

  test("una escritura sin red se encola y se envía al volver la conexión", async ({
    page,
    context,
  }) => {
    await page.goto(`${BASE}/login`);
    await page.evaluate(async () => {
      await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "pwa@walletapp.test",
          password: "contrasena-pwa-1234",
        }),
      });
    });

    await page.goto(`${BASE}/categorias`);
    await page.waitForLoadState("networkidle");

    const nombre = `Offline ${Date.now()}`;

    // Sin red: se navega DENTRO de la app (como haría el usuario) y se crea la
    // categoría. La mutación no falla: queda pausada esperando conexión.
    await context.setOffline(true);
    await page.getByRole("link", { name: "Nueva categoría" }).click();
    await page.getByLabel("Nombre").fill(nombre);
    await page.getByRole("button", { name: "Guardar" }).click();

    // La app avisa de que hay algo esperando.
    await expect(page.getByText(/se enviará|se enviarán/)).toBeVisible({
      timeout: 10_000,
    });

    // Al volver la red, la cola se vacía sola.
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect
      .poll(
        async () => {
          const categorias = await page.evaluate(async () => {
            const r = await fetch("/api/categories");
            return (await r.json()) as { name: string }[];
          });
          return categorias.some((c) => c.name === nombre);
        },
        {
          timeout: 20_000,
          message: "la categoría creada sin red nunca llegó al servidor",
        },
      )
      .toBe(true);
  });
});
