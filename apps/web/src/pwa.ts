export const SENSITIVE_ROUTE_PATTERNS = [
  /^\/api\//,
  /^\/auth\//,
  /^\/import\//,
  /^\/export\//,
  /^\/backup\//,
];

export const PWA_UPDATE_AVAILABLE_EVENT = "fastifly:pwa-update-available";

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

  const registration = await navigator.serviceWorker.register("/sw.js");

  if (registration.waiting) {
    window.dispatchEvent(new CustomEvent(PWA_UPDATE_AVAILABLE_EVENT));
  }

  registration.addEventListener("updatefound", () => {
    const newWorker = registration.installing;
    if (!newWorker) {
      return;
    }

    newWorker.addEventListener("statechange", () => {
      if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
        window.dispatchEvent(new CustomEvent(PWA_UPDATE_AVAILABLE_EVENT));
      }
    });
  });
}

export async function activateServiceWorkerUpdate(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) {
    return;
  }

  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}
