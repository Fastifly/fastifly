import { Badge } from "@ui/badge";
import { Card } from "@ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { testIds } from "../../testing/testid-registry";
import { FastiflyIcon } from "../fastifly-icon";
import type { Tone } from "./utils";

export function AuthGateScreen({ label }: { readonly label: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Card
        className="w-full max-w-[22rem] border border-border bg-card p-5 text-center text-card-foreground shadow-sm"
        data-testid={testIds.shell.authGate}
      >
        <div className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm dark:bg-emerald-400 dark:text-black">
          <FastiflyIcon className="size-7" />
        </div>
        <p className="mt-4 font-semibold" data-testid={testIds.shell.authGateMessage}>
          {label}
        </p>
      </Card>
    </main>
  );
}

export function StatusCapsule({
  icon: Icon,
  label,
  testId,
  tone,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly testId?: string | undefined;
  readonly tone: Tone;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : tone === "danger"
          ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-border bg-muted/40 text-muted-foreground";

  return (
    <Badge
      className={cn(
        "inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold",
        toneClass,
      )}
      data-testid={testId}
      variant="outline"
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}
