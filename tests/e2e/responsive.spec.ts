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
   * Regresión: la barra lateral no llevaba `overflow`, así que en cuanto la
   * lista no cabía —ventana baja, o el rail estrecho, donde cada ítem ocupa el
   * doble por llevar el texto bajo el icono— los últimos elementos quedaban
   * recortados y no había forma de llegar a ellos.
   */
  test("se puede llegar al último ítem del menú aunque no quepa", async ({ page }) => {
    // El rail estrecho con la ventana baja es el caso que se rompía.
    for (const [width, height] of [
      [900, 560],
      [1280, 560],
      [1280, 720],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const medida = await page.evaluate(() => {
        const nav = document.querySelector("nav[aria-label='Navegación principal']");
        const lista = nav!.querySelector("[data-menu-secciones]")!;
        const ultimo = [...nav!.querySelectorAll("a")].at(-1)!;
        const atajos = nav!.querySelector("button")!;

        const dentro = (el: Element, caja: Element) => {
          const b = el.getBoundingClientRect();
          const c = caja.getBoundingClientRect();
          return b.bottom <= c.bottom + 1 && b.top >= c.top - 1;
        };

        // Se baja del todo: el último ítem tiene que quedar a la vista.
        lista.scrollTop = lista.scrollHeight;
        const ultimoAlcanzable = dentro(ultimo, lista);

        return {
          ultimoAlcanzable,
          // El botón de Atajos vive fuera del área con scroll: siempre visible.
          atajosVisible: dentro(atajos, nav!),
          // La barra de scroll no debe salir si no hace falta.
          sobra: lista.scrollHeight > lista.clientHeight + 1,
          desbordaLaVentana: nav!.getBoundingClientRect().bottom > window.innerHeight + 1,
        };
      });

      const donde = `${width}x${height}`;
      expect(medida.ultimoAlcanzable, `${donde}: no se llega al último ítem`).toBe(true);
      expect(medida.atajosVisible, `${donde}: "Atajos" queda fuera`).toBe(true);
      expect(medida.desbordaLaVentana, `${donde}: la barra desborda`).toBe(false);
    }
  });

  /**
   * Regresión: al añadir el scroll vertical a la barra lateral aparecieron dos
   * problemas nuevos —una barra de scroll HORIZONTAL con sus flechas, y los
   * rótulos recortados— que el test anterior no cazó porque solo miraba el eje
   * vertical.
   *
   * Ojo con lo que este test NO puede ver: en un Chromium headless las barras
   * de scroll son overlay y no roban ancho, mientras que las clásicas de
   * Windows se llevan unos 15 px. Por eso `scroll-sin-barra` hace falta aunque
   * aquí el ancho robado salga siempre 0.
   */
  test("la barra lateral no recorta los rótulos ni scrollea en horizontal", async ({
    page,
  }) => {
    for (const [width, height] of [
      [1280, 720],
      [1280, 560],
      [900, 560],
      [900, 420],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const medida = await page.evaluate(() => {
        const nav = document.querySelector("nav[aria-label='Navegación principal']")!;
        const lista = nav.querySelector("[data-menu-secciones]")!;
        const cajaLista = lista.getBoundingClientRect();

        const recortados: string[] = [];
        for (const enlace of nav.querySelectorAll("a")) {
          const span = enlace.querySelector("span");
          if (!span) continue;
          const caja = span.getBoundingClientRect();
          // Fuera del área visible por cualquiera de los dos lados...
          if (caja.left < cajaLista.left - 0.5 || caja.right > cajaLista.right + 0.5) {
            recortados.push(span.textContent!.trim());
          }
          // ...o con el texto cortado con puntos suspensivos.
          if (span.scrollWidth > span.clientWidth + 1) {
            recortados.push(`${span.textContent!.trim()} (truncado)`);
          }
        }

        return {
          hayScrollHorizontal: lista.scrollWidth > lista.clientWidth + 1,
          overflowX: getComputedStyle(lista).overflowX,
          recortados,
        };
      });

      const donde = `${width}x${height}`;
      expect(medida.hayScrollHorizontal, `${donde}: hay scroll horizontal`).toBe(false);
      expect(medida.overflowX, `${donde}: el eje X debe estar cerrado`).toBe("hidden");
      expect(medida.recortados, `${donde}: rótulos recortados`).toEqual([]);
    }
  });

  /**
   * Regresión: el círculo del switch se salía de su pista. Iba con
   * `translate-x-5.5` y sin `left`, así que su posición dependía de dónde lo
   * dejara el flujo estático — medido, sobresalía 20 px por la derecha estando
   * encendido.
   */
  test("el círculo del switch no se sale de su pista", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/cuentas/nueva");
    await page.waitForLoadState("networkidle");

    const interruptor = page.locator("button[role='switch']").first();

    /**
     * Se mide sobre el locator, no con `document.querySelector`: el formulario
     * se remonta cuando terminan de llegar las cuentas, y en un runner lento
     * eso deja el `querySelector` en null justo después de pulsar. El locator
     * reintenta hasta que el elemento está.
     */
    const medir = async () => {
      await expect(interruptor).toBeVisible();
      return interruptor.evaluate((sw) => {
        const bola = sw.querySelector("span")!;
        const p = sw.getBoundingClientRect();
        const b = bola.getBoundingClientRect();
        return {
          izq: +(b.left - p.left).toFixed(1),
          der: +(p.right - b.right).toFixed(1),
          arriba: +(b.top - p.top).toFixed(1),
          abajo: +(p.bottom - b.bottom).toFixed(1),
        };
      });
    };

    // Los dos estados: el aire del lado activo tiene que ser el mismo que el de
    // arriba y abajo, y la bola nunca puede sobresalir.
    const estadoInicial = await interruptor.getAttribute("aria-checked");

    for (const paso of ["inicial", "cambiado"] as const) {
      if (paso === "cambiado") {
        await interruptor.click();
        // Se espera al cambio real de estado, no a un tiempo fijo, y luego a
        // que termine la transición de 200 ms del círculo.
        await expect(interruptor).toHaveAttribute(
          "aria-checked",
          estadoInicial === "true" ? "false" : "true",
        );
        await page.waitForTimeout(300);
      }

      const m = await medir();
      expect(m.izq, `${paso}: se sale por la izquierda`).toBeGreaterThanOrEqual(0);
      expect(m.der, `${paso}: se sale por la derecha`).toBeGreaterThanOrEqual(0);
      expect(Math.min(m.izq, m.der), `${paso}: sin aire en el lado activo`).toBeCloseTo(
        m.arriba,
        1,
      );
      expect(m.arriba, `${paso}: descentrado en vertical`).toBeCloseTo(m.abajo, 1);
    }
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
