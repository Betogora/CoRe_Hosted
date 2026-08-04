import type { SupabaseClient } from "@supabase/supabase-js";
import {
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
import { getCardContentPayload } from "./coreModel.ts";
import type { CardContentPayload, LearningItem } from "./coreTypes.ts";
import type { Database } from "./database.types.ts";

export async function requestAiCardVariant(
  payload: CardContentPayload,
  supabase: SupabaseClient<Database> | null,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AiCardVariantSuccess> {
  const request = createAiCardVariantRequest(payload);
  if (!supabase) throw new AiCardVariantContractError("auth_unavailable", "Die Anmeldung ist noch nicht bereit.");

  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new AiCardVariantContractError("unauthorized", "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
  }

  let response: Response;
  try {
    response = await fetchImpl(AI_CARD_VARIANT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new AiCardVariantContractError("network_error", "Die KI-Variante konnte nicht angefordert werden. Prüfe deine Verbindung.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AiCardVariantContractError("invalid_response", "Die KI-Antwort konnte nicht gelesen werden.");
  }
  if (!response.ok) {
    const parsedError = parseAiCardVariantError(body);
    throw new AiCardVariantContractError(
      parsedError.success ? parsedError.output.error.code : "request_failed",
      parsedError.success ? parsedError.output.error.message : "Die KI-Variante konnte nicht erstellt werden.",
    );
  }

  const parsed = parseAiCardVariantSuccess(body);
  if (!parsed.success) throw new AiCardVariantContractError("invalid_response", "Die KI-Antwort hatte ein ungültiges Format.");
  return parsed.output;
}

export function createAiGeneratedVariantDraft(
  sourcePayload: CardContentPayload,
  currentCard: LearningItem | null | undefined,
  generated: AiCardVariantSuccess,
) {
  if (!currentCard) {
    throw new AiCardVariantContractError("source_changed", "Die Karte wurde während der Erstellung geändert. Bitte starte die KI-Variante erneut.");
  }
  const currentPayload = getCardContentPayload(currentCard);
  if (!currentPayload || aiCardVariantSourceKey(createAiCardVariantRequest(currentPayload).source) !== aiCardVariantSourceKey(createAiCardVariantRequest(sourcePayload).source)) {
    throw new AiCardVariantContractError("source_changed", "Die Karte wurde während der Erstellung geändert. Bitte starte die KI-Variante erneut.");
  }
  const variant = {
    front: normalizeAiCardText(generated.variant.front),
    back: normalizeAiCardText(generated.variant.back),
  };
  const generatedKey = aiCardVariantSourceKey(variant);
  const duplicate = currentCard.variants.some((candidate) => !candidate.isOriginal && aiCardVariantSourceKey({
    front: normalizeAiCardText(candidate.front),
    back: normalizeAiCardText(candidate.back),
  }) === generatedKey);
  if (duplicate) throw new AiCardVariantContractError("duplicate_variant", "Diese Kartenvariante ist bereits vorhanden.");

  return {
    ...variant,
    variantLevel: 2,
    generationSource: "ai_generated" as const,
    qualityStatus: "active" as const,
    isActive: true,
    meta: {
      source: "openrouter",
      model: generated.model,
      privacyMode: generated.privacyMode,
      promptVersion: AI_CARD_VARIANT_PROMPT_VERSION,
    },
  };
}
