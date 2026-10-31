import { spawn } from "node:child_process";

const NPM_CLI_PATH = String(process.env.npm_execpath ?? "").trim();

const STEPS = [
  { label: "Typecheck", script: ["run", "typecheck"] },
  { label: "Dokumentation", script: ["run", "check:docs"] },
  { label: "Modultests", script: ["test", "--", "--compact"] },
  { label: "Build und Bundlebudgets", script: ["run", "build"] },
] as const;

function runStep(script: readonly string[]) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [NPM_CLI_PATH, ...script], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output: Buffer.concat(chunks).toString("utf8") }));
  });
}

if (!NPM_CLI_PATH) throw new Error("Das Gate startet nur über npm (npm run gate:push).");
const started = performance.now();
const failures: string[] = [];
await Promise.all(STEPS.map(async ({ label, script }) => {
  const stepStarted = performance.now();
  const { code, output } = await runStep(script);
  const seconds = ((performance.now() - stepStarted) / 1000).toFixed(1);
  process.stdout.write(`\n── ${label}: ${code === 0 ? "bestanden" : "fehlgeschlagen"} nach ${seconds} s ──\n${output}`);
  if (code !== 0) failures.push(label);
}));
console.log(`\nQuality-Gate nach ${((performance.now() - started) / 1000).toFixed(1)} s: ${failures.length ? `fehlgeschlagen (${failures.join(", ")})` : "bestanden"}.`);
if (failures.length) process.exitCode = 1;
