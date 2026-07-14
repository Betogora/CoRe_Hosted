import { APKG_IMPORT_REQUEST_MAX_BYTES, parseApkgImportAction } from "../../src/serverApkgImportContract.ts";
import { ApkgJobError, createApkgJobService, type ApkgJobService } from "./apkgJobs.ts";

function firstHeader(value: unknown): string {
  return String(Array.isArray(value) ? value[0] : value ?? "").split(",")[0].trim();
}

function allowedOrigin(req: any): boolean {
  const origin = firstHeader(req.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(req.headers?.["x-forwarded-host"] || req.headers?.host);
  const protocol = firstHeader(req.headers?.["x-forwarded-proto"]) || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  try { return Boolean(host) && new URL(origin).origin === `${protocol}://${host}`; } catch { return false; }
}

async function body(req: any): Promise<unknown> {
  if (req.body != null) {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > APKG_IMPORT_REQUEST_MAX_BYTES) throw new ApkgJobError(413, "request_too_large", "Die Anfrage ist zu groß.");
    try { return typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { throw new ApkgJobError(400, "invalid_json", "Die Anfrage enthält kein gültiges JSON."); }
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > APKG_IMPORT_REQUEST_MAX_BYTES) throw new ApkgJobError(413, "request_too_large", "Die Anfrage ist zu groß.");
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new ApkgJobError(400, "invalid_json", "Die Anfrage enthält kein gültiges JSON."); }
}

function send(res: any, statusCode: number, payload: unknown, headers: Record<string, string> = {}) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}

function bearer(req: any): string {
  const authorization = firstHeader(req.headers?.authorization);
  if (!authorization.startsWith("Bearer ")) throw new ApkgJobError(401, "unauthorized", "Eine Anmeldung ist erforderlich.");
  return authorization.slice(7).trim();
}

export function createApkgHandler(service: ApkgJobService = createApkgJobService()) {
  return async function handler(req: any, res: any) {
    if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { code: "method_not_allowed", message: "Nur GET und POST sind erlaubt." }, { Allow: "GET, POST" });
    if (!allowedOrigin(req)) return send(res, 403, { code: "forbidden_origin", message: "Diese Anfrage ist nicht erlaubt." });
    try {
      const userId = await service.authenticate(bearer(req));
      if (req.method === "GET") {
        const jobId = String(req.query?.jobId ?? new URL(req.url, "http://localhost").searchParams.get("jobId") ?? "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) throw new ApkgJobError(400, "invalid_request", "Eine gültige Job-ID ist erforderlich.");
        return send(res, 200, await service.get(userId, jobId));
      }
      const parsed = parseApkgImportAction(await body(req));
      if (!parsed.success) throw new ApkgJobError(400, "invalid_request", "Die Importanfrage hat ein ungültiges Format.");
      return send(res, 200, await service.act(userId, parsed.output));
    } catch (error) {
      const known = error instanceof ApkgJobError;
      send(res, known ? error.statusCode : 500, {
        code: known ? error.code : "internal_error",
        message: known ? error.message : "Der Serverimport ist fehlgeschlagen.",
      }, known && error.statusCode === 401 ? { "WWW-Authenticate": "Bearer" } : {});
    }
  };
}

export default createApkgHandler();
