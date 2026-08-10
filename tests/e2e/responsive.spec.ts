import { expect, test } from "@playwright/test";

import { fijarTema } from "./sembrar.ts";

/**
 * Verificación de §10: la misma app en los cinco tamaños de referencia.
 *
 * En ninguno puede haber scroll horizontal, texto cortado ni botones
 * inalcanzables. De cada tamaño se guarda una captura en `tests/e2e/capturas/`.
 */

const TAMANOS = [
  { nombre: "360x800-movil-chico", width: 360, height: 800, layout: "movil" },
  { nombre: "390x844-iphone", width: 390, height: 844, layout: "movil" },
  { nombre: "768x1024-tablet", width: 768, height: 1024, layout: "rail" },
  { nombre: "1280x800-escritorio", width: 1280, height: 800, layout: "sidebar" },
  { nombre: "1920x1080-escritorio-ancho", width: 1920, height: 1080, layout: "sidebar" },
] as const;

/** Rutas que se recorren en cada tamaño. */
const RUTAS = [
  { ruta: "/", nombre: "inicio" },
  { ruta: "/transacciones", nombre: "transacciones" },
  { ruta: "/presupuestos", nombre: "presupuestos" },
  { ruta: "/estadisticas", nombre: "estadisticas" },
  { ruta: "/calendario", nombre: "calendario" },
  { ruta: "/ajustes", nombre: "ajustes" },
  { ruta: "/cuentas", nombre: "cuentas" },
  { ruta: "/categorias", nombre: "categorias" },
  { ruta: "/transacciones/nueva", nombre: "form-transaccion" },
] as const;

test.describe("adaptación a cada dispositivo (§10)", () => {
  for (const tamano of TAMANOS) {
    test(`${tamano.nombre}: sin desbordes en ninguna pantalla`, async ({ page }) => {
      await page.setViewportSize({ width: tamano.width, height: tamano.height });

      for (const { ruta, nombre } of RUTAS) {
        await page.goto(ruta);
        // Se espera a que la pantalla tenga contenido real, no el esqueleto.
        await page.waitForLoadState("networkidle");

        // 1. Nada puede desbordar horizontalmente.
        const desborde = await page.evaluate(
          () =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(
          desborde,
          `${nombre} desborda ${desborde}px en ${tamano.nombre}`,
        ).toBeLessThanOrEqual(0);

        // 2. Ningún elemento interactivo puede quedar fuera del viewport ni
        //    ser más pequeño que el objetivo táctil. §10 exige 44 px en móvil;
        //    en escritorio el ratón es preciso y basta con que sea clicable.
        const alturaMinima = tamano.layout === "movil" ? 44 : 28;
        const problemas = await page.evaluate((minimo) => {
          const fuera: string[] = [];
          const pequenos: string[] = [];
          const seleccion = "button, a[href], input, select, textarea";

          for (const el of document.querySelectorAll<HTMLElement>(seleccion)) {
            const r = el.getBoundingClientRect();
            // Los invisibles (dentro de un menú cerrado) no cuentan.
            if (r.width === 0 || r.height === 0) continue;

            const etiqueta = `${el.tagName.toLowerCase()}"${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 25)}"`;
            if (r.right > window.innerWidth + 1 || r.left < -1) fuera.push(etiqueta);
            // Los `option` de un `select` nativo no son objetivos propios.
            if (el.tagName !== "OPTION" && r.height < minimo) pequenos.push(etiqueta);
          }
          return { fuera, pequenos };
        }, alturaMinima);

        expect(
          problemas.fuera,
          `${nombre} @ ${tamano.nombre}: controles fuera de pantalla`,
        ).toEqual([]);
        expect(
          problemas.pequenos,
          `${nombre} @ ${tamano.nombre}: controles por debajo del objetivo táctil`,
        ).toEqual([]);

        await page.screenshot({
          path: `tests/e2e/capturas/${tamano.nombre}/${nombre}.png`,
          fullPage: false,
        });
      }
    });
  }

  test("el layout cambia con el ancho", async ({ page }) => {
    // Móvil: barra inferior, sin barra lateral.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("nav[aria-label='Navegación principal']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nueva transacción" })).toBeVisible();

    // Escritorio: barra lateral con etiquetas y acción en la cabecera, sin FAB.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Transacciones" })).toBeVisible();
    // En escritorio la acción es un botón con texto, no el botón flotante.
    await expect(page.getByRole("button", { name: "Nueva transacción" })).toContainText(
      "Nueva transacción",
    );
  });

  /**
   * Regresión: entre 768 y 1279 px la cabecera colgaba de `esEscritorio`, así
   * que no quedaba ningún botón para crear una transacción — solo el atajo `n`.
   * Y ese tramo se pisa sin ser una tablet: un monitor de 1920 con el escalado
   * de Windows al 150 % da 1280 px de viewport, menos la barra de scroll.
   */
  test("siempre hay un botón para crear una transacción", async ({ page }) => {
    for (const width of [360, 768, 1024, 1265, 1280, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const boton = page.getByRole("button", { name: "Nueva transacción" });
      await expect(boton, `sin botón de alta a ${width}px`).toBeVisible();

      await boton.click();
      await expect(
        page.getByRole("heading", { name: "Nueva transacción" }),
        `el botón no abre el alta a ${width}px`,
      ).toBeVisible();
    }
  });

  /**
   * Regresión: sin `color-scheme` el navegador pintaba el desplegable nativo con
   * su paleta clara mientras el texto heredaba el color claro del tema oscuro,
   * y las opciones salían blancas sobre blanco. El fondo tiene que ser opaco:
   * el popup lo hereda del <select> y un color con alfa se compone contra
   * blanco.
   */
  test("en tema oscuro las opciones de un desplegable se leen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // El tema se fija en el SERVIDOR, no en localStorage: `SincronizarTema`
    // pisa lo local en cuanto llegan los ajustes del usuario. Con el valor por
    // defecto (SYSTEM) un runner headless resuelve a claro y esto fallaría —
    // que es justo lo que pasó en el CI.
    await fijarTema(page, "DARK");

    await page.goto("/transacciones/nueva");
    await expect(page.locator("html.dark")).toBeAttached();

    const estilos = await page.evaluate(() => {
      const opcion = document.querySelector("select option");
      if (!opcion) return null;
      const cs = getComputedStyle(opcion);
      return {
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        fondo: cs.backgroundColor,
        texto: cs.color,
      };
    });

    expect(estilos, "no se encontró ningún <option>").not.toBeNull();
    expect(estilos!.colorScheme).toBe("dark");
    // Opaco: nada de rgba(...) con alfa, que es lo que rompía el popup.
    expect(estilos!.fondo).not.toContain("rgba");
    expect(estilos!.fondo).not.toBe(estilos!.texto);

    // El tema queda guardado en el servidor, así que se devuelve a claro para
    // no arrastrar el modo oscuro a los tests que vengan detrás.
    await fijarTema(page, "LIGHT");
  });

  test("en escritorio la lista y el detalle se ven a la vez", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/transacciones");

    // Al abrir una transacción, la lista sigue visible al lado (§10).
    await page
      .getByRole("link", { name: /Supermercado/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Editar transacción" })).toBeVisible();
    await expect(
      page.getByPlaceholder("Buscar por nota, categoría o importe"),
    ).toBeVisible();
  });

  test("los atajos de teclado del escritorio funcionan", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    // En un navegador real el documento ya tiene el foco; en headless hay que
    // dárselo con una interacción antes de mandar teclas.
    await page.locator("body").click();

    // `N` abre el alta de transacción.
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "Nueva transacción" })).toBeVisible();

    // `G` y luego `P` salta a Presupuestos.
    await page.goto("/");
    await page.locator("body").click();
    await page.keyboard.press("g");
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/presupuestos/);

    // `?` abre la ayuda y `Escape` la cierra.
    await page.keyboard.press("?");
    await expect(page.getByRole("heading", { name: "Atajos de teclado" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Atajos de teclado" })).toBeHidden();
  });

  test("escribir en un campo no dispara los atajos", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/transacciones");

    const buscador = page.getByPlaceholder("Buscar por nota, categoría o importe");
    await buscador.click();
    await buscador.fill("nomina");

    // Si los atajos se dispararan al escribir, la "n" habría abierto el alta.
    await expect(buscador).toHaveValue("nomina");
    await expect(page.getByRole("heading", { name: "Nueva transacción" })).toBeHidden();
  });
});
