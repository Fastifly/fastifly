import { Badge } from "@ui/badge";
import { Card } from "@ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { testIds } from "../../testing/testid-registry";
import { FastiflyIcon } from "../fastifly-icon";
import type { Tone } from "./utils";

export function AuthGateScreen({ label }: { readonly label: string }) {
  return (
    <main className="ff-liquid-bg flex min-h-screen items-center justify-center px-4 text-slate-950 dark:text-white">
      <Card
        className="ff-auth-panel w-full max-w-[22rem] p-5 text-center"
        data-testid={testIds.shell.authGate}
      >
        <div className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-[var(--ff-shadow-soft)] dark:bg-emerald-400 dark:text-black">
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
      ? "ff-status-capsule-success"
      : tone === "warning"
        ? "ff-status-capsule-warning"
        : tone === "danger"
          ? "ff-status-capsule-danger"
          : "ff-status-capsule-neutral";

  return (
    <Badge className={cn("ff-status-capsule", toneClass)} data-testid={testId} variant="outline">
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}
