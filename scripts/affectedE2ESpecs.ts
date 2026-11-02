import { CATALOG_SPECS } from "../tests/e2e/support/catalogSpecs.ts";

export type AffectedE2ESpecs = { full: true } | { full: false; catalog: string[]; supabase: string[] };

// Changes here can break every flow; the affected gate falls back to the full release suite.
const FULL_RUN = [
  /^tests\/e2e\/support\//, /^tests\/e2e\/auth\.setup\.ts$/, /^playwright(?:\.[a-z]+)?\.config\.ts$/,
  /^scripts\/(?:runLocalE2E|localE2EEnvironment|affectedE2ESpecs)\.ts$/, /^package(?:-lock)?\.json$/,
  /^(?:vite|tailwind)\.config\.ts$/, /^index\.html$/, /^supabase\//, /^src\/(?:App|main)\.tsx$/,
  /^src\/(?:styles\.css|coreTypes\.ts|database\.types\.ts)$/,
];
const IGNORED = [/\.test\.tsx?$/, /\.md$/, /^tests\/rls\//, /^\.github\//, /^docs\/(?!ui-elements\.html$|card-types\.html$)/, /^fixtures\/apkg\/corpus\//];
// The catalog pages and their generator only feed the Supabase-free catalog flows.
const CATALOG_SOURCES = /^(?:docs\/(?:ui-elements|card-types)\.html|scripts\/(?:uiCatalog\w*|generateDocs|docsSite)\.\w+)$/;
const AREAS: [RegExp, string[]][] = [
  [/[Ss]ummar/, ["learning-summaries", "navigation-context"]],
  [/mindMap|MindMap/, ["mindmaps", "navigation-context"]],
  [/exam|Exam/, ["exam-planning", "exam-contact-planning", "exam-topic-order"]],
  [/dashboard|Dashboard|Heatmap|heatmap|statistic|Statistic|[Dd]ailyMotivation|[Bb]rainMascot/, ["dashboard-widgets", "core-stabilization", "world-capitals-hierarchy"]],
  [/aiSource|AiSource|aiRoute|[Vv]ariant|pdf|^api\/|^server\//, ["ai-source-creation", "card-lifecycle", "core-stabilization"]],
  [/notePresentation|NoteCardContent|presentationFrame|CardPresentation|CardPreview|noteMath/, ["note-presentation", "card-lifecycle"]],
  [/deck|Deck|libraryModel|cardSearch|LearningArea/, ["deck-ui-restoration", "dashboard-widgets", "world-capitals-hierarchy", "navigation-context"]],
  [/StudyMode|StudySession|LearnScreen|[Ss]cheduler|studyQueue|[Rr]eview|learningDay|siblingBury|easyDays|simulationClock/, ["first-learning", "card-lifecycle", "core-stabilization"]],
  [/auth|Auth/, ["auth-gate", "auth-lifecycle", "auth-resilience"]],
  [/apkg|Apkg|media|Media|zipReader|sqliteReader|importRetranslation|importUiState/, ["apkg-quality-report", "first-learning", "zz-media-import", "batch-resilience", "world-capitals-hierarchy"]],
  [/cloud|Cloud|sync|Sync|coreRepository|accountDatabase|accountStorage|offline/, ["batch-resilience", "card-lifecycle", "core-stabilization", "navigation-context", "exam-planning", "auth-resilience", "zz-media-import"]],
  [/appNavigation|AppNavigation|menuModel|InPageNavigation|appRoute/, ["navigation-context", "product-surfaces"]],
  [/Settings|settings|learningProfiles|LearningDefaults|SaveBar/, ["product-surfaces", "core-stabilization"]],
  [/[Cc]reation|coreModel|cardEditor|NoteContentEditor|[Rr]ichText|[Tt]ag(?:Input|Directory)/, ["card-lifecycle", "batch-resilience", "first-learning", "ai-source-creation"]],
  [/Simulator|DatePicker/, ["core-stabilization"]],
  [/Help/, ["product-surfaces"]],
  [/pomodoro|Pomodoro/, ["product-surfaces", "core-stabilization"]],
];

/** Maps changed repository paths to the browser specs that exercise them; unknown product sources fall back to the full suite. */
export function affectedE2ESpecs(changedFiles: readonly string[]): AffectedE2ESpecs {
  const specs = new Set<string>();
  for (const file of changedFiles.map((path) => path.replaceAll("\\", "/"))) {
    const spec = file.match(/^tests\/e2e\/([\w-]+)\.spec\.ts$/)?.[1];
    if (spec) { specs.add(spec); continue; }
    if (FULL_RUN.some((pattern) => pattern.test(file))) return { full: true };
    if (IGNORED.some((pattern) => pattern.test(file))) continue;
    if (CATALOG_SOURCES.test(file)) { CATALOG_SPECS.forEach((name) => specs.add(name)); continue; }
    const areas = AREAS.filter(([pattern]) => pattern.test(file)).flatMap(([, names]) => names);
    if (areas.length) areas.forEach((name) => specs.add(name));
    else if (file.startsWith("src/ui/")) [...CATALOG_SPECS, "product-surfaces"].forEach((name) => specs.add(name));
    else if (/^(?:src|api|server|public)\//.test(file)) return { full: true };
  }
  const sorted = [...specs].sort();
  return { full: false, catalog: sorted.filter((name) => CATALOG_SPECS.includes(name)), supabase: sorted.filter((name) => !CATALOG_SPECS.includes(name)) };
}
