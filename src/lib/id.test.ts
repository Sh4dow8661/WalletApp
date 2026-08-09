import { describe, expect, it } from "vitest";

import { isValidId, timestampFromUuidv7, uuidv7 } from "./id.ts";

describe("uuidv7", () => {
  it("genera un UUID con forma canónica", () => {
    expect(isValidId(uuidv7())).toBe(true);
  });

  it("marca la versión 7 y la variante RFC 4122", () => {
    for (let i = 0; i < 50; i++) {
      const hex = uuidv7().replace(/-/g, "");
      // Dígito 12: versión. Debe ser 7.
      expect(hex[12]).toBe("7");
      // Dígito 16: variante. Los 2 bits altos deben ser 10, o sea 8, 9, a o b.
      expect("89ab").toContain(hex[16]);
    }
  });

  it("codifica el timestamp que se le pasa", () => {
    const now = Date.UTC(2026, 7, 9, 15, 30, 45, 123);
    expect(timestampFromUuidv7(uuidv7(now))).toBe(now);
  });

  it("ordena lexicográficamente igual que cronológicamente", () => {
    // Esta es la propiedad por la que se eligió v7 sobre v4: `ORDER BY id`
    // sirve como desempate estable y el índice no se fragmenta al insertar.
    const base = Date.UTC(2026, 0, 1);
    const ids = [0, 1, 1000, 60_000, 86_400_000, 31_536_000_000].map((offset) =>
      uuidv7(base + offset),
    );
    expect([...ids].sort()).toEqual(ids);
  });

  it("no repite IDs dentro del mismo milisegundo", () => {
    // Los 74 bits aleatorios hacen que una colisión sea inverosímil aunque el
    // timestamp sea idéntico, que es lo que pasa al sembrar 17 filas de golpe.
    const now = Date.now();
    const ids = new Set(Array.from({ length: 5000 }, () => uuidv7(now)));
    expect(ids.size).toBe(5000);
  });

  it("aguanta timestamps grandes sin perder precisión", () => {
    // 48 bits llegan al año 10889. Se comprueba que la aritmética en punto
    // flotante de la parte alta no redondea.
    const lejano = 2 ** 45 + 123456;
    expect(timestampFromUuidv7(uuidv7(lejano))).toBe(lejano);
  });
});

describe("isValidId", () => {
  it("acepta un UUID canónico en minúsculas", () => {
    expect(isValidId("0198f3a1-2b4c-7d8e-9f01-234567890abc")).toBe(true);
  });

  it("rechaza lo que no tiene forma de UUID", () => {
    // El cliente genera sus propios IDs, así que esto es una frontera de
    // seguridad: sin validar, podría colarse un ID inventado o una inyección.
    const malos = [
      "",
      "123",
      "no-es-un-uuid",
      "0198f3a1-2b4c-7d8e-9f01-234567890ab", // un carácter de menos
      "0198f3a1-2b4c-7d8e-9f01-234567890abcd", // uno de más
      "0198F3A1-2B4C-7D8E-9F01-234567890ABC", // mayúsculas: no es canónico
      "0198f3a1_2b4c_7d8e_9f01_234567890abc", // separadores erróneos
      "0198f3a1-2b4c-7d8e-9f01-234567890abg", // 'g' no es hex
      "'; DROP TABLE transactions;--",
      null,
      undefined,
      42,
      {},
      ["0198f3a1-2b4c-7d8e-9f01-234567890abc"],
    ];
    for (const malo of malos) {
      expect(isValidId(malo)).toBe(false);
    }
  });
});

describe("timestampFromUuidv7", () => {
  it("devuelve null si el UUID no es de la versión 7", () => {
    // UUID v4: el dígito de versión es 4.
    expect(timestampFromUuidv7("0198f3a1-2b4c-4d8e-9f01-234567890abc")).toBeNull();
  });

  it("devuelve null si la cadena no es un UUID", () => {
    expect(timestampFromUuidv7("cualquier cosa")).toBeNull();
  });
});
