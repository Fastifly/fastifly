import type { SVGProps } from "react";

type FastiflyIconProps = SVGProps<SVGSVGElement> & {
  readonly title?: string;
};

export function FastiflyIcon({ title = "Fastifly", ...props }: FastiflyIconProps) {
  return (
    <svg aria-label={title} role="img" viewBox="0 0 64 64" {...props}>
      <title>{title}</title>
      <rect width="64" height="64" rx="16" fill="currentColor" />
      <path
        d="M20 42c8-13 15-20 27-22M20 24h18M20 32h13"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        d="M42 19h8v8"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    </svg>
  );
}
