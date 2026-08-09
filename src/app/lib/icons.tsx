import { createElement } from "react";

import {
  Banknote,
  Briefcase,
  Car,
  Clapperboard,
  CreditCard,
  DollarSign,
  Gift,
  GraduationCap,
  House,
  Landmark,
  Laptop,
  Lightbulb,
  type LucideIcon,
  ShoppingCart,
  Stethoscope,
  Tag,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";

import { FALLBACK_ICON, type IconName } from "@/shared/constants.ts";

/**
 * Los 17 iconos de `IconMapper` traducidos a lucide.
 *
 * El **nombre** es lo que está guardado en la base de datos (y en los CSV que ya
 * existen), así que la clave no puede cambiar nunca; lo que se puede cambiar es
 * a qué dibujo de lucide apunta.
 */
const ICONOS: Record<IconName, LucideIcon> = {
  Restaurant: UtensilsCrossed,
  DirectionsCar: Car,
  Home: House,
  Movie: Clapperboard,
  LocalHospital: Stethoscope,
  ShoppingCart: ShoppingCart,
  School: GraduationCap,
  Lightbulb: Lightbulb,
  Category: Tag,
  Work: Briefcase,
  Computer: Laptop,
  CardGiftcard: Gift,
  TrendingUp: TrendingUp,
  AttachMoney: DollarSign,
  Payments: Banknote,
  AccountBalance: Landmark,
  CreditCard: CreditCard,
};

/**
 * Icono para un nombre guardado.
 *
 * Ante un nombre desconocido devuelve el de "Category", igual que el
 * `else -> Icons.Default.Category` del original: un dato viejo o corrupto no
 * debe dejar un hueco en la lista.
 */
export function iconFor(name: string): LucideIcon {
  return ICONOS[name as IconName] ?? ICONOS[FALLBACK_ICON];
}

/**
 * Pinta el icono correspondiente a un nombre guardado.
 *
 * Se usa esto en vez de `const Icon = iconFor(nombre)` seguido de `<Icon />`:
 * asignar el resultado a una variable en mayúscula y usarla como etiqueta JSX
 * hace que el compilador de React lo tome por un componente definido durante el
 * render. `createElement` deja claro que solo se está eligiendo de un mapa.
 */
export function Icon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return createElement(iconFor(name), { className, style, "aria-hidden": true });
}
