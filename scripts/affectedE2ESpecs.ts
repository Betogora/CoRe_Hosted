import { CATALOG_SPECS } from "../tests/e2e/support/catalogSpecs.ts";

export type AffectedE2ESpecs = { full: true } | { full: false; supabase: string[]; rls: boolean };

const FULL_RUN = [
  /^tests\/e2e\/support\//, /^tests\/e2e\/auth\.setup\.ts$/, /^playwright(?:\.[a-z]+)?\.config\.ts$/,
  /^scripts\/(?:runLocalE2E|localE2EEnvironment|affectedE2ESpecs)\.ts$/, /^package(?:-lock)?\.json$/,
  /^(?:vite|tailwind)\.config\.ts$/, /^index\.html$/, /^supabase\//, /^src\/(?:App|main)\.tsx$/,
  /^src\/(?:styles\.css|coreTypes\.ts|database\.types\.ts)$/,
];
// The catalog pages and their generator only feed the catalog flows, which the job `catalog-e2e` runs completely on every pull request.
const IGNORED = [/\.test\.tsx?$/, /\.md$/, /^\.github\//, /^docs\//, /^scripts\/(?:uiCatalog\w*|generateDocs|docsSite)\.\w+$/, /^fixtures\/apkg\/corpus\//];
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
  [/apkg|Apkg|[Tt]extImport|media|Media|zipReader|sqliteReader|importRetranslation|[Ii]mportSession|InterruptedImport/, ["apkg-quality-report", "first-learning", "zz-media-import", "batch-resilience", "world-capitals-hierarchy", "product-surfaces"]],
  [/cloud|Cloud|sync|Sync|coreRepository|accountDatabase|accountStorage|offline/, ["batch-resilience", "card-lifecycle", "core-stabilization", "navigation-context", "exam-planning", "auth-resilience", "zz-media-import"]],
  [/appNavigation|AppNavigation|menuModel|appRoute/, ["navigation-context", "product-surfaces"]],
  [/Settings|settings|learningProfiles|LearningDefaults|SaveBar/, ["product-surfaces", "core-stabilization"]],
  [/[Cc]reation|coreModel|cardEditor|NoteContentEditor|[Rr]ichText|[Tt]ag(?:Input|Directory)/, ["card-lifecycle", "batch-resilience", "first-learning", "ai-source-creation"]],
  [/Simulator|DatePicker/, ["core-stabilization"]],
  [/Help/, ["product-surfaces"]],
  [/pomodoro|Pomodoro/, ["product-surfaces", "core-stabilization"]],
];

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
