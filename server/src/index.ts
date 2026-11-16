/**
 * Start von Ablago. Mit `DMS_PROZESSE` über 1 (#745) wird dieser Prozess zum schlanken Hauptprozess (`prozesse.ts`)
 * und startet die Prozesse, die dann wieder hier beginnen; sonst – und in jedem dieser Prozesse – läuft Ablago selbst
 * (`ablago.ts`). Der Hauptprozess lädt Ablago nicht, damit er kaum Arbeitsspeicher braucht.
 */
import cluster from 'node:cluster';
import { leite, prozesseAus } from './prozesse/prozesse';

const einstellung = prozesseAus(process.env);
if (cluster.isPrimary && einstellung.anzahl > 1) await leite(einstellung);
// Kein fester Pfad im Import: Beim Bauen bleibt ablago.js eine eigene Datei (esbuild bündelt es nicht hierher).
else await import(new URL(import.meta.url.endsWith('.ts') ? './ablago.ts' : './ablago.js', import.meta.url).href);
