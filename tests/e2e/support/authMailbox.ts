import { isLocalSupabaseUrl } from "../../../scripts/localE2EEnvironment.ts";

interface MailpitAddress {
  Address?: unknown;
  Email?: unknown;
}

interface MailpitMessageSummary {
  ID?: unknown;
  Subject?: unknown;
  To?: unknown;
}

interface MailpitMessage extends MailpitMessageSummary {
  HTML?: unknown;
  Text?: unknown;
}

type FetchLike = typeof fetch;

function assertLocalMailpitUrl(mailpitUrl: string) {
  const normalized = String(mailpitUrl ?? "").trim().replace(/\/$/, "");
  if (!isLocalSupabaseUrl(normalized)) throw new Error("Mailpit-Zugriffe sind nur über eine Loopback-URL erlaubt.");
  return normalized;
}

async function readJson(response: Response, operation: string) {
  if (!response.ok) throw new Error(`${operation} ist mit HTTP ${response.status} fehlgeschlagen.`);
  return response.json();
}

function recipientAddresses(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: MailpitAddress | string) => {
    if (typeof entry === "string") return [entry.toLowerCase()];
    const address = entry?.Address ?? entry?.Email;
    return typeof address === "string" ? [address.toLowerCase()] : [];
  });
}

export async function clearAuthMailbox(mailpitUrl: string, fetchImplementation: FetchLike = fetch) {
  const baseUrl = assertLocalMailpitUrl(mailpitUrl);
  const response = await fetchImplementation(`${baseUrl}/api/v1/messages`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`Mailpit konnte nicht geleert werden (HTTP ${response.status}).`);
}

export async function waitForAuthEmail(
  mailpitUrl: string,
  options: { recipient: string; subject?: RegExp; timeoutMs?: number },
  fetchImplementation: FetchLike = fetch,
) {
  const baseUrl = assertLocalMailpitUrl(mailpitUrl);
  const recipient = options.recipient.trim().toLowerCase();
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);

  while (Date.now() < deadline) {
    const listResponse = await fetchImplementation(`${baseUrl}/api/v1/messages?start=0&limit=100`);
    const payload = await readJson(listResponse, "Mailpit-Nachrichtenabfrage") as { messages?: unknown };
    const messages = Array.isArray(payload.messages) ? payload.messages as MailpitMessageSummary[] : [];
    const match = messages.find((message) => {
      const subject = typeof message.Subject === "string" ? message.Subject : "";
      return recipientAddresses(message.To).includes(recipient) && (!options.subject || options.subject.test(subject));
    });

    if (match && typeof match.ID === "string") {
      const messageResponse = await fetchImplementation(`${baseUrl}/api/v1/message/${encodeURIComponent(match.ID)}`);
      return await readJson(messageResponse, "Mailpit-Nachrichteninhalt") as MailpitMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Keine Auth-E-Mail für ${recipient} innerhalb des Zeitlimits gefunden.`);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

export function extractAuthConfirmationUrl(message: MailpitMessage) {
  const content = [message.HTML, message.Text].filter((value): value is string => typeof value === "string").join("\n");
  const urls = decodeHtmlEntities(content).match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const confirmationUrl = urls.find((url) => url.includes("/auth/v1/verify"));
  if (!confirmationUrl) throw new Error("Die Auth-E-Mail enthält keinen Supabase-Bestätigungslink.");
  return confirmationUrl;
}
