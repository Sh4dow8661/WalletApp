import { expect, test } from "@playwright/test";

import { limpiarCacheDeConsultas } from "./sembrar.ts";

/** Duplicar transacciones: desde el detalle y en bloque desde la lista. */

/** Crea un gasto con una nota única y devuelve su id. */
async function crearGasto(
  page: import("@playwright/test").Page,
  nota: string,
  amount: number,
) {
  await page.goto("/");
  const id = await page.evaluate(
    async ({ nota, amount }) => {
      const j = async (metodo: string, url: string, cuerpo?: unknown) => {
        const r = await fetch(url, {
          method: metodo,
          headers: { "content-type": "application/json" },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
        return r.json().catch(() => null);
      };

      type Tx = { id: string; note: string };
      const existentes = (await j("GET", "/api/transactions")) as Tx[];
      const yaEsta = existentes.find((t) => t.note === nota);
      if (yaEsta) return yaEsta.id;

      const cuentas = (await j("GET", "/api/accounts")) as { id: string }[];
      const cats = (await j("GET", "/api/categories")) as {
        id: string;
        name: string;
        type: string;
      }[];

      await j("POST", "/api/transactions", {
        amount,
        type: "EXPENSE",
        accountId: cuentas[0]!.id,
        categoryId: cats.find((c) => c.name === "Comida" && c.type === "EXPENSE")!.id,
        date: Date.now(),
        note: nota,
      });

      const todas = (await j("GET", "/api/transactions")) as Tx[];
      return todas.find((t) => t.note === nota)!.id;
    },
    { nota, amount },
  );

  await limpiarCacheDeConsultas(page);
  return id;
}

test("duplicar desde el detalle abre una copia sin tocar la original", async ({
  page,
}) => {
  const id = await crearGasto(page, "Original E2E", 33.5);

  await page.goto(`/transacciones/${id}`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Duplicar" }).click();

  // Se abre el alta prellenada, no se ha creado nada todavía.
  await expect(page.getByRole("heading", { name: "Duplicar transacción" })).toBeVisible();
  await expect(page.getByText(/la transacción original no se toca/i)).toBeVisible();
  await expect(page.getByLabel("Monto")).toHaveValue("33.5");

  const cuantasAntes = await page.evaluate(async () => {
    const t = (await (await fetch("/api/transactions")).json()) as unknown[];
    return t.length;
  });

  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/\/transacciones$/);

  // Ahora sí hay una más, y la original sigue existiendo.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const t = (await (await fetch("/api/transactions")).json()) as unknown[];
        return t.length;
      }),
    )
    .toBe(cuantasAntes + 1);

  await expect(
    page.evaluate(async (id) => {
      const t = (await (await fetch("/api/transactions")).json()) as { id: string }[];
      return t.some((x) => x.id === id);
    }, id),
  ).resolves.toBe(true);
});

test("la selección múltiple duplica en bloque a la fecha elegida", async ({ page }) => {
  await crearGasto(page, "Bloque A E2E", 11);
  await crearGasto(page, "Bloque B E2E", 22);

  await page.goto("/transacciones");
  await page.waitForLoadState("networkidle");

  // El modo selección se activa con un botón, no con un gesto: la app no usa
  // deslizar en ninguna otra pantalla.
  await page.getByRole("button", { name: "Seleccionar" }).click();

  // `.first()` porque este mismo test deja copias en ejecuciones anteriores —
  // la D1 local es compartida— y da igual cuál de ellas se marque.
  await page
    .getByRole("button", { name: /Bloque A E2E/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Bloque B E2E/ })
    .first()
    .click();

  await expect(page.getByRole("heading", { name: "2 seleccionadas" })).toBeVisible();

  const antes = await page.evaluate(async () => {
    const t = (await (await fetch("/api/transactions")).json()) as unknown[];
    return t.length;
  });

  await page.getByRole("button", { name: /^Duplicar$/ }).click();

  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const t = (await (await fetch("/api/transactions")).json()) as unknown[];
        return t.length;
      }),
    )
    .toBe(antes + 2);

  // Al terminar, el modo selección se cierra solo.
  await expect(page.getByRole("button", { name: "Seleccionar" })).toBeVisible();
});
