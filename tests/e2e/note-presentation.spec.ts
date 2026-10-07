import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test.setTimeout(60_000);

test.beforeEach(async ({ page }) => {
  await page.goto("/docs/ui-elements.html#note-content");
  await page.getByLabel("Elemente durchsuchen", { exact: true }).fill("Vorbereitete Kartenbausteine");
  await expect(page.locator('[data-note-demo="typed"] input')).toBeVisible();
});

test("Kartenbausteine: Eintippen deckt mit Enter auf und vergleicht Zeichen", async ({ page }) => {
  const demo = page.locator('[data-note-demo="typed"]');
  await demo.getByLabel("Antwort eingeben").fill("Hertz");
  await demo.getByLabel("Antwort eingeben").press("Enter");
  await expect(demo.getByLabel("Antwort eingeben")).toHaveCount(0);
  const comparison = demo.frameLocator('iframe[title="Antwort"]').locator(".core-typed-comparison");
  await expect(comparison).toContainText("Deine Antwort Hertz");
  await expect(comparison).toContainText("Richtig Herz");
  await expect(comparison.locator(".typed-wrong")).toHaveText("t");
  await demo.getByRole("button", { name: "Zurücksetzen", exact: true }).click();
  await expect(demo.getByLabel("Antwort eingeben")).toHaveValue("");
});

test("Kartenbausteine: Single, Multiple und Kprim prüfen unterschiedliche Antwortregeln", async ({ page }) => {
  const single = page.locator('[data-note-demo="single"]');
  await single.getByRole("button", { name: "Antwortoption A: Das Herz pumpt Blut.", exact: true }).click();
  await expect(single.getByRole("status")).toHaveText("Richtig ausgewählt.");
  await single.getByRole("button", { name: "Zurücksetzen", exact: true }).click();
  await single.getByRole("button", { name: "Antwortoption B: Die Lunge produziert Blut.", exact: true }).click();
  await expect(single.getByRole("button", { name: "Antwortoption A: Das Herz pumpt Blut. (richtig)", exact: true })).toHaveClass(/border-core-success/);
  await expect(single.getByRole("button", { name: "Antwortoption B: Die Lunge produziert Blut. (falsch gewählt)", exact: true })).toHaveClass(/border-core-danger/);
  const multiple = page.locator('[data-note-demo="multiple"]');
  await multiple.getByRole("button", { name: "Antwortoption A: Das Herz pumpt Blut.", exact: true }).click();
  await multiple.getByRole("button", { name: "Antwortoption C: Blut transportiert Sauerstoff.", exact: true }).click();
  await multiple.getByRole("button", { name: "Antwort prüfen", exact: true }).click();
  await expect(multiple.getByRole("status")).toHaveText("Richtig ausgewählt.");
  const kprim = page.locator('[data-note-demo="kprim"]');
  await expect(kprim.getByRole("button", { name: "Antwort prüfen", exact: true })).toBeDisabled();
  for (let index = 0; index < 4; index += 1) await kprim.getByRole("group", { name: `Aussage ${"ABCD"[index]}`, exact: true }).getByRole("button", { name: index % 2 === 0 ? "richtig" : "falsch", exact: true }).click();
  await kprim.getByRole("button", { name: "Antwort prüfen", exact: true }).click();
  await expect(kprim.getByRole("status")).toHaveText("Richtig ausgewählt.");
  await expect(kprim.getByRole("group", { name: "Aussage A", exact: true }).getByRole("button", { name: "richtig", exact: true })).toBeDisabled();
  await expect(kprim.getByText("Lösung: falsch", { exact: true })).toHaveCount(2);
});

test("Kartenbausteine: Hinweise, einmalige Antwort, Script-Sperre und echte Auswahl im Frame", async ({ page, context }) => {
  await context.route("https://next.amboss.com/de/search?**", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>AMBOSS-Suche</body></html>" }));
  const demo = page.locator('[data-note-demo="roles"]');
  const frame = demo.frameLocator('iframe[title="Frage"]');
  await expect(frame.locator("details")).not.toHaveAttribute("open");
  await frame.locator("summary").focus();
  await frame.locator("summary").press("Enter");
  await expect(frame.locator("details")).toHaveAttribute("open");
  await demo.getByRole("button", { name: "Aufdecken", exact: true }).click();
  await expect(frame.locator("details")).toHaveAttribute("open");
  const answer = demo.frameLocator('iframe[title="Antwort"]');
  await expect(answer.locator("body")).toContainText("Insulin");
  await expect(answer.locator("body")).not.toContainText("Welches Hormon");
  await expect(answer.locator("hr")).toHaveCount(1);
  await expect(answer.locator("script")).toHaveCount(0);
  await expect(answer.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute("content", /script-src 'none'/);
  await expect(demo.getByRole("button", { name: "In AMBOSS nachschlagen", exact: true })).toHaveCount(0);
  await expect(demo.getByText("Begriff auf der Karte markieren, um ihn in AMBOSS nachzuschlagen.", { exact: true })).toBeVisible();
  await answer.locator("body").evaluate((body) => {
    const text = body.querySelector(".core-note-field")!.firstChild!;
    const range = body.ownerDocument.createRange();
    range.selectNodeContents(text);
    const selection = body.ownerDocument.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect(demo.getByRole("button", { name: "In AMBOSS nachschlagen", exact: true })).toBeEnabled();
  await expect(demo.getByText("„Insulin“", { exact: true })).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await demo.getByRole("button", { name: "In AMBOSS nachschlagen", exact: true }).click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toContain("q=Insulin");
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
});

test("Kartenbausteine: KaTeX lädt eingebettete Schriften, Diagnosen erst auf ihrer Seite", async ({ page }) => {
  const demo = page.locator('[data-note-demo="math"]');
  const question = demo.frameLocator('iframe[title="Frage"]');
  await expect(question.locator(".katex")).toHaveCount(4);
  await expect.poll(() => question.locator("style").textContent()).toContain('src:url("data:font/woff2;base64,');
  await expect.poll(() => question.locator("style").textContent()).toContain("font-family:KaTeX_Main");
  await expect.poll(() => question.locator("style").textContent()).not.toContain("url(fonts/");
  await expect(demo.getByText("Diese Formel konnte nicht dargestellt werden.", { exact: true })).toHaveCount(0);
  await demo.getByRole("button", { name: "Aufdecken", exact: true }).click();
  await expect(demo.getByText("Diese Formel konnte nicht dargestellt werden.", { exact: true })).toBeVisible();
  await expect(demo.frameLocator('iframe[title="Antwort"]').locator("code")).toContainText("unsupportedcommand");
  const richChoice = page.locator('[data-note-demo="choice-rich"]');
  await expect(richChoice.locator(".katex math mfrac")).toHaveCount(1);
  await expect(richChoice.locator(".katex .vlist").first()).toHaveAttribute("style", /height:/);
  await expect(richChoice.getByRole("img", { name: "Schematisches Herz" })).toBeVisible();
  const occlusion = page.locator('[data-note-demo="occlusion-one"]');
  await occlusion.getByRole("combobox", { name: "Abfrage", exact: true }).click();
  await page.getByRole("option", { name: "Maske 2", exact: true }).click();
  await occlusion.getByRole("button", { name: "Aufdecken", exact: true }).click();
  await expect(occlusion.frameLocator('iframe[title="Aufgedeckte Karte"]').locator("polygon.mask-outline")).toHaveCount(1);
});

test("Kartenbausteine: Audio und MP4 spielen im scriptfreien Frame, Vorlesen bleibt im Host", async ({ page }) => {
  const frame = page.locator('[data-note-demo="rich-media"]').frameLocator("iframe");
  for (const kind of ["audio", "video"]) {
    const media = frame.locator(kind);
    await media.evaluate(async (element: HTMLMediaElement) => { element.load(); await element.play(); });
    await expect.poll(() => media.evaluate((element: HTMLMediaElement) => element.currentTime)).toBeGreaterThan(0);
    expect(await media.evaluate((element: HTMLMediaElement) => element.error)).toBeNull();
    await media.evaluate((element: HTMLMediaElement) => element.pause());
  }
  const spoken: Array<{ text: string; language: string }> = [];
  await page.exposeFunction("recordNoteSpeech", (text: string, language: string) => spoken.push({ text, language }));
  await page.evaluate(() => {
    window.speechSynthesis.speak = (utterance) => { void (window as unknown as { recordNoteSpeech: (text: string, language: string) => Promise<void> }).recordNoteSpeech(utterance.text, utterance.lang); };
  });
  await page.locator('[data-note-demo="speech"]').getByRole("button", { name: "Frage vorlesen", exact: true }).click();
  await expect.poll(() => spoken).toEqual([{ text: "Herzinsuffizienz bezeichnet eine eingeschränkte Pumpfunktion des Herzens.", language: "de-DE" }]);
});

test("Kartenbausteine: visuelle Pflichtmatrix in beiden Themes und Darstellungen", async ({ page }) => {
  test.setTimeout(900_000);
  const output = path.resolve("test-results/note-presentation/matrix");
  await mkdir(output, { recursive: true });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.reload();
  await page.getByLabel("Elemente durchsuchen", { exact: true }).fill("Vorbereitete Kartenbausteine");
  // Keep only the documentation chrome from covering component screenshots.
  await page.addStyleTag({ content: ".docs-site-nav,.docs-mobile-nav{position:static!important}" });
  const sizes = [{ width: 320, height: 720 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => document.documentElement.dataset.coreTheme = value, theme);
      for (const surface of ["Review", "Vorschau"]) {
        const demos = page.locator("[data-note-demo]");
        for (const demo of await demos.all()) {
          const id = await demo.getAttribute("data-note-demo");
          await demo.getByRole("button", { name: "Zurücksetzen", exact: true }).click();
          await demo.getByRole("group", { name: "Darstellung", exact: true }).getByRole("button", { name: surface, exact: true }).click();
          await expect(demo.locator("iframe").first()).toBeVisible();
          await expect(demo.frameLocator("iframe").first().locator("body")).not.toBeEmpty();
          await demo.locator("iframe").first().evaluate(async (frame: HTMLIFrameElement) => { await frame.contentDocument?.fonts.ready; });
          const prefix = `${size.width}-${theme}-${surface === "Review" ? "review" : "preview"}-${id}`;
          await demo.screenshot({ path: path.join(output, `${prefix}-question.png`), animations: "disabled" });
          await demo.getByRole("button", { name: "Aufdecken", exact: true }).click();
          await expect(demo.getByRole("button", { name: "Aufdecken", exact: true })).toBeDisabled();
          await expect(demo.frameLocator("iframe").last().locator("body")).not.toBeEmpty();
          await demo.locator("iframe").last().evaluate(async (frame: HTMLIFrameElement) => { await frame.contentDocument?.fonts.ready; });
          await demo.screenshot({ path: path.join(output, `${prefix}-answer.png`), animations: "disabled" });
          const overflow = await demo.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
          expect(overflow, prefix).toBe(false);
        }
      }
      console.log(`Visuelle Matrix: ${size.width} × ${size.height}, ${theme}`);
    }
  }
  expect(failures).toEqual([]);
});

test("Bisheriger Kartenrahmen: Review, Inhaltsansicht und Vorschau bleiben bedienbar", async ({ page }) => {
  test.setTimeout(180_000);
  const output = path.resolve("test-results/note-presentation/existing-frames");
  await mkdir(output, { recursive: true });
  await page.getByLabel("Elemente durchsuchen", { exact: true }).fill("Karteninhalte");
  await page.addStyleTag({ content: ".docs-site-nav,.docs-mobile-nav{position:static!important}" });
  for (const size of [{ width: 320, height: 720 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => document.documentElement.dataset.coreTheme = value, theme);
      const section = page.locator("#inhalt");
      const front = section.frameLocator('iframe[title="Vorderseite"]').locator("body");
      await expect(front).toContainText("Was ist die Hauptstadt von Portugal?");
      await front.evaluate(async (body) => { await body.ownerDocument.fonts.ready; });
      await section.locator('iframe[title="Vorderseite"]').screenshot({ path: path.join(output, `${size.width}-${theme}-management-question.png`) });
      await section.screenshot({ path: path.join(output, `${size.width}-${theme}-content.png`), animations: "disabled" });
      await section.getByRole("button", { name: "Antwort aufdecken", exact: true }).click();
      await expect(section.frameLocator('iframe[title="Antwort"]').locator("body")).not.toBeEmpty();
      await section.screenshot({ path: path.join(output, `${size.width}-${theme}-review-answer.png`), animations: "disabled" });
      await section.getByRole("button", { name: "Zurücksetzen", exact: true }).click();
    }
  }
  await page.getByLabel("Elemente durchsuchen", { exact: true }).fill("Dialoge und Speicherleisten");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Kartenvorschau öffnen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Kartenvorschau", exact: true });
  await expect(dialog.frameLocator('iframe[title="Frage"]').locator("body")).not.toBeEmpty();
  await dialog.getByRole("button", { name: "Rückseite", exact: true }).click();
  await expect(dialog.frameLocator('iframe[title="Antwort"]').locator("body")).not.toBeEmpty();
  await dialog.screenshot({ path: path.join(output, "390-dark-preview-answer.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("Kartenbausteine: Eintippen und Aufdecken bei 200 Prozent CSS-Zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addStyleTag({ content: "body{zoom:2}.docs-site-nav,.docs-mobile-nav{position:static!important}" });
  await page.evaluate(() => document.documentElement.dataset.coreTheme = "dark");
  const demo = page.locator('[data-note-demo="typed"]');
  await demo.getByLabel("Antwort eingeben").fill("Her");
  await demo.getByLabel("Antwort eingeben").press("Enter");
  const comparison = demo.frameLocator('iframe[title="Antwort"]').locator(".core-typed-comparison");
  await expect(comparison).toContainText("Richtig Herz");
  await expect(comparison.locator(".typed-missing")).toHaveText("z");
  expect(await demo.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await demo.screenshot({ path: path.resolve("test-results/note-presentation/zoom-200-css.png"), animations: "disabled" });
});
