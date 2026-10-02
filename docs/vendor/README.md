# Dokumentations-Renderer

Die lokal gebündelten MIT-Builds von [Marked](https://github.com/markedjs/marked)
(18.0.5) und [Mermaid](https://github.com/mermaid-js/mermaid) stammen aus der
geprüften SmarterNutrition-Dokumentation. Ihre eingebetteten Lizenzhinweise
bleiben erhalten. Marked läuft ausschließlich im Dokumentationsgenerator;
Mermaid rendert die Diagramme im HTML. Keine CDN- oder Produktionsabhängigkeit.

Updates erfolgen bewusst auf eine geprüfte Version; danach `npm run check:docs`
und die betroffenen HTML-Ansichten prüfen. Die TypeScript-Deklaration beschreibt
nur die hier verwendete Marked-Schnittstelle.
