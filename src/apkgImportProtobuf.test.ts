import assert from "node:assert/strict";
import test from "node:test";
import { BinaryWriter, WireType } from "@bufbuild/protobuf/wire";
import {
  decodeAnkiFieldConfig,
  decodeAnkiNotetypeConfig,
  decodeAnkiTemplateConfig,
} from "./apkgImportProtobuf.ts";

function bytesBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

test("decodes all known Anki V18 notetype config fields and preserves raw bytes", () => {
  const packedFieldOrdinals = new BinaryWriter().uint32(0).uint32(2).finish();
  const requirement = new BinaryWriter()
    .tag(1, WireType.Varint).uint32(1)
    .tag(2, WireType.Varint).uint32(2)
    .tag(3, WireType.LengthDelimited).bytes(packedFieldOrdinals)
    .tag(50, WireType.Varint).uint32(99)
    .finish();
  const bytes = new BinaryWriter()
    .tag(1, WireType.Varint).uint32(1)
    .tag(2, WireType.Varint).uint32(3)
    .tag(3, WireType.LengthDelimited).string(".card { color: rebeccapurple; }")
    .tag(4, WireType.Varint).int64(42n)
    .tag(5, WireType.LengthDelimited).string("\\documentclass{article}")
    .tag(6, WireType.LengthDelimited).string("\\end{document}")
    .tag(7, WireType.Varint).bool(true)
    .tag(8, WireType.LengthDelimited).bytes(requirement)
    .tag(9, WireType.Varint).uint32(5)
    .tag(10, WireType.Varint).int64(9_007_199_254_740_993n)
    .tag(99, WireType.LengthDelimited).string("future-field")
    .tag(255, WireType.LengthDelimited).bytes(Uint8Array.of(1, 2, 3))
    .finish();

  const decoded = decodeAnkiNotetypeConfig(bytes);

  assert.equal(decoded.rawBase64, bytesBase64(bytes));
  assert.equal(decoded.kind, 1);
  assert.equal(decoded.sortFieldIndex, 3);
  assert.equal(decoded.css, ".card { color: rebeccapurple; }");
  assert.equal(decoded.targetDeckIdUnused, "42");
  assert.equal(decoded.latexPre, "\\documentclass{article}");
  assert.equal(decoded.latexPost, "\\end{document}");
  assert.equal(decoded.latexSvg, true);
  assert.deepEqual(decoded.requirements, [{ cardOrdinal: 1, kind: 2, fieldOrdinals: [0, 2] }]);
  assert.equal(decoded.originalStockKind, 5);
  assert.equal(decoded.originalId, "9007199254740993");
  assert.equal(decoded.otherBase64, "AQID");
});

test("decodes all known Anki V18 field config fields and tolerates unknown fields", () => {
  const bytes = new BinaryWriter()
    .tag(1, WireType.Varint).bool(true)
    .tag(2, WireType.Varint).bool(true)
    .tag(3, WireType.LengthDelimited).string("Noto Sans")
    .tag(4, WireType.Varint).uint32(18)
    .tag(5, WireType.LengthDelimited).string("Eine Beschreibung")
    .tag(6, WireType.Varint).bool(true)
    .tag(7, WireType.Varint).bool(true)
    .tag(8, WireType.Varint).bool(true)
    .tag(9, WireType.Varint).int64(123n)
    .tag(10, WireType.Varint).uint32(7)
    .tag(11, WireType.Varint).bool(true)
    .tag(80, WireType.Bit32).fixed32(12)
    .tag(255, WireType.LengthDelimited).bytes(Uint8Array.of(4, 5))
    .finish();

  const decoded = decodeAnkiFieldConfig(bytes);

  assert.equal(decoded.rawBase64, bytesBase64(bytes));
  assert.deepEqual({
    sticky: decoded.sticky,
    rtl: decoded.rtl,
    fontName: decoded.fontName,
    fontSize: decoded.fontSize,
    description: decoded.description,
    plainText: decoded.plainText,
    collapsed: decoded.collapsed,
    excludeFromSearch: decoded.excludeFromSearch,
    id: decoded.id,
    tag: decoded.tag,
    preventDeletion: decoded.preventDeletion,
    otherBase64: decoded.otherBase64,
  }, {
    sticky: true,
    rtl: true,
    fontName: "Noto Sans",
    fontSize: 18,
    description: "Eine Beschreibung",
    plainText: true,
    collapsed: true,
    excludeFromSearch: true,
    id: "123",
    tag: 7,
    preventDeletion: true,
    otherBase64: "BAU=",
  });
});

test("decodes all known Anki V18 template config fields and rejects truncation", () => {
  const bytes = new BinaryWriter()
    .tag(1, WireType.LengthDelimited).string("{{Front}}")
    .tag(2, WireType.LengthDelimited).string("{{FrontSide}}<hr>{{Back}}")
    .tag(3, WireType.LengthDelimited).string("{{BrowserFront}}")
    .tag(4, WireType.LengthDelimited).string("{{BrowserBack}}")
    .tag(5, WireType.Varint).int64(456n)
    .tag(6, WireType.LengthDelimited).string("Arial")
    .tag(7, WireType.Varint).uint32(20)
    .tag(8, WireType.Varint).int64(789n)
    .tag(255, WireType.LengthDelimited).bytes(Uint8Array.of(6))
    .finish();

  const decoded = decodeAnkiTemplateConfig(bytes);

  assert.equal(decoded.rawBase64, bytesBase64(bytes));
  assert.equal(decoded.questionFormat, "{{Front}}");
  assert.equal(decoded.answerFormat, "{{FrontSide}}<hr>{{Back}}");
  assert.equal(decoded.browserQuestionFormat, "{{BrowserFront}}");
  assert.equal(decoded.browserAnswerFormat, "{{BrowserBack}}");
  assert.equal(decoded.targetDeckId, "456");
  assert.equal(decoded.browserFontName, "Arial");
  assert.equal(decoded.browserFontSize, 20);
  assert.equal(decoded.id, "789");
  assert.equal(decoded.otherBase64, "Bg==");
  assert.throws(() => decodeAnkiTemplateConfig(Uint8Array.of(0x0a, 0x80)), /EOF|varint/i);
});
