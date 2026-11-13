import { CARD_VARIANT_CANDIDATE_QUERY } from "../cardVariantBatch.ts";
import { VariantGenerationBar } from "../ui/VariantGenerationBar.tsx";
import { useAppServices } from "../useAppServices.ts";

/** The app-wide bar of the running AI variant action; after one that left cards without a variant it leads to them. */
export function VariantGenerationBarWiring() {
  const { variantBatch, navigation } = useAppServices();
  const { batch } = variantBatch;
  if (!batch) return null;
  return (
    <VariantGenerationBar
      deck={batch.deck}
      title={batch.mode === "refresh" ? "Varianten neu generieren" : "Varianten generieren"}
      done={batch.done}
      total={batch.total}
      outcome={batch.outcome}
      onCancel={variantBatch.cancel}
      onClose={variantBatch.dismiss}
      onShow={batch.mode === "missing" ? () => {
        navigation.navigateToViewNow("kartenstapel", { cardQuery: `did:${batch.deck.id} ${CARD_VARIANT_CANDIDATE_QUERY.missing}` });
        variantBatch.dismiss();
      } : undefined}
    />
  );
}
