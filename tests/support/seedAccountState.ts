import type { SupabaseClient } from "@supabase/supabase-js";
import { saveCloudProfile } from "../../src/cloudAuth.ts";
import { createCloudStateRows } from "../../src/cloudRepository.ts";

const DELETE_ORDER = ["media_assets", "review_events", "card_variants", "cards", "decks", "note_type_definitions"] as const;

export async function seedAccountState(client: SupabaseClient, state: any, deviceId: string) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Testaccount fehlt.");
  for (const table of DELETE_ORDER) {
    const result = await client.from(table).delete().eq("user_id", data.user.id);
    if (result.error) throw result.error;
  }

  const rows = createCloudStateRows(state, data.user.id, { deviceId });
  await saveCloudProfile(client, state.profile ?? {});
  for (const table of ["decks", "note_type_definitions", "cards", "card_variants"] as const) {
    if (!rows[table].length) continue;
    const result = await client.from(table).insert(rows[table].map((row: any) => ({ ...row, revision: 1, updated_by_device_id: deviceId })));
    if (result.error) throw result.error;
  }
  if (rows.review_events.length) {
    const result = await client.from("review_events").insert(rows.review_events);
    if (result.error) throw result.error;
  }

  return {
    ...state,
    decks: (state.decks ?? []).map((deck: any) => ({
      ...deck,
      revision: 1,
      updatedByDeviceId: deviceId,
      cards: (deck.cards ?? []).map((card: any) => ({
        ...card,
        revision: 1,
        updatedByDeviceId: deviceId,
        variants: (card.variants ?? []).map((variant: any) => ({ ...variant, revision: 1, updatedByDeviceId: deviceId })),
      })),
    })),
  };
}
