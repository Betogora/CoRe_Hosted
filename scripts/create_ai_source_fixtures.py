"""Writes fixtures/ai-source/ohmsches-gesetz.pdf: a small text PDF with three pages, the middle one without a text layer.

The PDF is built by hand (Helvetica, WinAnsi encoding) so the fixture needs no extra dependency.
Run: python scripts/create_ai_source_fixtures.py
"""
from pathlib import Path

PAGES = [
    [
        "Das ohmsche Gesetz",
        "",
        "Das ohmsche Gesetz beschreibt den Zusammenhang zwischen Spannung, Stromstärke",
        "und Widerstand in einem elektrischen Leiter. Es lautet: U = R · I.",
        "Dabei ist U die Spannung in Volt (V), I die Stromstärke in Ampere (A)",
        "und R der elektrische Widerstand in Ohm (Ω).",
        "",
        "Das Gesetz gilt nur für ohmsche Leiter, deren Widerstand bei konstanter",
        "Temperatur unabhängig von der Stromstärke ist, etwa für Metalldrähte.",
        "Eine Glühlampe ist kein ohmscher Leiter, weil ihr Widerstand mit der",
        "Temperatur des Glühfadens steigt.",
        "",
        "Beispiel: Liegt an einem Widerstand von 100 Ω eine Spannung von 12 V an,",
        "fließt ein Strom von I = U / R = 12 V / 100 Ω = 0,12 A.",
    ],
    None,  # a scanned page: no text layer
    [
        "Reihen- und Parallelschaltung",
        "",
        "In einer Reihenschaltung fließt durch alle Widerstände derselbe Strom.",
        "Der Gesamtwiderstand ist die Summe der Einzelwiderstände: R = R1 + R2.",
        "Die Gesamtspannung teilt sich auf die Widerstände auf.",
        "",
        "In einer Parallelschaltung liegt an allen Widerständen dieselbe Spannung.",
        "Die Kehrwerte addieren sich: 1/R = 1/R1 + 1/R2.",
        "Der Gesamtwiderstand ist daher immer kleiner als der kleinste",
        "Einzelwiderstand.",
        "",
        "Elektrische Leistung: P = U · I, gemessen in Watt (W).",
    ],
]

# WinAnsi has no Ω; the fixture spells it out where the font cannot draw it.
REPLACEMENTS = {"Ω": "Ohm"}


def encode(line: str) -> bytes:
    for source, target in REPLACEMENTS.items():
        line = line.replace(source, target)
    escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return escaped.encode("cp1252")


def content_stream(lines: list[str] | None) -> bytes:
    if lines is None:
        # A grey rectangle stands in for a scanned image; there is no text operator.
        return b"0.85 g 72 400 451 300 re f"
    parts = [b"BT /F1 12 Tf 72 760 Td 16 TL"]
    for line in lines:
        parts.append(b"(" + encode(line) + b") Tj T*")
    parts.append(b"ET")
    return b"\n".join(parts)


def build() -> bytes:
    objects: list[bytes] = []
    page_ids = []
    font_id = 3
    next_id = 4
    page_objects = []
    for lines in PAGES:
        stream = content_stream(lines)
        content_id, page_id = next_id, next_id + 1
        next_id += 2
        page_ids.append(page_id)
        page_objects.append((content_id, b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream)))
        page_objects.append((page_id, b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>" % content_id))
    kids = b" ".join(b"%d 0 R" % page_id for page_id in page_ids)
    objects.append((1, b"<< /Type /Catalog /Pages 2 0 R >>"))
    objects.append((2, b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids))))
    objects.append((font_id, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"))
    objects.extend(page_objects)
    objects.sort()

    output = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for object_id, body in objects:
        offsets[object_id] = len(output)
        output += b"%d 0 obj\n%s\nendobj\n" % (object_id, body)
    xref = len(output)
    output += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for object_id in range(1, len(objects) + 1):
        output += b"%010d 00000 n \n" % offsets[object_id]
    output += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(output)


if __name__ == "__main__":
    target = Path(__file__).resolve().parent.parent / "fixtures" / "ai-source" / "ohmsches-gesetz.pdf"
    target.write_bytes(build())
    print(f"geschrieben: {target}")
