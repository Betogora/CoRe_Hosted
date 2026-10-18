export function registerAppModuleLoadErrors(events: EventTarget = window): void {
  events.addEventListener("vite:preloadError", (event) => {
    const payload: unknown = "payload" in event ? event.payload : undefined;
    if (payload instanceof Error) {
      payload.message = "Ein Programmteil konnte nicht geladen werden. Prüfe deine Internetverbindung. Falls der Fehler bestehen bleibt, sichere deine Änderungen und lade die Seite neu.";
    }
  });
}

export function registerCoreServiceWorker(serviceWorker: Pick<ServiceWorkerContainer, "register"> | null = typeof navigator === "undefined" ? null : navigator.serviceWorker): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorker) return Promise.resolve(null);
  return serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
}
