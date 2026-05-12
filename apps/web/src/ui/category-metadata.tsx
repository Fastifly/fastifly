import type { CategoryResponse } from "@fastifly/common";
import {
  Briefcase,
  Building2,
  BusFront,
  Car,
  CircleOff,
  CreditCard,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Hospital,
  Landmark,
  type LucideIcon,
  PiggyBank,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  TrainFront,
  Utensils,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

export const CATEGORY_ICON_OPTIONS: readonly {
  readonly icon: LucideIcon;
  readonly name: string;
}[] = [
  { icon: Home, name: "house" },
  { icon: Building2, name: "building-2" },
  { icon: CreditCard, name: "credit-card" },
  { icon: Landmark, name: "landmark" },
  { icon: PiggyBank, name: "piggy-bank" },
  { icon: Wallet, name: "wallet" },
  { icon: Briefcase, name: "briefcase" },
  { icon: Receipt, name: "receipt" },
  { icon: Utensils, name: "utensils" },
  { icon: ShoppingCart, name: "shopping-cart" },
  { icon: ShoppingBag, name: "shopping-bag" },
  { icon: Shirt, name: "shirt" },
  { icon: Car, name: "car" },
  { icon: Fuel, name: "fuel" },
  { icon: BusFront, name: "bus" },
  { icon: TrainFront, name: "train" },
  { icon: Plane, name: "plane" },
  { icon: Hospital, name: "hospital" },
  { icon: GraduationCap, name: "graduation-cap" },
  { icon: Gamepad2, name: "gamepad-2" },
  { icon: Dumbbell, name: "dumbbell" },
  { icon: Gift, name: "gift" },
  { icon: Heart, name: "heart" },
] as const;

const CATEGORY_ICON_COMPONENTS = new Map<string, LucideIcon>(
  CATEGORY_ICON_OPTIONS.map((iconOption) => [iconOption.name, iconOption.icon] as const),
);

export function getCategoryIconComponent(iconName: string | null | undefined): LucideIcon | null {
  if (!iconName) {
    return null;
  }
  return CATEGORY_ICON_COMPONENTS.get(iconName) ?? null;
}

export function buildCategoryNameById(
  categories: readonly CategoryResponse[],
): ReadonlyMap<string, string> {
  return new Map(categories.map((category) => [category.id, category.name] as const));
}

export function getCategoryParentName(input: {
  readonly category: CategoryResponse;
  readonly categoryNameById: ReadonlyMap<string, string>;
  readonly noParentLabel: string;
}): string {
  const { category, categoryNameById, noParentLabel } = input;
  if (!category.parentId) {
    return noParentLabel;
  }

  return categoryNameById.get(category.parentId) ?? noParentLabel;
}

export function CategoryToken(input: {
  readonly color: string | null | undefined;
  readonly icon: string | null | undefined;
  readonly name: string;
  readonly parentName?: string | null;
  readonly showParent?: boolean;
}): ReactNode {
  const { color, icon, name, parentName, showParent = true } = input;
  const IconComponent = getCategoryIconComponent(icon);

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full border border-black/10 dark:border-white/20"
        style={{ backgroundColor: color ?? "#94a3b8" }}
      />
      {IconComponent ? (
        <IconComponent aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <CircleOff aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">
        {name}
        {showParent && parentName ? (
          <span className="text-muted-foreground"> · {parentName}</span>
        ) : null}
      </span>
    </span>
  );
}
