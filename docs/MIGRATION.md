# Cómo pasar tus datos de la app Android a la PWA

Esta es la guía paso a paso de la migración (§12). Se hace **una sola vez**.

Resumen de lo que va a pasar: instalas una versión nueva de la app Android que
sabe exportar todo a un archivo, generas ese archivo, lo pasas al PC o al móvil
donde tengas abierta la PWA, y lo importas desde Ajustes.

> **La app Android no se desinstala.** Se queda como está, con sus datos
> intactos, hasta que compruebes que en la PWA está todo. Solo entonces decides.

---

## Antes de empezar

- La PWA tiene que estar desplegada y con tu cuenta ya creada (Fase 8). Si aún
  no lo está, puedes hacer la prueba en local con `pnpm dev`.
- Necesitas el teléfono donde está la app con tus datos.

---

## Paso 1 — Instalar la app Android que sabe exportar

La versión que tienes instalada no tiene el botón de exportar todo; hay que
poner la **1.9.2**.

El APK está en:

```
C:\dev\apk\WalletApp-1.9.2-exportar-json.apk
```

Si no lo encuentras, se regenera desde el repo:

```bash
cd legacy-android && ./gradlew assembleRelease
```

Pásalo al teléfono como prefieras (cable, Drive, Telegram…) y ábrelo para
instalar.

> **Se instala encima de la que tienes y conserva los datos.** Va firmada con el
> mismo certificado (`CN=WalletApp, O=Sh4dow8661`), que es la condición para que
> Android la acepte como actualización y no como app distinta. **No desinstales
> la anterior**: eso sí borraría la base de datos.

Si Android avisa de "aplicación de origen desconocido", hay que darle permiso al
gestor de archivos desde el propio aviso.

---

## Paso 2 — Generar el archivo

En la app Android:

1. **Ajustes**
2. **Exportar todo (JSON)**

Se abre el menú de compartir. Mándatelo a donde te sea cómodo recogerlo: Drive,
correo, WhatsApp contigo mismo…

El archivo también queda guardado en el teléfono, por si prefieres cogerlo por
cable:

```
Android/data/com.walletapp/files/exports/wallet_export_<marca-de-tiempo>.json
```

### Qué lleva ese archivo

Todo: cuentas (con su balance inicial, color, icono y si cuenta en el total),
categorías, movimientos, presupuestos, los enlaces entre movimientos y
presupuestos, y **la dirección de cada transferencia**.

Ese último dato es la razón de que exista este exportador. El CSV que ya
generaba la app **no lo guarda**, y sin él, ante dos filas «A→B» y «B→A», es
imposible saber cuál era la que salía: importarlo mal deja los dos saldos
cambiados entre sí.

---

## Paso 3 — Importar en la PWA

Abre la PWA (en el PC es más cómodo) e inicia sesión.

1. **Ajustes → Datos → Importar datos**
2. Elige el archivo `.json`
3. Lee el aviso y confirma con **Reemplazar todo**

### Lee esto antes de confirmar

La importación **borra lo que haya en tu cuenta de la PWA** y pone lo del
archivo. Si ya habías metido cosas a mano, descarga antes una copia con
**Copia de seguridad**.

Si el archivo está mal o no es un export de WalletApp, se rechaza **sin tocar
nada**: la importación entera va en una sola transacción, así que o entra
completa o no entra.

---

## Paso 4 — Comprobar

Al terminar aparece un resumen con lo que entró. Repásalo contra la app Android,
que sigue instalada:

| Comprobar                 | Dónde                                       |
| ------------------------- | ------------------------------------------- |
| Balance total             | pantalla de Inicio, mismo número en las dos |
| Saldo de cada cuenta      | Ajustes → Cuentas                           |
| Número de movimientos     | lista de Transacciones                      |
| Presupuestos y lo gastado | pantalla de Presupuestos                    |

El resumen puede incluir avisos. El más probable:

> _N partes de transferencia se importaron sin su pareja._

No es un fallo de la importación. La app Android tenía un fallo por el que, al
**editar o borrar** una transferencia, solo tocaba una de las dos filas y la otra
se quedaba con el importe o la fecha viejos (§8.2). Esas filas descuadradas se
importan igual —el dinero se movió de verdad— pero conviene buscarlas y
arreglarlas a mano. En la PWA ya no puede volver a pasar: las dos patas se crean,
se editan y se borran juntas.

---

## Paso 5 — Solo cuando estés conforme

Cuando hayas comprobado que está todo:

- Puedes desinstalar la app Android.
- Guarda el archivo `.json` en un sitio seguro de todas formas.

---

## Copias de seguridad, de aquí en adelante

**Ajustes → Datos → Copia de seguridad** descarga un `.json` con todo, en el
mismo formato. Se vuelve a meter por el mismo sitio (**Importar datos**), así que
sirve tanto de respaldo como de vía para cambiarte de cuenta.

Los datos viven en la nube (D1) y se replican solos entre tus dispositivos, así
que la copia no es para el día a día: es para el «me he equivocado y quiero
volver a como estaba el lunes».

---

## Si algo sale mal

**«Esto no parece un export de WalletApp»**
Has elegido otro archivo, o uno de una versión que no incluía el exportador
JSON. Comprueba que sea el `.json` que sale de **Exportar todo (JSON)**.

**«El archivo dice ser de la versión N y esta app solo entiende la 1»**
El archivo es de una versión posterior del formato. Actualiza la PWA.

**No aparece «Exportar todo (JSON)» en la app Android**
Sigue instalada la versión vieja. Vuelve al paso 1 y comprueba en
**Ajustes → Aplicaciones → WalletApp** que la versión sea la 1.9.2.

**Android no deja instalar la 1.9.2 encima**
Solo puede ser que la firma no coincida, y entonces no se instala en ningún
caso. Antes de desinstalar nada, **exporta primero el CSV** desde la app que
tienes —es peor que nada, pero es algo— y consúltalo.

---

## El plan B: importar el CSV

La PWA también acepta el CSV que ya generaba la app Android, por si el APK
nuevo no se pudiera instalar. **Es notablemente peor** y solo tiene sentido como
último recurso:

|                                 | JSON                               | CSV            |
| ------------------------------- | ---------------------------------- | -------------- |
| Movimientos                     | sí                                 | sí             |
| Cuentas                         | con balance inicial, color e icono | solo el nombre |
| Categorías                      | con tipo, color e icono            | nombre y tipo  |
| Presupuestos                    | sí                                 | **no**         |
| Enlaces con presupuestos        | sí                                 | **no**         |
| Dirección de las transferencias | sí                                 | **se supone**  |
| «Contar en el total»            | sí                                 | **no**         |

Al importar un CSV, las transferencias se emparejan por fecha, importe y cuentas
cruzadas, y **se toma como saliente la primera de cada par en el archivo**. Es
una suposición: el resumen te dirá cuántas se reconstruyeron para que las
revises una por una.
