import { describe, expect, it } from "vitest";

import {
  type BufferInput,
  availableAfterReconcile,
  availableBalance,
  effectiveBuffer,
  hasActiveBuffer,
  isBelowBuffer,
  reconcile,
  summarizeAvailability,
} from "./colchon.ts";

const cuenta = (
  currentBalance: number,
  bufferAmount = 0,
  { bufferApplied = true, includeInTotal = true } = {},
): BufferInput => ({
  type: "BANK",
  currentBalance,
  bufferAmount,
  bufferApplied,
  includeInTotal,
});

const tarjeta = (currentBalance: number, bufferAmount = 0): BufferInput => ({
  type: "CREDIT_CARD",
  currentBalance,
  bufferAmount,
  bufferApplied: true,
  includeInTotal: true,
});

describe("disponible real", () => {
  it("resta el colchón del balance", () => {
    expect(availableBalance(cuenta(1000, 300))).toBe(700);
  });

  it("con colchón 0 se comporta exactamente igual que sin colchón", () => {
    const sinColchon = cuenta(1000, 0);
    expect(availableBalance(sinColchon)).toBe(1000);
    expect(hasActiveBuffer(sinColchon)).toBe(false);
    expect(effectiveBuffer(sinColchon)).toBe(0);
  });

  it("si el colchón está apagado, se guarda pero no se descuenta", () => {
    const apagado = cuenta(1000, 300, { bufferApplied: false });
    expect(availableBalance(apagado)).toBe(1000);
    expect(hasActiveBuffer(apagado)).toBe(false);
    // El valor no se pierde: sigue ahí para cuando se vuelva a encender.
    expect(apagado.bufferAmount).toBe(300);
  });

  it("en una tarjeta el colchón nunca aplica", () => {
    // Una tarjeta no tiene saldo del que apartar una parte, tiene deuda.
    expect(hasActiveBuffer(tarjeta(-500, 300))).toBe(false);
    expect(availableBalance(tarjeta(-500, 300))).toBe(-500);
  });
});

describe("colchón mayor que el balance", () => {
  it("el disponible sale negativo y no se recorta a cero", () => {
    // Recortarlo a 0 escondería que se está por debajo del propio mínimo.
    const corta = cuenta(100, 300);
    expect(availableBalance(corta)).toBe(-200);
    expect(isBelowBuffer(corta)).toBe(true);
  });

  it("justo en el colchón todavía no avisa", () => {
    const justa = cuenta(300, 300);
    expect(availableBalance(justa)).toBe(0);
    expect(isBelowBuffer(justa)).toBe(false);
  });

  it("sin colchón activo nunca avisa, por muy negativa que esté la cuenta", () => {
    expect(isBelowBuffer(cuenta(-500, 0))).toBe(false);
  });
});

describe("summarizeAvailability", () => {
  it("suma disponibles y lo retenido por separado", () => {
    const resumen = summarizeAvailability([cuenta(1000, 300), cuenta(500, 100)]);

    expect(resumen.available).toBe(1100); // 700 + 400
    expect(resumen.reserved).toBe(400);
    expect(resumen.hasAnyBuffer).toBe(true);
  });

  it("sin ningún colchón lo dice, para que la UI no meta ruido", () => {
    const resumen = summarizeAvailability([cuenta(1000), cuenta(500)]);

    expect(resumen.available).toBe(1500);
    expect(resumen.reserved).toBe(0);
    expect(resumen.hasAnyBuffer).toBe(false);
  });

  it("deja fuera las tarjetas: su deuda se trata aparte", () => {
    const resumen = summarizeAvailability([cuenta(1000, 200), tarjeta(-400)]);

    expect(resumen.available).toBe(800);
    expect(resumen.reserved).toBe(200);
  });

  it("respeta includeInTotal, igual que el resto de agregados (§8.1)", () => {
    const resumen = summarizeAvailability([
      cuenta(1000, 200),
      cuenta(999, 500, { includeInTotal: false }),
    ]);

    expect(resumen.available).toBe(800);
    expect(resumen.reserved).toBe(200);
  });

  it("cuenta cuántas cuentas están por debajo de su colchón", () => {
    const resumen = summarizeAvailability([
      cuenta(100, 300),
      cuenta(50, 200),
      cuenta(1000, 100),
    ]);

    expect(resumen.accountsBelowBuffer).toBe(2);
  });
});

describe("cuadre", () => {
  it("si falta dinero registrado, el ajuste es un ingreso", () => {
    // La app cree que hay 500 y el banco dice 620: faltan 120 por registrar.
    const r = reconcile(500, 620);

    expect(r.difference).toBe(120);
    expect(r.adjustmentType).toBe("INCOME");
    expect(r.adjustmentAmount).toBe(120);
    expect(r.needsAdjustment).toBe(true);
  });

  it("si sobra dinero registrado, el ajuste es un gasto", () => {
    const r = reconcile(500, 430);

    expect(r.difference).toBe(-70);
    expect(r.adjustmentType).toBe("EXPENSE");
    // El importe va siempre en positivo: el tipo es quien lleva el signo.
    expect(r.adjustmentAmount).toBe(70);
  });

  it("si ya cuadra, no crea ninguna transacción", () => {
    const r = reconcile(500, 500);

    expect(r.needsAdjustment).toBe(false);
    expect(r.adjustmentType).toBeNull();
    expect(r.adjustmentAmount).toBe(0);
  });

  it("una diferencia de coma flotante no genera un ajuste fantasma", () => {
    // 0.1 + 0.2 = 0.30000000000000004: sin umbral, cuadrar una cuenta ya
    // cuadrada crearía un ajuste de 4e−17.
    const calculado = 0.1 + 0.2;
    const r = reconcile(calculado, 0.3);

    expect(r.needsAdjustment).toBe(false);
  });

  it("el importe del ajuste sale en céntimos limpios", () => {
    // 200 − 154.1 da 45.900000000000006 en coma flotante, y ese número acabaría
    // escrito en el historial de movimientos del usuario.
    const r = reconcile(154.1, 200);
    expect(r.adjustmentAmount).toBe(45.9);
    expect(r.difference).toBe(45.9);
  });

  it("un céntimo sí es diferencia real; una milésima es ruido", () => {
    // No se comprueba el borde exacto (0,005) a propósito: `100.005 − 100` da
    // 0.004999999999990905 en coma flotante, así que ese punto es ambiguo por
    // naturaleza. Lo que importa es que un céntimo cuente y una milésima no.
    expect(reconcile(100, 100.01).needsAdjustment).toBe(true);
    expect(reconcile(100, 99.99).needsAdjustment).toBe(true);
    expect(reconcile(100, 100.001).needsAdjustment).toBe(false);
  });
});

describe("disponible tras el cuadre", () => {
  it("descuenta el colchón del saldo real que se acaba de teclear", () => {
    expect(availableAfterReconcile(1000, 300, true)).toBe(700);
  });

  it("con el colchón desmarcado enseña el saldo real entero", () => {
    expect(availableAfterReconcile(1000, 300, false)).toBe(1000);
  });

  it("avisa en negativo si el saldo real no llega al colchón", () => {
    expect(availableAfterReconcile(100, 300, true)).toBe(-200);
  });
});
