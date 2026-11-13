import type { ReactNode } from 'react';
import { t } from './sprache';

/**
 * Eigene Rückfragen statt `confirm()`/`alert()` (#355): einheitlich, mit Verb auf dem Knopf,
 * barrierefrei (`role="alertdialog"`, modal mit Fokusfalle, Esc bricht ab).
 *
 *   if (!(await rueckfrage({ titel: 'Notiz löschen?', ja: 'Löschen', gefahr: true }))) return;
 *   await hinweis({ titel: 'Gespeichert', text: '…' });
 *
 * Die Funktionen gehen überall (auch außerhalb von Komponenten); angezeigt wird im einen
 * `<Rueckfragen />` (Baustein, `web/src/bausteine/rueckfrage/`), das die App einmal einbindet. Mehrere Rückfragen
 * kommen nacheinander. Hier steht nur die Warteschlange – so hängt der Baustein `Knopf` (Art Gefahr ruft die
 * Rückfrage selbst auf, #1210) nicht über das Fenster an sich selbst.
 *
 * Gefährliches (#1210, Leitsatz 5): Der Knopf `art="gefahr"` stellt seine Rückfrage selbst. Nur ihr
 * Bestätigungsknopf ist rot gefüllt – der Moment der Entscheidung.
 */
export interface Rueckfrage {
  /** Was passiert? Als Frage: „Notiz löschen?“ */
  titel: string;
  /** Folgen in einem Satz oder zwei. */
  text?: ReactNode;
  /** Knopf mit Verb: „Löschen“, „Abmelden“ … */
  ja: string;
  /** Sicherer Knopf; Standard „Abbrechen“. */
  nein?: string;
  /** Bestätigungsknopf rot gefüllt, Fokus zuerst auf dem sicheren Knopf. */
  gefahr?: boolean;
  /** Nur für sehr Gefährliches: dieses Wort muss eingetippt werden. */
  bestaetigeMit?: string;
}

export interface OffeneRueckfrage extends Rueckfrage { nr: number; nurHinweis?: boolean; fertig(ok: boolean): void }

let naechste = 0;
let zeige: ((r: OffeneRueckfrage) => void) | null = null;
const wartend: OffeneRueckfrage[] = [];

/** Rückfrage stellen; true = bestätigt. */
export function rueckfrage(r: Rueckfrage): Promise<boolean> {
  return new Promise((fertig) => {
    const o = { ...r, nr: ++naechste, fertig };
    if (zeige) zeige(o); else wartend.push(o);
  });
}

/** Nur ein Hinweis mit einem Knopf (statt `alert()`). */
export function hinweis(r: { titel: string; text?: ReactNode; ok?: string }): Promise<void> {
  return new Promise((fertig) => {
    const o: OffeneRueckfrage = { nr: ++naechste, titel: r.titel, text: r.text, ja: r.ok ?? t('oberflaeche.rueckfrage.verstanden'), nurHinweis: true, fertig: () => fertig() };
    if (zeige) zeige(o); else wartend.push(o);
  });
}

/**
 * Anzeige anmelden (nur der Baustein `Rueckfragen`): Wartende kommen sofort, neue über `anzeigen`.
 * Rückgabe: Abmelden.
 */
export function rueckfragenAnzeigen(anzeigen: (r: OffeneRueckfrage[]) => void): () => void {
  zeige = (o) => anzeigen([o]);
  if (wartend.length) anzeigen(wartend.splice(0));
  return () => { zeige = null; };
}
