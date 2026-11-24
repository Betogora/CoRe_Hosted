# Ableitungen und Kurvendiskussion

Die Ableitung einer Funktion beschreibt, wie stark sich der Funktionswert an einer Stelle ändert. Geometrisch ist die Ableitung f'(x0) die Steigung der Tangente an den Graphen im Punkt (x0 | f(x0)).

## Definition

Die Steigung der Sekante durch die Punkte (x0 | f(x0)) und (x0 + h | f(x0 + h)) heißt Differenzenquotient:

(f(x0 + h) − f(x0)) / h

Lässt man h gegen 0 laufen, erhält man den Differenzialquotienten, die Ableitung an der Stelle x0:

f'(x0) = lim (h → 0) (f(x0 + h) − f(x0)) / h

Existiert dieser Grenzwert, heißt f an der Stelle x0 differenzierbar. Jede differenzierbare Funktion ist stetig, aber nicht jede stetige Funktion ist differenzierbar. Das Standardbeispiel ist die Betragsfunktion f(x) = |x|: Sie ist bei x = 0 stetig, hat dort aber einen Knick. Von links ist die Steigung −1, von rechts +1, deshalb existiert die Ableitung an dieser Stelle nicht.

## Ableitungsregeln

### Konstanten-, Potenz- und Faktorregel

- Die Ableitung einer Konstanten ist null: f(x) = c ⇒ f'(x) = 0.
- Potenzregel: f(x) = x^n ⇒ f'(x) = n · x^(n−1). Sie gilt für alle reellen Exponenten, also auch für Wurzeln und Brüche. Beispiel: √x = x^(1/2) hat die Ableitung 1 / (2√x); 1/x = x^(−1) hat die Ableitung −1/x².
- Faktorregel: Ein konstanter Faktor bleibt beim Ableiten erhalten: (c · f(x))' = c · f'(x).

### Summenregel

Eine Summe wird gliedweise abgeleitet: (f(x) + g(x))' = f'(x) + g'(x).

Beispiel: f(x) = 4x³ − 2x² + 7x − 5 hat die Ableitung f'(x) = 12x² − 4x + 7. Die Konstante −5 fällt weg.

### Produktregel

(u · v)' = u' · v + u · v'

Das Produkt zweier Funktionen wird nicht einfach faktorweise abgeleitet; (u · v)' ist im Allgemeinen nicht u' · v'.

Beispiel: f(x) = x² · sin(x). Mit u = x², u' = 2x, v = sin(x), v' = cos(x) gilt f'(x) = 2x · sin(x) + x² · cos(x).

### Quotientenregel

(u / v)' = (u' · v − u · v') / v², wobei v(x) ≠ 0 sein muss.

Beim Zähler kommt es auf die Reihenfolge an: Zuerst steht u' · v, dann wird u · v' abgezogen. Eine Merkhilfe lautet „NAZ minus ZAN durch N²“: Nenner mal Ableitung des Zählers minus Zähler mal Ableitung des Nenners, geteilt durch den Nenner im Quadrat.

Beispiel: f(x) = (2x + 1) / (x − 3). Es gilt u' = 2 und v' = 1, also f'(x) = (2 · (x − 3) − (2x + 1) · 1) / (x − 3)² = −7 / (x − 3)². Die Ableitung ist für alle x ≠ 3 negativ; die Funktion fällt auf jedem Teilintervall ihres Definitionsbereichs.

### Kettenregel

Für eine verkettete Funktion f(x) = u(v(x)) gilt:

f'(x) = u'(v(x)) · v'(x)

Man leitet also die äußere Funktion ab, setzt die innere Funktion unverändert ein und multipliziert mit der Ableitung der inneren Funktion („äußere Ableitung mal innere Ableitung“).

Beispiele:
- f(x) = (3x² + 1)⁵ ⇒ f'(x) = 5 · (3x² + 1)⁴ · 6x = 30x · (3x² + 1)⁴
- f(x) = e^(2x) ⇒ f'(x) = 2 · e^(2x)
- f(x) = sin(x²) ⇒ f'(x) = cos(x²) · 2x

Ein häufiger Fehler ist, die innere Ableitung zu vergessen.

### Ableitungen wichtiger Funktionen

| Funktion | Ableitung | Bedingung |
| --- | --- | --- |
| e^x | e^x | – |
| a^x | ln(a) · a^x | a > 0 |
| ln(x) | 1/x | x > 0 |
| sin(x) | cos(x) | x im Bogenmaß |
| cos(x) | −sin(x) | x im Bogenmaß |
| tan(x) | 1 / cos²(x) | cos(x) ≠ 0 |

Die natürliche Exponentialfunktion ist bis auf einen konstanten Faktor die einzige Funktion, die mit ihrer eigenen Ableitung übereinstimmt. Die Ableitungen von Sinus und Kosinus gelten nur, wenn x im Bogenmaß und nicht in Grad angegeben ist. Leitet man sin(x) viermal ab, erhält man wieder sin(x).

## Tangente und Normale

Die Tangente an den Graphen von f im Punkt (x0 | f(x0)) hat die Gleichung:

t(x) = f'(x0) · (x − x0) + f(x0)

Die Normale steht senkrecht auf der Tangente. Ihre Steigung ist −1 / f'(x0); das setzt f'(x0) ≠ 0 voraus. Ist f'(x0) = 0, verläuft die Tangente waagerecht und die Normale senkrecht.

Beispiel: Für f(x) = x² an der Stelle x0 = 1 gilt f(1) = 1 und f'(1) = 2. Die Tangente lautet t(x) = 2(x − 1) + 1 = 2x − 1. Die Normale hat die Steigung −1/2 und lautet n(x) = −0,5x + 1,5.

## Kurvendiskussion

Eine Kurvendiskussion untersucht die Eigenschaften eines Funktionsgraphen in einer festen Reihenfolge.

### 1. Definitionsbereich

Bei ganzrationalen Funktionen ist der Definitionsbereich ganz ℝ. Bei gebrochenrationalen Funktionen fallen die Nullstellen des Nenners heraus, bei Logarithmusfunktionen alle Stellen, an denen das Argument nicht positiv ist.

### 2. Symmetrie

- Achsensymmetrie zur y-Achse liegt vor, wenn f(−x) = f(x) für alle x gilt. Ganzrationale Funktionen mit nur geraden Exponenten sind achsensymmetrisch.
- Punktsymmetrie zum Ursprung liegt vor, wenn f(−x) = −f(x) gilt. Ganzrationale Funktionen mit nur ungeraden Exponenten sind punktsymmetrisch.
- Eine Konstante zählt als Summand mit dem geraden Exponenten 0. Die Funktion x³ + 1 ist deshalb weder achsensymmetrisch noch punktsymmetrisch zum Ursprung.

### 3. Nullstellen

Nullstellen sind die Lösungen der Gleichung f(x) = 0. Hilfsmittel sind Ausklammern, die p-q-Formel, Substitution bei biquadratischen Gleichungen und die Polynomdivision. Eine ganzrationale Funktion vom Grad n hat höchstens n Nullstellen.

### 4. Extrempunkte

Notwendige Bedingung: An einer Extremstelle x0 einer differenzierbaren Funktion gilt f'(x0) = 0.

Hinreichende Bedingung: Gilt zusätzlich f''(x0) < 0, liegt ein Hochpunkt vor; gilt f''(x0) > 0, ein Tiefpunkt. Merkhilfe: Eine negative zweite Ableitung bedeutet eine Rechtskurve und damit einen Hochpunkt.

Die Bedingung f'(x0) = 0 allein genügt nicht. Bei f(x) = x³ ist f'(0) = 0, aber bei x = 0 liegt kein Extremum, sondern ein Sattelpunkt, weil f' dort nicht das Vorzeichen wechselt.

Ist f''(x0) = 0, entscheidet die zweite Ableitung nichts. Dann hilft das Vorzeichenwechselkriterium: Wechselt f' bei x0 von + nach −, liegt ein Hochpunkt vor, von − nach + ein Tiefpunkt. Beispiel: Bei f(x) = x⁴ ist f'(0) = 0 und f''(0) = 0, trotzdem hat f bei x = 0 einen Tiefpunkt, weil f' dort von − nach + wechselt. Die Bedingung f''(x0) ≠ 0 ist also hinreichend, aber nicht notwendig.

### 5. Wendepunkte

An einem Wendepunkt ändert der Graph sein Krümmungsverhalten von einer Links- in eine Rechtskurve oder umgekehrt.

Notwendige Bedingung: f''(x0) = 0. Hinreichende Bedingung: zusätzlich f'''(x0) ≠ 0. Ein Wendepunkt mit waagerechter Tangente, also mit f'(x0) = 0, heißt Sattelpunkt oder Terrassenpunkt.

### 6. Monotonie und Krümmung

- Gilt f'(x) > 0 auf einem Intervall, ist f dort streng monoton steigend; gilt f'(x) < 0, streng monoton fallend.
- Gilt f''(x) > 0, ist der Graph linksgekrümmt (konvex); gilt f''(x) < 0, rechtsgekrümmt (konkav).

Die Umkehrung der Monotonieregel gilt nicht vollständig: f(x) = x³ ist streng monoton steigend, obwohl f'(0) = 0 ist.

### 7. Verhalten im Unendlichen

Bei ganzrationalen Funktionen bestimmt allein der Summand mit dem höchsten Exponenten das Verhalten für x → ±∞. Für f(x) = −2x³ + 5x gilt: Für x → +∞ geht f(x) gegen −∞, für x → −∞ gegen +∞.

## Vollständiges Beispiel

Untersucht wird f(x) = x³ − 3x.

1. **Definitionsbereich:** ganz ℝ.
2. **Symmetrie:** Es kommen nur ungerade Exponenten vor, also ist der Graph punktsymmetrisch zum Ursprung.
3. **Nullstellen:** x³ − 3x = x · (x² − 3) = 0 liefert x = 0, x = √3 ≈ 1,73 und x = −√3.
4. **Ableitungen:** f'(x) = 3x² − 3, f''(x) = 6x, f'''(x) = 6.
5. **Extrempunkte:** 3x² − 3 = 0 ergibt x = 1 und x = −1. Es gilt f''(1) = 6 > 0, also liegt bei x = 1 ein Tiefpunkt T(1 | −2). Es gilt f''(−1) = −6 < 0, also liegt bei x = −1 ein Hochpunkt H(−1 | 2).
6. **Wendepunkt:** 6x = 0 ergibt x = 0; da f'''(0) = 6 ≠ 0, ist W(0 | 0) ein Wendepunkt. Wegen f'(0) = −3 ≠ 0 ist er kein Sattelpunkt.
7. **Monotonie:** f steigt auf (−∞; −1), fällt auf (−1; 1) und steigt wieder auf (1; ∞).
8. **Krümmung:** Für x < 0 ist der Graph rechtsgekrümmt, für x > 0 linksgekrümmt.
9. **Verhalten im Unendlichen:** Für x → +∞ geht f(x) gegen +∞, für x → −∞ gegen −∞.

Hat eine Funktion dritten Grades einen Hoch- und einen Tiefpunkt, liegen beide immer punktsymmetrisch zu ihrem Wendepunkt.
