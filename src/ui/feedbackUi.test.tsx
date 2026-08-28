import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusMessage, SuccessToast } from "./feedbackUi.tsx";

test("StatusMessage maps every tone and keeps color-independent visible content", () => {
  for (const tone of ["info", "success", "warning", "error"] as const) {
    const markup = renderToStaticMarkup(<StatusMessage tone={tone}>{tone} message</StatusMessage>);
    assert.match(markup, new RegExp(`core-status-${tone}`));
    assert.match(markup, new RegExp(`${tone} message`));
    assert.match(markup, /aria-hidden="true"/);
    assert.doesNotMatch(markup, /role=/);
  }
});

test("StatusMessage owns polite and assertive announcement semantics", () => {
  const polite = renderToStaticMarkup(<StatusMessage tone="info" announce="polite">Bereit</StatusMessage>);
  const assertive = renderToStaticMarkup(<StatusMessage tone="error" announce="assertive">Fehler</StatusMessage>);
  assert.match(polite, /role="status"/);
  assert.match(polite, /aria-live="polite"/);
  assert.match(assertive, /role="alert"/);
  assert.doesNotMatch(assertive, /aria-live=/);
});

test("SuccessToast renders a top-right success overlay with a dismiss action", () => {
  const markup = renderToStaticMarkup(<SuccessToast onDismiss={() => undefined}>Stapel erfolgreich angelegt.</SuccessToast>);

  assert.match(markup, /data-success-toast-region="true"/);
  assert.match(markup, /data-appearance="success"/);
  assert.match(markup, /core-success-toast/);
  assert.match(markup, /fixed/);
  assert.match(markup, /right-4/);
  assert.match(markup, /sm:right-8/);
  assert.match(markup, /!w-fit/);
  assert.match(markup, /max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(markup, /!items-center/);
  assert.match(markup, /\[&amp;&gt;svg\]:!mt-0/);
  assert.doesNotMatch(markup, /sm:max-w-xl|sm:w-full|inset-x-4/);
  assert.match(markup, /core-status-success/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-label="Erfolgsmeldung schließen"/);
  assert.match(markup, /Stapel erfolgreich angelegt\./);
});

test("SuccessToast can keep a completed settings save visually neutral", () => {
  const markup = renderToStaticMarkup(<SuccessToast appearance="neutral" onDismiss={() => undefined}>Einstellungen wurden gespeichert.</SuccessToast>);

  assert.match(markup, /data-appearance="neutral"/);
  assert.match(markup, /core-status-success/);
  assert.match(markup, /role="status"/);
});

test("SuccessToast fades away after ten seconds with compositor-friendly properties", () => {
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.core-success-toast\[data-appearance="neutral"\][\s\S]*?background: var\(--core-surface-raised\)/);

  assert.match(styles, /@keyframes core-success-toast-dismiss\s*{[\s\S]*?opacity: 0;[\s\S]*?transform: translateY\(-0\.375rem\);[\s\S]*?}/);
  assert.match(styles, /\.core-success-toast\s*{\s*animation: core-success-toast-dismiss 200ms ease-out 10s forwards;\s*}/);
});
