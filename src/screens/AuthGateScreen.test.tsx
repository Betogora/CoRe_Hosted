import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthGateScreen } from "./AuthGateScreen.tsx";

test("auth gate exposes named fields, a busy state and a non-duplicated alert region", () => {
  const markup = renderToStaticMarkup(
    <AuthGateScreen
      busy
      message="E-Mail oder Passwort stimmt nicht."
      messageType="alert"
      onSignIn={() => undefined}
    />,
  );

  assert.match(markup, /<form[^>]*aria-busy="true"/);
  assert.match(markup, />E-Mail</);
  assert.match(markup, />Passwort</);
  assert.match(markup, /<h2[^>]*>Login<\/h2>/);
  assert.match(markup, /Anmelden läuft/);
  assert.doesNotMatch(markup, /<button[^>]*type="button"[^>]*>\s*Anmelden\s*<\/button>/);
  assert.equal(markup.match(/<input\b[^>]*class="core-field/g)?.length, 2);
  assert.match(markup, /role="alert"/);
  assert.doesNotMatch(markup, /aria-live="assertive"/);
  assert.match(markup, /<main class="core-centered-viewport grid min-h-dvh/);
  assert.match(markup, /<div class="mb-8 text-center"><img src="\/core-socrates\.svg" alt="" class="mx-auto mb-5[^"]*"[^>]*><h1[^>]*><span class="font-bold text-core-text">Co<span class="text-core-action">Re<\/span><\/span><\/h1>/);
  assert.match(markup, /<div class="mt-4 flex flex-wrap justify-center gap-2">/);
  assert.doesNotMatch(markup, /core-auth-(?:shell|frame)|rounded-\[22px\]|backdrop-blur-xl/);
});
