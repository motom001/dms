/**
 * Zweite Tür des Fachmodells (#1278, Schritt 5): die Form von Feld, Mappentyp und Mappe – Typen und einfache Werte,
 * die selbst nichts aus `shared/src` einbinden außer Grundlagen (Texte, Feld- und Ablagemerkmale, Zeiträume, Stempel)
 * und den Bedingungen der Ansichten (sichten/bedingungen.ts). index.ts reicht dazu die Prüfregeln, Werte und
 * Systemmappentypen weiter, und die binden ihrerseits Fachlogik ein (folgtaus.ts, tabelle.ts, beschriftung.ts …).
 * Wer selbst von diesen Teilen eingebunden wird, nimmt das Modell deshalb hier und nicht über index.ts – sonst
 * entstünde ein Kreis. Alles hier gibt es auch über index.ts.
 */
export * from './feldtypen';
export * from './beschriftungen';
export * from './angaben';
export * from './regelwerk';
export * from './felder';
export * from './historienarten';
export * from './mappentyp';
export * from './mappe';
