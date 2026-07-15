export type ProductSurfaceMaturity = "core" | "labs" | "disabled";

export type ProductSurfaceId =
  | "today"
  | "learn"
  | "creation-manual-import"
  | "statistics"
  | "settings"
  | "assistant-chat"
  | "learning-plan"
  | "graph"
  | "community-demo"
  | "ai-job-history"
  | "local-ai-drafts"
  | "external-variant-json"
  | "server-apkg-over-250"
  | "auth-google"
  | "auth-magic-link";

export type ProductSurfaceSwitch =
  | "VITE_ENABLE_LABS"
  | "VITE_ENABLE_SERVER_APKG_IMPORT"
  | "VITE_ENABLE_GOOGLE_AUTH"
  | "VITE_ENABLE_MAGIC_LINK";

export interface ProductSurface {
  id: ProductSurfaceId;
  maturity: ProductSurfaceMaturity;
  mainNavigation: boolean;
  reason?: string;
  environmentSwitch?: ProductSurfaceSwitch;
}

export interface ProductSurfaceEnvironment extends Partial<Record<ProductSurfaceSwitch, string | boolean>> {
  DEV?: boolean;
}

const surfaces = [
  { id: "today", maturity: "core", mainNavigation: true },
  { id: "learn", maturity: "core", mainNavigation: true },
  { id: "creation-manual-import", maturity: "core", mainNavigation: true },
  { id: "statistics", maturity: "core", mainNavigation: true },
  { id: "settings", maturity: "core", mainNavigation: false },
  {
    id: "assistant-chat",
    maturity: "labs",
    mainNavigation: false,
    reason: "Der Chat nutzt einen externen KI-Pfad und ist noch nicht Teil des belastbaren Kernprodukts.",
    environmentSwitch: "VITE_ENABLE_LABS",
  },
  {
    id: "learning-plan",
    maturity: "labs",
    mainNavigation: false,
    reason: "Der Lernplan arbeitet lokal und ist noch nicht als Kalender- oder Benachrichtigungsfunktion abgenommen.",
    environmentSwitch: "VITE_ENABLE_LABS",
  },
  {
    id: "graph",
    maturity: "labs",
    mainNavigation: false,
    reason: "Der Graph ist eine lokale, deterministische Mindmap und keine produktive KI-Generierung.",
    environmentSwitch: "VITE_ENABLE_LABS",
  },
  {
    id: "community-demo",
    maturity: "labs",
    mainNavigation: false,
    reason: "Die Community ist nur eine lokale Demo ohne echte Mitgliedschaften oder Freigaberechte.",
    environmentSwitch: "VITE_ENABLE_LABS",
  },
  {
    id: "ai-job-history",
    maturity: "labs",
    mainNavigation: false,
    reason: "Die Historie ist eine Diagnoseansicht und keine vollständige produktive Job-Orchestrierung.",
    environmentSwitch: "VITE_ENABLE_LABS",
  },
  {
    id: "local-ai-drafts",
    maturity: "labs",
    mainNavigation: false,
    reason: "Die Entwürfe werden lokal deterministisch erzeugt; es wird kein externes Modell aufgerufen.",
    environmentSwitch: "VITE_ENABLE_LABS",
  },
  {
    id: "external-variant-json",
    maturity: "labs",
    mainNavigation: false,
    reason: "Prompt und JSON-Antwort werden manuell übertragen; ein produktiver Provider-Flow ist nicht freigegeben.",
    environmentSwitch: "VITE_ENABLE_LABS",
  },
  {
    id: "server-apkg-over-250",
    maturity: "disabled",
    mainNavigation: false,
    reason: "Der serverseitige APKG-Pfad über 250 MiB wartet auf die Hosted-Ressourcenabnahme.",
    environmentSwitch: "VITE_ENABLE_SERVER_APKG_IMPORT",
  },
  {
    id: "auth-google",
    maturity: "disabled",
    mainNavigation: false,
    reason: "Google-Anmeldung benötigt einen ausdrücklich abgenommenen Hosted-Roundtrip.",
    environmentSwitch: "VITE_ENABLE_GOOGLE_AUTH",
  },
  {
    id: "auth-magic-link",
    maturity: "disabled",
    mainNavigation: false,
    reason: "Magic Link benötigt eine ausdrücklich abgenommene Zustellung und einen geprüften Link-Lifecycle.",
    environmentSwitch: "VITE_ENABLE_MAGIC_LINK",
  },
] as const satisfies readonly ProductSurface[];

function isExplicitlyEnabled(value: string | boolean | undefined): boolean {
  if (value === true) return true;
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function hasExplicitSwitchValue(value: string | boolean | undefined): boolean {
  return typeof value === "boolean" || String(value ?? "").trim() !== "";
}

export interface ProductSurfaceRegistry {
  labsEnabled: boolean;
  list(): ProductSurface[];
  get(id: ProductSurfaceId): ProductSurface;
  isAvailable(id: ProductSurfaceId): boolean;
  isMainNavigationVisible(id: ProductSurfaceId): boolean;
}

export function createProductSurfaceRegistry(environment: ProductSurfaceEnvironment = {}): ProductSurfaceRegistry {
  const labsEnabled = hasExplicitSwitchValue(environment.VITE_ENABLE_LABS)
    ? isExplicitlyEnabled(environment.VITE_ENABLE_LABS)
    : environment.DEV === true;
  const byId = new Map<ProductSurfaceId, ProductSurface>(surfaces.map((surface) => [surface.id, surface]));

  function get(id: ProductSurfaceId): ProductSurface {
    const surface = byId.get(id);
    if (!surface) throw new Error(`Unbekannte Produktfläche: ${id}`);
    return surface;
  }

  function isAvailable(id: ProductSurfaceId): boolean {
    const surface = get(id);
    if (surface.maturity === "core") return true;
    if (surface.maturity === "labs") return labsEnabled;
    return surface.environmentSwitch ? isExplicitlyEnabled(environment[surface.environmentSwitch]) : false;
  }

  return {
    labsEnabled,
    list: () => surfaces.map((surface) => ({ ...surface })),
    get: (id) => ({ ...get(id) }),
    isAvailable,
    isMainNavigationVisible: (id) => get(id).mainNavigation && isAvailable(id),
  };
}

export const productSurfaces = createProductSurfaceRegistry((import.meta.env ?? {}) as ProductSurfaceEnvironment);
