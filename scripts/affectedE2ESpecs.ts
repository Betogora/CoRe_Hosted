import { CATALOG_SPECS } from "../tests/e2e/support/catalogSpecs.ts";

export type AffectedE2ESpecs = { full: true } | { full: false; supabase: string[]; rls: boolean };

// Fixed lists instead of Playwright's `--shard`, which balances by test count rather than by measured seconds.
export const SUPABASE_SHARDS = [
  ["core-stabilization", "batch-resilience", "exam-planning", "auth-gate"],
  ["card-lifecycle", "product-surfaces", "apkg-quality-report", "zz-media-import", "auth-resilience"],
  ["navigation-context", "world-capitals-hierarchy", "first-learning", "auth-lifecycle"],
];

const FULL_RUN = [
  /^tests\/e2e\/support\//, /^tests\/e2e\/auth\.setup\.ts$/, /^playwright(?:\.[a-z]+)?\.config\.ts$/,
  /^scripts\/(?:runLocalE2E|localE2EEnvironment|affectedE2ESpecs)\.ts$/, /^package(?:-lock)?\.json$/,
  /^(?:vite|tailwind|postcss)\.config\.ts$/, /^index\.html$/, /^supabase\//, /^src\/(?:App|main)\.tsx$/,
  /^src\/(?:coreTypes\.ts|database\.types\.ts)$/, /^tests\/support\/seedAccountState\.ts$/, /^library\/world-capitals\//,
];
// `appScreenProps.ts` holds only types, which the typecheck covers.
const IGNORED = [/\.test\.tsx?$/, /\.md$/, /^\.github\//, /^docs\//, /^fixtures\/apkg\/corpus\//, /^src\/appScreenProps\.ts$/];
const AREAS: [RegExp, string[]][] = [
  // The layout-heavy Supabase specs; `catalog-e2e` checks the catalog flows and `nightly-core` all others.
  [/^src\/styles\.css$/, ["product-surfaces", "core-stabilization", "world-capitals-hierarchy", "navigation-context"]],
  [/\/cardList\/|duplicateContents/, ["card-lifecycle", "navigation-context"]],
  [/[Ss]ummar/, ["navigation-context"]],
  [/mindMap|MindMap/, ["navigation-context"]],
  [/[Ee]xam(?!ple)/, ["exam-planning"]],
  [/dashboard|Dashboard|Heatmap|heatmap|statistic|Statistic|[Dd]ailyMotivation|[Bb]rainMascot/, ["core-stabilization", "world-capitals-hierarchy"]],
  [/aiSource|AiSource|aiRoute|[Vv]ariant|pdf|documentModel|^api\/|^server\//, ["card-lifecycle", "core-stabilization"]],
  [/notePresentation|NoteCardContent|presentationFrame|CardPresentation|CardPreview|noteMath/, ["card-lifecycle"]],
  [/deck|Deck|libraryModel|cardSearch|catalogSearch|LearningArea/, ["world-capitals-hierarchy", "navigation-context"]],
  [/StudyMode|StudySession|[Ss]tudy(?:Start|Preparation)|LearnScreen|[Ss]cheduler|studyQueue|(?<![Pp])[Rr]eview|learningDay|siblingBury|easyDays|simulationClock/, ["first-learning", "card-lifecycle", "core-stabilization"]],
  [/auth|Auth/, ["auth-gate", "auth-lifecycle", "auth-resilience"]],
  [/apkg|Apkg|[Tt]extImport|media|Media|zipReader|sqliteReader|importRetranslation|[Ii]mportSession|InterruptedImport|importCommands|ImportCommit/, ["apkg-quality-report", "first-learning", "zz-media-import", "batch-resilience", "world-capitals-hierarchy", "product-surfaces"]],
  [/cloud|Cloud|sync|Sync|[Cc]oreRepository|indexedDb|[Hh]ydration|workspaceReplica|accountDatabase|accountStorage|offline/, ["batch-resilience", "card-lifecycle", "core-stabilization", "navigation-context", "exam-planning", "auth-resilience", "zz-media-import"]],
  [/appNavigation|AppNavigation|menuModel|appRoute/, ["navigation-context", "product-surfaces"]],
  [/NavigationGuard/, ["navigation-context", "product-surfaces", "exam-planning", "batch-resilience"]],
  // Only the sign-up flow starts an account without a stored profile row.
  [/profileIntegrity|[Cc]oreRepository/, ["auth-lifecycle"]],
  [/Settings|settings|learningProfiles|LearningDefaults|SaveBar|uiPreferences|profileIntegrity|fieldTimings/, ["product-surfaces", "core-stabilization"]],
  [/[Cc]reation|coreModel|cardCommands|cardBatchActions|clozeSyntax|cardEditor|NoteContentEditor|[Rr]ichText|[Tt]ag(?:Input|Directory)/, ["card-lifecycle", "batch-resilience", "first-learning"]],
  [/Simulator|DatePicker/, ["core-stabilization"]],
  [/Help|\/help\//, ["product-surfaces"]],
  [/pomodoro|Pomodoro/, ["product-surfaces", "core-stabilization"]],
];

/** `specs: null` runs every spec; `primary` is the first shard, or the only run without sharding. */
export function shardSelection(selection: AffectedE2ESpecs, shard: number | null) {
  const own = shard === null ? null : SUPABASE_SHARDS[shard - 1];
  if (shard !== null && !own) throw new Error(`Unbekannter Supabase-Shard ${shard}; erlaubt sind 1 bis ${SUPABASE_SHARDS.length}.`);
  const primary = shard === null || shard === 1;
  if (selection.full) return { full: true, specs: own ? [...own] : null, rls: primary, primary };
  return { full: false, specs: selection.supabase.filter((name) => !own || own.includes(name)), rls: primary && selection.rls, primary };
}

export function affectedE2ESpecs(changedFiles: readonly string[]): AffectedE2ESpecs {
  const specs = new Set<string>();
  let rls = false;
  for (const file of changedFiles.map((path) => path.replaceAll("\\", "/"))) {
    if (file.startsWith("tests/rls/")) { rls = true; continue; }
    const spec = file.match(/^tests\/e2e\/([\w-]+)\.spec\.ts$/)?.[1];
    if (spec) { specs.add(spec); continue; }
    if (FULL_RUN.some((pattern) => pattern.test(file))) return { full: true };
    if (IGNORED.some((pattern) => pattern.test(file))) continue;
    const areas = AREAS.filter(([pattern]) => pattern.test(file)).flatMap(([, names]) => names);
    if (areas.length) areas.forEach((name) => specs.add(name));
    else if (file.startsWith("src/ui/")) specs.add("product-surfaces");
    else if (/^(?:src|api|server|public)\//.test(file)) return { full: true };
  }
  return { full: false, supabase: [...specs].filter((name) => !CATALOG_SPECS.includes(name)).sort(), rls };
}
