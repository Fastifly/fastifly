import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  FileUp,
  GitBranch,
  Home,
  Landmark,
  PieChart,
  ReceiptText,
  RefreshCcw,
  Repeat,
  Settings,
} from "lucide-react";
import { en } from "../i18n/en";

export const MAX_MOBILE_TABS = 4;

export type NavigationItem = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly mobileLabel: string;
  readonly slug: string;
  readonly to: string;
};

export const navigationItems = [
  {
    icon: Home,
    label: en.nav.dashboard,
    mobileLabel: en.nav.dashboardShort,
    slug: "dashboard",
    to: "/",
  },
  {
    icon: ReceiptText,
    label: en.nav.transactions,
    mobileLabel: en.nav.transactionsShort,
    slug: "transactions",
    to: "/transactions",
  },
  {
    icon: Landmark,
    label: en.nav.accounts,
    mobileLabel: en.nav.accountsShort,
    slug: "accounts",
    to: "/accounts",
  },
  {
    icon: PieChart,
    label: en.nav.budgets,
    mobileLabel: en.nav.budgetsShort,
    slug: "budgets",
    to: "/budgets",
  },
  {
    icon: FileUp,
    label: en.nav.imports,
    mobileLabel: en.nav.importsShort,
    slug: "imports",
    to: "/imports",
  },
  {
    icon: GitBranch,
    label: en.nav.rules,
    mobileLabel: en.nav.rulesShort,
    slug: "rules",
    to: "/rules",
  },
  {
    icon: Repeat,
    label: en.nav.recurring,
    mobileLabel: en.nav.recurringShort,
    slug: "recurring",
    to: "/recurring",
  },
  {
    icon: BarChart3,
    label: en.nav.reports,
    mobileLabel: en.nav.reports,
    slug: "reports",
    to: "/reports",
  },
  {
    icon: RefreshCcw,
    label: en.nav.sync,
    mobileLabel: en.nav.sync,
    slug: "sync",
    to: "/sync",
  },
  {
    icon: Settings,
    label: en.nav.settings,
    mobileLabel: en.nav.settings,
    slug: "settings",
    to: "/settings",
  },
] as const satisfies readonly NavigationItem[];

const defaultMobileSlugs = ["dashboard", "transactions", "accounts", "budgets"] as const;

export function getMobilePrimaryNavigation(
  items: readonly NavigationItem[] = navigationItems,
): readonly NavigationItem[] {
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  return defaultMobileSlugs
    .map((slug) => bySlug.get(slug))
    .filter((item): item is NavigationItem => item !== undefined)
    .slice(0, MAX_MOBILE_TABS);
}

export function getCurrentNavigationItem(
  pathname: string,
  items: readonly NavigationItem[] = navigationItems,
): NavigationItem {
  const exactOrPrefixMatch = items
    .filter((item) => item.to === "/" || pathname === item.to || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return exactOrPrefixMatch ?? items[0] ?? navigationItems[0];
}
