/**
 * Stands in for `@supabase/realtime-js` in the browser build (alias in `vite.config.ts`). CoRe syncs through RPCs
 * and opens no Realtime channels, so `createClient` gets a client without WebSocket code. A channel request fails
 * loudly instead of silently never delivering.
 */
export class RealtimeClient {
  setAuth(): Promise<void> {
    return Promise.resolve();
  }

  channel(): never {
    throw new Error("Realtime ist in CoRe nicht eingebunden.");
  }

  getChannels(): [] {
    return [];
  }

  removeChannel(): Promise<"ok"> {
    return Promise.resolve("ok");
  }

  removeAllChannels(): Promise<[]> {
    return Promise.resolve([]);
  }
}
