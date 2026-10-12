import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_CARD_VARIANT_DEADLINE_MS,
  AI_CARD_VARIANT_ENDPOINT,
  AI_CARD_VARIANT_PROMPT_VERSION,
  AiCardVariantContractError,
  aiCardVariantSourceKey,
  createAiCardVariantRequest,
  normalizeAiCardText,
  parseAiCardVariantError,
  parseAiCardVariantSuccess,
  type AiCardVariantSuccess,
} from "./aiCardVariantContract.ts";
import { cardVariantSource } from "./coreVariantService.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { Database } from "./database.types.ts";

/** `avoid` carries the questions of the card's variants so the new one differs from them. */
export async function requestAiCardVariant(
  source: { front: string; back: string } | null,
  supabase: SupabaseClient<Database> | null,
  { avoid = [], fetchImpl = globalThis.fetch }: { avoid?: string[]; fetchImpl?: typeof fetch } = {},
): Promise<AiCardVariantSuccess> {
  const request = createAiCardVariantRequest(source, avoid);
  if (!supabase) throw new AiCardVariantContractError("auth_unavailable", "Die Anmeldung ist noch nicht bereit.");

  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new AiCardVariantContractError("unauthorized", "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
  }

  let response: Response;
  let body: unknown;
  try {
    response = await fetchImpl(AI_CARD_VARIANT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      // The route ends itself after its deadline; the margin covers authentication and network.
      signal: AbortSignal.timeout(AI_CARD_VARIANT_DEADLINE_MS + 5_000),
    });
    body = await response.json().catch(() => null);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new AiCardVariantContractError("timeout", "Die Generierung hat zu lange gedauert. Bitte versuche es erneut.");
    }
    throw new AiCardVariantContractError("network_error", "Die Variante konnte nicht angefordert werden. Prüfe deine Verbindung.");
  }
  if (!response.ok) {
    const parsedError = parseAiCardVariantError(body);
    throw new AiCardVariantContractError(
      parsedError.success ? parsedError.output.error.code : "request_failed",
      parsedError.success ? parsedError.output.error.message : "Die Variante konnte nicht generiert werden.",
    );
  }

  const parsed = parseAiCardVariantSuccess(body);
  if (!parsed.success) throw new AiCardVariantContractError("invalid_response", "Die generierte Antwort hatte ein ungültiges Format.");
  return parsed.output;
}

/**
 * Questions the new variant must differ from: existing variants first, then deleted ones, each newest first.
 * Deleted phrasings count as duplicates in `createAiGeneratedVariantDraft`, so the model has to know them too.
 */
export function aiCardVariantAvoidTexts(card: Pick<Card, "variants">): string[] {
  return [...card.variants]
    .sort((left, right) => Number(Boolean(left.deletedAt)) - Number(Boolean(right.deletedAt)) || right.createdAt.localeCompare(left.createdAt))
    .map((variant) => variant.front);
}

/** Rejects the response when question or answer changed meanwhile or the rephrasing already exists, deleted ones included. */
export function createAiGeneratedVariantDraft(
  source: { front: string; back: string },
  current: { note: Note; card: Card } | null | undefined,
  generated: AiCardVariantSuccess,
) {
  if (!current) {
    throw new AiCardVariantContractError("source_changed", "Die Karte wurde während der Generierung geändert. Bitte starte sie erneut.");
  }
  const currentSource = cardVariantSource(current.note, current.card);
  if (!currentSource || aiCardVariantSourceKey(createAiCardVariantRequest(currentSource).source) !== aiCardVariantSourceKey(createAiCardVariantRequest(source).source)) {
    throw new AiCardVariantContractError("source_changed", "Die Karte wurde während der Generierung geändert. Bitte starte sie erneut.");
  }
  const variant = {
    front: normalizeAiCardText(generated.variant.front),
    back: normalizeAiCardText(generated.variant.back),
  };
  const generatedKey = aiCardVariantSourceKey(variant);
  const duplicate = current.card.variants.some((candidate) => aiCardVariantSourceKey({
    front: normalizeAiCardText(candidate.front),
    back: normalizeAiCardText(candidate.back),
  }) === generatedKey);
  if (duplicate) throw new AiCardVariantContractError("duplicate_variant", "Diese Variante gibt es schon. Bitte erneut generieren.");

  return {
    ...variant,
    variantLevel: 2,
    qualityStatus: "active" as const,
    isActive: true,
    meta: {
      generationSource: "ai_generated" as const,
      source: "openrouter",
      model: generated.model,
      privacyMode: generated.privacyMode,
      promptVersion: AI_CARD_VARIANT_PROMPT_VERSION,
    },
  };
}
