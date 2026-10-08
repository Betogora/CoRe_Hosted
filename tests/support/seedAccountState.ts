import type { SupabaseClient } from "@supabase/supabase-js";
import { saveCloudProfile } from "../../src/cloudAuth.ts";
import { createCloudStateRows } from "../../src/cloudRepository.ts";

const DELETE_ORDER = ["media_files", "review_events", "card_variants", "cards", "note_sources", "notes", "note_type_sources", "decks"] as const;
const INSERT_ORDER = ["decks", "note_type_sources", "notes", "note_sources", "cards", "card_variants"] as const;

export async function seedAccountState(client: SupabaseClient, state: any, deviceId: string) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Testaccount fehlt.");
  for (const table of DELETE_ORDER) {
    const result = await client.from(table).delete().eq("user_id", data.user.id);
    if (result.error) throw result.error;
  }

  const rows = createCloudStateRows(state, data.user.id, { deviceId });
  await saveCloudProfile(client, state.profile ?? {});
  for (const table of INSERT_ORDER) {
    if (!rows[table].length) continue;
    const result = await client.from(table).insert(rows[table].map((row: any) => ({ ...row, revision: 1, updated_by_device_id: deviceId })));
    if (result.error) throw result.error;
  }
  if (rows.review_events.length) {
    const result = await client.from("review_events").insert(rows.review_events);
    if (result.error) throw result.error;
  }

  const seeded = <T extends object>(entity: T) => ({ ...entity, revision: 1, updatedByDeviceId: deviceId });
  return {
    ...state,
    notes: (state.notes ?? []).map(seeded),
    decks: (state.decks ?? []).map((deck: any) => ({
      ...seeded(deck),
      cards: (deck.cards ?? []).map((card: any) => ({
        ...seeded(card),
        variants: (card.variants ?? []).map(seeded),
      })),
    })),
  };
}
