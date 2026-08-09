import { Plus, Tag, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import {
  CATEGORY_PALETTE,
  type CategoryType,
  type IconName,
} from "@/shared/constants.ts";

import { CategoryIcon, IconPicker } from "../components/domain.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, EmptyState, Skeleton } from "../components/ui/card.tsx";
import { ColorPicker, SelectField, TextField } from "../components/ui/field.tsx";
import { ConfirmDialog } from "../components/ui/responsive-dialog.tsx";
import { useCategories, useDeleteCategory, useSaveCategory } from "../hooks/api.ts";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
import { ApiRequestError } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";

/** Gestión de categorías, separadas por tipo. Réplica de `CategoriesScreen.kt`. */
export function CategoriesScreen() {
  const categorias = useCategories();
  const navigate = useNavigate();
  const [tipo, setTipo] = useState<CategoryType>("EXPENSE");

  const visibles = (categorias.data ?? []).filter((c) => c.type === tipo);

  return (
    <div>
      <ScreenHeader
        title="Categorías"
        onBack={() => void navigate("/ajustes")}
        action={
          <Button asChild size="icon" variant="ghost" aria-label="Nueva categoría">
            <Link to="/categoria/nueva">
              <Plus />
            </Link>
          </Button>
        }
      />

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
          {(
            [
              ["EXPENSE", "Gastos"],
              ["INCOME", "Ingresos"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setTipo(valor)}
              className={cn(
                "min-h-11 rounded-lg text-sm font-medium transition-colors",
                tipo === valor
                  ? "bg-white shadow-sm dark:bg-neutral-700"
                  : "opacity-60 hover:opacity-100",
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {categorias.isPending ? (
          <Skeleton className="h-64" />
        ) : visibles.length === 0 ? (
          <Card>
            <EmptyState icon={Tag} title="Sin categorías de este tipo" />
          </Card>
        ) : (
          <Card className="divide-y divide-black/5 p-0 dark:divide-white/10">
            {visibles.map((categoria) => (
              <Link
                key={categoria.id}
                to={`/categoria/${categoria.id}`}
                className="flex items-center gap-3 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl hover:bg-black/3 dark:hover:bg-white/5"
              >
                <CategoryIcon
                  iconName={categoria.iconName}
                  colorHex={categoria.colorHex}
                  size={36}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {categoria.name}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

interface ValoresCategoria {
  name: string;
  type: CategoryType;
  colorHex: string;
  iconName: IconName;
}

/**
 * Carga los datos y monta el formulario con `key`.
 *
 * Inicializar el estado en `useState` en lugar de volcarlo desde un `useEffect`
 * evita los renders en cascada y hace que cambiar de categoría reinicie el
 * formulario limpio.
 */
export function CategoryFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const categorias = useCategories();
  const editando = id !== undefined;

  if (categorias.isPending) {
    return (
      <div>
        <ScreenHeader
          title={editando ? "Editar categoría" : "Nueva categoría"}
          onBack={() => void navigate(-1)}
        />
        <div className="space-y-4 p-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-14" />
        </div>
      </div>
    );
  }

  const existente = categorias.data?.find((c) => c.id === id);
  const inicial: ValoresCategoria = existente
    ? {
        name: existente.name,
        type: existente.type,
        colorHex: existente.colorHex,
        iconName: existente.iconName,
      }
    : { name: "", type: "EXPENSE", colorHex: CATEGORY_PALETTE[0], iconName: "Category" };

  return <CategoryForm key={id ?? "nueva"} id={id} inicial={inicial} />;
}

function CategoryForm({
  id,
  inicial,
}: {
  id: string | undefined;
  inicial: ValoresCategoria;
}) {
  const navigate = useNavigate();
  const editando = id !== undefined;

  const guardar = useSaveCategory();
  const borrar = useDeleteCategory();

  const [name, setName] = useState(inicial.name);
  const [type, setType] = useState<CategoryType>(inicial.type);
  const [colorHex, setColorHex] = useState<string>(inicial.colorHex);
  const [iconName, setIconName] = useState<IconName>(inicial.iconName);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  async function alEnviar(event: FormEvent) {
    event.preventDefault();
    setErrores({});

    try {
      await guardar.mutateAsync({ id, name, type, colorHex, iconName });
      void navigate(-1);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrores(
          Object.keys(error.fields).length > 0
            ? error.fields
            : { general: error.message },
        );
      } else {
        setErrores({ general: "No se pudo guardar" });
      }
    }
  }

  return (
    <div>
      <ScreenHeader
        title={editando ? "Editar categoría" : "Nueva categoría"}
        onBack={() => void navigate(-1)}
        action={
          editando ? (
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              aria-label="Eliminar"
              className="grid size-11 place-items-center rounded-xl text-expense hover:bg-expense/10"
            >
              <Trash2 className="size-5" />
            </button>
          ) : null
        }
      />

      <form onSubmit={(e) => void alEnviar(e)} className="space-y-5 p-4">
        {errores.general && (
          <p
            role="alert"
            className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense"
          >
            {errores.general}
          </p>
        )}

        <div className="flex justify-center py-2">
          <CategoryIcon iconName={iconName} colorHex={colorHex} size={72} />
        </div>

        <TextField
          label="Nombre"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errores.name}
        />

        <SelectField
          label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value as CategoryType)}
          hint="Las transferencias nunca llevan categoría."
        >
          <option value="EXPENSE">Gasto</option>
          <option value="INCOME">Ingreso</option>
        </SelectField>

        <ColorPicker
          label="Color"
          colors={CATEGORY_PALETTE}
          value={colorHex}
          onChange={setColorHex}
        />

        <IconPicker
          label="Icono"
          value={iconName}
          colorHex={colorHex}
          onChange={setIconName}
        />

        <Button type="submit" full size="lg" disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </form>

      <ConfirmDialog
        open={confirmarBorrado}
        onOpenChange={setConfirmarBorrado}
        title="¿Eliminar la categoría?"
        description="Las transacciones que la usaban NO se borran: se quedan sin categoría y siguen contando en los totales."
        onConfirm={() => {
          if (!id) return;
          borrar.mutate(id, { onSuccess: () => void navigate(-1) });
        }}
      />
    </div>
  );
}
