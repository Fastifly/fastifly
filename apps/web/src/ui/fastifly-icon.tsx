import type { SVGProps } from "react";
import { testIds } from "@/testing/testid-registry";

type FastiflyIconProps = SVGProps<SVGSVGElement> & {
  readonly title?: string;
  readonly testId?: string;
};

export function FastiflyIcon({
  title = "Fastifly",
  testId = testIds.icon.brand,
  ...props
}: FastiflyIconProps) {
  return (
    <svg aria-label={title} data-testid={testId} role="img" viewBox="0 0 64 64" {...props}>
      <title>{title}</title>
      <path
        d="M18 44c9-14 16-21 28-23M18 24h19M18 33h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        d="M43 20h8v8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    </svg>
  );
}
