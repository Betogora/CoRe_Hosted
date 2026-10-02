import React from "react";
import { FileArchive, PenLine, Sparkles } from "lucide-react";
import { CreationActionCard } from "../src/ui/CreationActionCard.tsx";
import { StatusMessage, SuccessToast } from "../src/ui/feedbackUi.tsx";

export function DesignReview() {
  return <main className="catalog design-review">
    <header className="catalog-intro"><p>CoRe · lokale Design-Freigabe</p><h1>Einstieg und Meldungen</h1><p>Die Einstiegskarten verwenden jetzt das vorhandene Muster aus „Erstellen“. A zeigt dieses Muster; B und C sind alternative Verdichtungen. Die Meldungen darunter sind drei Vorschläge mit weniger Höhe und symmetrischen sichtbaren Iconabständen. Die Vorschläge sind noch nicht in App und UI-Katalog übernommen.</p><p>Zur Freigabe reichen zwei Angaben: Einstieg A/B/C und Meldungen A/B/C. Light und Dark lassen sich oben umschalten.</p></header>
    <nav className="catalog-card-links" aria-label="Freigabebereiche"><a href="#review-einstieg">Einstieg vergleichen</a><a href="#review-meldungen">Meldungen vergleichen</a></nav>
    <section id="review-einstieg" className="catalog-section"><h2>Einstieg</h2><div className="review-grid">{["A", "B", "C"].map((variant) => <section key={variant} className={`review-option review-${variant.toLowerCase()}`}>
      <h3>Variante {variant}</h3><p>{variant === "A" ? "Bestehende Erstellen-Karten" : variant === "B" ? "Kleinere zentrierte Karten" : "Kompakte Aktionszeilen"}</p>
      <div className="review-actions"><CreationActionCard title="Erste Karte erstellen" description="Frage und Antwort direkt eingeben." icon={PenLine} tone="info" onSelect={() => undefined} /><CreationActionCard title="Anki-Stapel importieren" description="Eine vorhandene APKG-Datei übernehmen." icon={FileArchive} tone="success" onSelect={() => undefined} /><CreationActionCard title="Demo ausprobieren" description="Beispielstapel auf deinen Klick anlegen." icon={Sparkles} tone="info" onSelect={() => undefined} /></div>
    </section>)}</div></section>
    <section id="review-meldungen" className="catalog-section"><h2>Meldungen</h2><p className="catalog-lead">Alle Varianten behalten die 44-px-Schließen-Aktion. Der sichtbare Rand links vom Statusicon und rechts vom Kreuz ist jeweils 16 px. Lange Texte brechen um.</p><div className="review-grid">{["A", "B", "C"].map((variant) => <section key={variant} className={`review-option review-${variant.toLowerCase()}`}>
      <h3>Variante {variant}</h3><p>{variant === "A" ? "8 px vertikales Padding" : variant === "B" ? "6 px vertikales Padding" : "4 px vertikales Padding"}</p>
      <SuccessToast onDismiss={() => undefined}>Karte wurde erfolgreich gespeichert.</SuccessToast><SuccessToast appearance="neutral" onDismiss={() => undefined}>Karte ausgesetzt. Der Lernstand bleibt erhalten.</SuccessToast><StatusMessage tone="info">Die Synchronisierung steht noch aus.</StatusMessage>
    </section>)}</div></section>
    <p className="review-note">Reale CoRe-Komponenten mit ausschließlich lokalen Vorschau-Styles. Aktionen speichern und navigieren hier nicht.</p>
  </main>;
}

export const designReviewCss = `
.design-review { max-width: 1440px; margin: auto; padding: 32px 24px; }
.review-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 24px; margin-top: 32px; }
.review-option { min-width: 0; display: grid; align-content: start; gap: 16px; }
.review-option > h3 { font: 600 22px/1.4 Amulya,Synonym,sans-serif; }
.review-option > p { font: 400 14px/1.6 Synonym,sans-serif; color: var(--core-text-secondary); }
.review-actions { display: grid; gap: 12px; }
.review-b .core-creation-action { padding: 16px; }
.review-b .core-creation-action-icon { width: 48px; height: 48px; }
.review-b .core-creation-action-title { font-size: 22px; line-height: 30px; margin-top: 12px; }
.review-c .core-creation-action { grid-template-columns: 40px minmax(0,1fr); column-gap: 12px; padding: 16px; text-align: left; align-items: center; }
.review-c .core-creation-action-icon { grid-row: 1 / span 2; width: 40px; height: 40px; }
.review-c .core-creation-action-icon svg { width: 22px; height: 22px; }
.review-c .core-creation-action-title { margin: 0; font-size: 18px; line-height: 24px; }
.review-c .core-creation-action-description { grid-column: 2; margin-top: 4px; }
.review-option { --review-padding: 8px; }
.review-b { --review-padding: 6px; }
.review-c { --review-padding: 4px; }
.review-option .core-success-toast { position: static; width: 100% !important; max-width: none; padding: var(--review-padding) 4px var(--review-padding) 16px; animation: none; }
.review-option .core-success-toast > div { flex: 1; }
.review-option .core-success-toast > div > div { font-size: 14px; line-height: 20px; }
.review-option .core-status-info { padding: var(--review-padding) 16px; }
.review-note { font-size: 12px !important; }
@media(max-width: 1099px) { .review-grid { grid-template-columns: 1fr; } .review-option { padding-bottom: 24px; border-bottom: 1px solid var(--core-border); } }
@media(max-width: 599px) { .design-review { padding: 24px 12px; } }
`;
