export const SENSITIVE_ROUTE_PATTERNS = [
  /^\/api\//,
  /^\/auth\//,
  /^\/import\//,
  /^\/export\//,
  /^\/backup\//,
];

export function isSensitiveRequestPath(pathname: string): boolean {
  return SENSITIVE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function shouldRegisterServiceWorker(input: {
  readonly isProduction: boolean;
  readonly hasServiceWorker: boolean;
}): boolean {
  return input.isProduction && input.hasServiceWorker;
}

export async function registerServiceWorker(): Promise<void> {
  if (
    !shouldRegisterServiceWorker({
      hasServiceWorker: "serviceWorker" in navigator,
      isProduction: import.meta.env.PROD,
    })
  ) {
    return;
  }

  await navigator.serviceWorker.register("/sw.js");
}
