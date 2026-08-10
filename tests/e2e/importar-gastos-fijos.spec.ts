import { expect, test } from "@playwright/test";

import { limpiarCacheDeConsultas } from "./sembrar.ts";

/**
 * Importación de gastos fijos por pegado.
 *
 * Los 13 gastos son los de la hoja real del usuario y **tienen que sumar
 * 556,25 al mes**. La cifra se comprueba en la vista previa del diálogo y no en
 * el resumen de la pantalla a propósito: los tests comparten la misma D1 local
 * y el resumen incluye lo que hayan dejado los demás, mientras que la vista
 * previa solo cuenta lo que se acaba de pegar.
 */

const HOJA_DEL_USUARIO = [
  "Gasto\tCategoría\tPrecio por cargo\tCada N meses",
  "Claude Max\tTecnología\t$112.00\t1",
  "Google AI Plus\tTecnología\t$112.00\t12",
  "Internet\tTecnología\t$50.00\t1",
  "Teléfono\tTecnología\t$45.00\t1",
  "YouTube Premium\tTecnología\t$9.00\t1",
  "Gasolina\tTransporte\t$200.00\t1",
  "Marbete\tTransporte\t$200.00\t12",
  "Amazon Prime\tEntretenimiento\t$9.00\t1",
  "Creatina\tSalud\t$33.00\t6",
  "Planet Fitness\tSalud\t$390.00\t12",
  "Guimos\tAlimentación\t$51.00\t1",
  "Perfume\tPersonal\t$61.00\t6",
  "Costco Gold Star\tHogar\t$73.00\t12",
].join("\n");

async function abrirImportacion(page: import("@playwright/test").Page) {
  await page.goto("/gastos-fijos");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Importar desde el Excel" }).first().click();
  await expect(page.getByText("Importar desde el Excel").first()).toBeVisible();
}

test("pegar la hoja del Excel enseña la vista previa con el total correcto", async ({
  page,
}) => {
  await abrirImportacion(page);

  await page.getByLabel("Filas pegadas").fill(HOJA_DEL_USUARIO);

  const vistaPrevia = page.getByTestId("importacion-vista-previa");
  await expect(vistaPrevia).toBeVisible();
  // La cabecera se ignora sola: 14 líneas, 13 gastos.
  await expect(vistaPrevia).toContainText("13 filas leídas");

  // La cifra que el usuario ya lee en su Excel.
  await expect(page.getByTestId("importacion-total")).toContainText("556.25");

  // Y se ve fila a fila qué va a pasar con cada una.
  await expect(vistaPrevia).toContainText("Claude Max");
  await expect(vistaPrevia).toContainText("Costco Gold Star");
});

test("importar crea los gastos, y volver a pegar actualiza sin duplicar", async ({
  page,
}) => {
  await abrirImportacion(page);
  await page.getByLabel("Filas pegadas").fill(HOJA_DEL_USUARIO);
  await page.getByRole("button", { name: /Importar 13/ }).click();

  await expect(page.getByTestId("importacion-resultado")).toBeVisible({
    timeout: 10_000,
  });

  // Segunda pasada: lo mismo otra vez. Es el caso que importa —seguir
  // sincronizando la hoja— y no puede crear un segundo juego de gastos.
  await page.getByLabel("Filas pegadas").fill(HOJA_DEL_USUARIO);
  await page.getByRole("button", { name: /Importar 13/ }).click();

  await expect(page.getByTestId("importacion-resultado")).toContainText(
    "13 actualizados",
    { timeout: 10_000 },
  );
  await expect(page.getByTestId("importacion-resultado")).toContainText(
    "0 gastos creados",
  );

  // En la lista hay exactamente uno de cada.
  await page.getByRole("button", { name: "Listo" }).click();
  await limpiarCacheDeConsultas(page);
  await page.goto("/gastos-fijos");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Claude Max", { exact: false })).toHaveCount(1);
  await expect(page.getByText("Planet Fitness", { exact: false })).toHaveCount(1);
});

test("la vista por categoría agrupa con subtotales", async ({ page }) => {
  // Se asegura de que los datos están cargados antes de mirar la agrupación.
  await abrirImportacion(page);
  await page.getByLabel("Filas pegadas").fill(HOJA_DEL_USUARIO);
  await page.getByRole("button", { name: /Importar 13/ }).click();
  await expect(page.getByTestId("importacion-resultado")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Listo" }).click();

  await limpiarCacheDeConsultas(page);
  await page.goto("/gastos-fijos");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Categoría" }).click();

  const tecnologia = page.locator('[data-grupo="Tecnología"]');
  await expect(tecnologia).toBeVisible();
  // 112 + 112/12 + 50 + 45 + 9 = 225,33 al mes. Lo anual entra dividido: si
  // alguien rompiera el equivalente mensual, aquí saldrían 328 y este test lo
  // cazaría.
  await expect(tecnologia.locator("[data-subtotal]")).toContainText("225.33");

  const transporte = page.locator('[data-grupo="Transporte"]');
  // 200 + 200/12 = 216,67.
  await expect(transporte.locator("[data-subtotal]")).toContainText("216.67");

  // Los grupos van de mayor a menor subtotal. Se compara Tecnología con
  // Transporte y no con «el primero de todos»: los e2e comparten la misma D1 y
  // otros tests dejan gastos en otras categorías.
  const orden = await page
    .locator("[data-grupo]")
    .evaluateAll((nodos) => nodos.map((n) => n.getAttribute("data-grupo")));
  expect(orden.indexOf("Tecnología")).toBeLessThan(orden.indexOf("Transporte"));
});

test("una fila ilegible se avisa sin tumbar el resto", async ({ page }) => {
  await abrirImportacion(page);

  await page
    .getByLabel("Filas pegadas")
    .fill(
      ["Bueno E2E\tTecnología\t$10.00\t1", "Malo E2E\tTecnología\tno-es-dinero\t1"].join(
        "\n",
      ),
    );

  await expect(page.getByText("1 fila no se pudo leer")).toBeVisible();
  await expect(page.getByText(/Línea 2:.*Importe inválido/)).toBeVisible();
  // La buena sigue en pie y se puede importar.
  await expect(page.getByTestId("importacion-vista-previa")).toContainText(
    "1 fila leída",
  );
  await expect(page.getByRole("button", { name: /Importar 1$/ })).toBeEnabled();
});
