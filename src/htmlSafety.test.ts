import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCardHtml, sanitizeNoteHtml, stripHtml, stripSanitizedHtml } from "./htmlSafety.ts";

test("card HTML sanitizer preserves rich card markup and local media", () => {
  const sanitized = sanitizeCardHtml(
    '<table class="facts"><tr><th scope="row">ATP</th><td><ruby>細胞<rt>さいぼう</rt></ruby></td></tr></table>'
      + '<img src="anki-image.png" alt="Zelle" style="text-align:center;color:#663399">'
      + '<audio controls src="blob:https://core.local/audio"></audio>',
  );

  assert.match(sanitized, /<table class="facts">/);
  assert.match(sanitized, /<ruby>細胞<rt>さいぼう<\/rt><\/ruby>/);
  assert.match(sanitized, /src="anki-image.png"/);
  assert.match(sanitized, /color:#663399/);
  assert.match(sanitized, /<audio controls src="blob:https:\/\/core.local\/audio"><\/audio>/);
});

test("card HTML sanitizer removes active content and external media requests", () => {
  const sanitized = sanitizeCardHtml(
    '<script>alert(1)</script>'
      + '<img src="https://tracker.example/pixel" onerror="alert(2)">'
      + '<a href="javascript:alert(3)" onclick="alert(4)">Link</a>'
      + '<iframe src="https://tracker.example/frame"></iframe>'
      + '<span style="background-image:url(https://tracker.example/x)">Text</span>',
  );

  assert.doesNotMatch(sanitized, /script|iframe|onerror|onclick|javascript:|tracker\.example/i);
  assert.equal(stripHtml(sanitized).replace(/\s+/g, " ").trim(), "Link Text");
});

test("card HTML sanitizer preserves accessibility metadata without executable attributes", () => {
  const sanitized = sanitizeCardHtml('<mark data-cloze-group="2" aria-label="Lücke 2" onfocus="x()">Begriff</mark>');
  assert.equal(sanitized, '<mark data-cloze-group="2" aria-label="Lücke 2">Begriff</mark>');
});

test("trusted sanitized card HTML can be projected to text without changing its markup", () => {
  const sanitized = sanitizeCardHtml('<b>ATP</b><script>alert(1)</script>');
  assert.equal(stripSanitizedHtml(sanitized).replace(/\s+/g, " ").trim(), "ATP");
  assert.equal(sanitized, "<b>ATP</b>");
});

test("note HTML keeps semantic formatting and drops fonts, layout and classes", () => {
  assert.equal(
    sanitizeNoteHtml('<p class="anking" id="x" style="font-family:Arial;font-size:24px;color:#c00;position:absolute;float:right;width:300px">A</p>'),
    '<p style="color:#c00">A</p>',
  );
  assert.equal(
    sanitizeNoteHtml('<span style="font-size:1.2em;background-color:yellow;font-weight:bold">B</span><font color="red" face="Comic" size="7">C</font>'),
    '<span style="font-size:1.2em;background-color:yellow;font-weight:bold">B</span><font color="red">C</font>',
  );
  assert.equal(
    sanitizeNoteHtml('<table style="border-collapse:collapse;width:100%"><tr><td style="border:1px solid #999;padding:4px;width:120px" colspan="2">D</td></tr></table>'),
    '<table style="border-collapse:collapse;width:100%"><tr><td style="border:1px solid #999;padding:4px" colspan="2">D</td></tr></table>',
  );
  assert.equal(sanitizeNoteHtml('<ruby>心<rp>(</rp><rt>こころ</rt><rp>)</rp></ruby><sub>2</sub><sup>+</sup>'), '<ruby>心<rp>(</rp><rt>こころ</rt><rp>)</rp></ruby><sub>2</sub><sup>+</sup>');
});

test("note HTML allows only absolute web links and local or embedded media", () => {
  assert.equal(
    sanitizeNoteHtml('<a href="https://next.amboss.com/de/article/abc" target="_blank">AMBOSS</a><a href="/relativ">R</a><a href="javascript:alert(1)">J</a>'),
    '<a rel="noopener noreferrer" href="https://next.amboss.com/de/article/abc">AMBOSS</a><a rel="noopener noreferrer">R</a><a rel="noopener noreferrer">J</a>',
  );
  assert.equal(
    sanitizeNoteHtml('<img src="bild 1.png" onerror="x()"><img src="https://tracker.example/p.png"><img src="blob:https://core.local/x"><img src="data:image/png;base64,AAAA">'),
    '<img src="bild 1.png" /><img /><img /><img src="data:image/png;base64,AAAA" />',
  );
  assert.equal(sanitizeNoteHtml('<video src="v.mp4" controls autoplay></video>'), '<video src="v.mp4" controls></video>');
  assert.equal(
    sanitizeNoteHtml('<div data-x="1" aria-label="Hinweis">E</div><iframe src="x"></iframe><input value="1"><script>1</script><style>p{}</style>'),
    '<div aria-label="Hinweis">E</div>',
  );
});

test("note HTML filters attributes without touching text and decodes entities before checks", () => {
  assert.equal(sanitizeNoteHtml("<p>Das Attribut src &gt; href und style</p>"), "<p>Das Attribut src &gt; href und style</p>");
  assert.equal(sanitizeNoteHtml('<p src="x.png" href="https://example.com">P</p>'), "<p>P</p>");
  assert.equal(
    sanitizeNoteHtml('<a href="&#106;avascript:alert(1)">J</a><img src="&#106;avascript:alert(1)">'),
    '<a rel="noopener noreferrer">J</a><img />',
  );
});
