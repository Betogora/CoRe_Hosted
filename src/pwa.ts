export function registerCoreServiceWorker(serviceWorker: Pick<ServiceWorkerContainer, "register"> | null = typeof navigator === "undefined" ? null : navigator.serviceWorker): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorker) return Promise.resolve(null);
  return serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
}
