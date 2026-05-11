export function RouteMarker({
  className = "sr-only",
  "data-testid": testId,
}: {
  className?: string;
  "data-testid": string;
}) {
  return <div className={className} data-testid={testId} aria-hidden="true" />;
}
