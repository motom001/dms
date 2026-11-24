import type { ReactNode } from 'react';
import type { ErsteSicherung, SicherungsZustand } from '../../api/betrieb';
import { t, tn } from '../../sprache';
import { NOTFALLBLATT_SEITE } from '../../../../shared/src/werkbankansicht';
import { zeit, zielName } from '../sicherungFormat';
import { NotfallblattGrund } from './NotfallblattGrund';

/** Hinweise zur Sicherung – auch für die Übersicht der Werkbank (#105). */
/** Hinweise zur Sicherung; `schluessel` und `datum` für die Übersicht (#816: Sortierung, Akzeptieren). */
export interface SicherungsHinweis {
  art: 'schlecht' | 'warn' | 'info';
  text: ReactNode;
  schluessel: string;
  datum?: string | null;
  /** Eigenes Ziel statt der Sicherung (#993: Notfallblatt → Verschlüsselung) mit Text für den Knopf. */
  ziel?: string;
  knopf?: string;
}
/** `mitNotfallblatt`: nur wer die Verschlüsselung verwaltet, erfährt hier vom Notfallblatt (#993, Thomas 10.11.2026). */
export function sicherungsHinweise(z: SicherungsZustand, mitNotfallblatt: boolean): SicherungsHinweis[] {
  const h: SicherungsHinweis[] = [];
  if (!z.schluessel) return h; // Ohne Schlüssel weist schon die Verschlüsselung darauf hin.
  const erste = ersteAktuell(z);
  if (erste?.status === 'fehler') ersteFehler(erste, h);
  else if (!erste || erste.status === 'ok') fehlerUndAlter(z, h);
  notfallblattUndProbe(z, h, mitNotfallblatt, !!erste && erste.status !== 'ok');
  ortUndAusserHaus(z, h, !!z.erste && !!z.letzte && (!erste || erste.status === 'ok'));
  return h;
}

/**
 * Erste Sicherung samt Probe nach der Einrichtung (#1509) – solange sie die neueste ist (bzw. noch läuft oder gerade
 * scheiterte und es keine andere gibt). Danach gilt wieder der normale Stand.
 */
export function ersteAktuell(z: SicherungsZustand): ErsteSicherung | null {
  const e = z.erste;
  if (!e) return null;
  if (e.status === 'offen' || e.status === 'laeuft') return e;
  if (!z.letzte) return e;
  return e.sicherung && z.letzte.name === `${e.sicherung}.dms-sicherung` ? e : null;
}

/** Erste Sicherung oder ihre Probe gescheitert (#1509, C9): ein roter Hinweis an genau einer Stelle (Übersicht). */
function ersteFehler(e: ErsteSicherung, h: SicherungsHinweis[]) {
  h.push({
    schluessel: 'sicherung.erste-fehler',
    datum: e.am,
    art: 'schlecht',
    text: (
      <>
        <strong>{e.schritt === 'probe' ? t('werkbank.sicherung.erste.probe-fehler') : t('werkbank.sicherung.erste.fehler')}</strong>{' '}
        {t('werkbank.sicherung.erste.fehler.text')}
      </>
    ),
  });
}

/** Letzte Sicherung fehlgeschlagen, keine oder zu alt. */
function fehlerUndAlter(z: SicherungsZustand, h: SicherungsHinweis[]) {
  if (z.fehler)
    h.push({
      schluessel: 'sicherung.fehler',
      datum: z.fehler.am,
      art: 'schlecht',
      text: (
        <>
          <strong>{t('werkbank.sicherung.die-letzte-sicherung-ist')}</strong> ({zeit(z.fehler.am)}): {z.fehler.grund}
        </>
      ),
    });
  if (!z.letzte)
    h.push({
      schluessel: 'sicherung.keine',
      art: 'warn',
      text: <>{tn('werkbank.sicherung.lege-eine-an-und', { b: <strong>{t('werkbank.sicherung.es-gibt-noch-keine')}</strong> })}</>,
    });
  else if (z.zuAlt)
    h.push({
      schluessel: 'sicherung.alt',
      datum: z.letzte.ende,
      art: 'warn',
      text: (
        <>
          <strong>{t('werkbank.sicherung.die-letzte-sicherung-ist-2')}</strong> ({zeit(z.letzte.ende)}).
        </>
      ),
    });
}

/** Notfallblatt (#993, #815) und Probe-Wiederherstellung (#109); `ohneProbe`: die erste Sicherung samt Probe läuft oder scheiterte (#1509). */
function notfallblattUndProbe(z: SicherungsZustand, h: SicherungsHinweis[], mitNotfallblatt: boolean, ohneProbe: boolean) {
  // Seit #815 auch: Der Notfallcode darauf wurde benutzt, oder das Blatt stammt aus der Zeit vor dem Notfallcode.
  const nb = z.notfallblatt;
  // Das Notfallblatt selbst steht unter Verschlüsselung (#993) – der Hinweis führt dorthin.
  if (mitNotfallblatt && !nb.aktuell && (z.letzte || z.planAktiv || nb.am))
    h.push({
      schluessel: 'sicherung.notfallblatt',
      art: 'warn',
      ziel: NOTFALLBLATT_SEITE,
      knopf: t('werkbank.sicherung.zum-notfallblatt'),
      text:
        nb.grund === 'benutzt' || nb.grund === 'ohne-code' ? (
          <NotfallblattGrund n={nb} />
        ) : (
          <>
            {tn('werkbank.sicherung.ohne-den-schluessel-darauf', {
              b: (
                <strong>
                  {nb.am ? t('werkbank.sicherung.das-notfallblatt-gehoert-zu') : t('werkbank.sicherung.das-notfallblatt-fehlt')}
                </strong>
              ),
            })}
          </>
        ),
    });
  // Probe-Wiederherstellung (#109): Ampel.
  if (ohneProbe) return;
  if (z.probe?.ampel === 'rot')
    h.push({
      schluessel: 'sicherung.probe-fehler',
      datum: z.probe.letzte?.am,
      art: 'schlecht',
      text: (
        <>
          <strong>{t('werkbank.sicherung.die-letzte-probe-wiederherstellung')}</strong> ({zeit(z.probe.letzte!.am)}): {z.probe.letzte!.info}
        </>
      ),
    });
  else if (z.probe?.ampel === 'gelb' && z.letzte)
    h.push({
      schluessel: 'sicherung.probe',
      art: 'info',
      text: (
        <>
          {tn('werkbank.sicherung.erst-eine-probe-zeigt', {
            b: (
              <strong>
                {z.probe.letzte
                  ? t('werkbank.sicherung.die-letzte-probe-wiederherstellung-2', { zeit: zeit(z.probe.letzte.am) })
                  : t('werkbank.sicherung.noch-keine-sicherung-wurde')}
              </strong>
            ),
          })}
        </>
      ),
    });
}

/** Speicherort (Volume, gleiche Platte) und Sicherung außer Haus (#585, #1194); `naechsterSchritt`: Kopie außer Haus nach der Neueinrichtung (#1509). */
function ortUndAusserHaus(z: SicherungsZustand, h: SicherungsHinweis[], naechsterSchritt: boolean) {
  // #1509: Nach der Neueinrichtung ist der nächste Schritt die Kopie außer Haus – deutlich, wenn die Sicherungen sogar
  // auf derselben Platte wie die Dateien liegen. Er ersetzt dann den Hinweis „dieselbe Platte“.
  const ausserHaus = naechsterSchritt && !z.extern?.ziele.length;
  if (ausserHaus)
    h.push({
      schluessel: 'sicherung.ausser-haus',
      art: z.ort.gleichePlatte ? 'warn' : 'info',
      ziel: '/werkbank/sicherung#ausser-haus',
      knopf: t('werkbank.sicherung.ausser-haus.knopf'),
      text: (
        <>
          <strong>{t('werkbank.sicherung.ausser-haus.titel')}</strong>{' '}
          {z.ort.gleichePlatte ? t('werkbank.sicherung.ausser-haus.gleiche-platte') : t('werkbank.sicherung.ausser-haus.text')}
        </>
      ),
    });
  if (z.ort.volume === false)
    h.push({
      schluessel: 'sicherung.volume',
      art: 'warn',
      text: (
        <>
          {tn('werkbank.sicherung.die-sicherungen-liegen-im', {
            b: <strong>{t('werkbank.sicherung.der-sicherungsordner-ist-kein')}</strong>,
          })}
        </>
      ),
    });
  else if (z.ort.gleichePlatte && !ausserHaus)
    h.push({
      schluessel: 'sicherung.gleiche-platte',
      art: 'info',
      text: (
        <>{tn('werkbank.sicherung.faellt-sie-aus-sind', { b: <strong>{t('werkbank.sicherung.die-sicherungen-liegen-auf')}</strong> })}</>
      ),
    });
  // Sicherung außer Haus (#585): fehlgeschlagen bzw. mehr als 2 Tage im Rückstand.
  const x = z.extern;
  // #1194: „Lokal nur die neueste“ ist gesetzt, wirkt aber nicht (Ziel weg, Fehler, Rückstand) – ältere bleiben wieder lokal.
  if (z.nurNeueste?.gesetzt && !z.nurNeueste.wirksam)
    h.push({
      schluessel: 'sicherung.nur-neueste',
      art: 'warn',
      text: (
        <>
          <strong>{t('werkbank.sicherung.extern.nurneueste.hinweis')}</strong> {t('werkbank.sicherung.extern.nurneueste.wirkt-nicht')}
        </>
      ),
    });
  if (x?.fehler)
    h.push({
      schluessel: 'sicherung.extern-fehler',
      datum: x.fehler.beginn,
      art: 'schlecht',
      text: (
        <>
          <strong>{t('werkbank.sicherung.extern.hinweis.fehler', { datum: zeit(x.fehler.beginn) })}</strong> {zielName(x, x.fehler.paket)}:{' '}
          {x.fehler.stand.grund ?? '–'}
        </>
      ),
    });
  else if (x?.zuAlt)
    h.push({
      schluessel: 'sicherung.extern-alt',
      art: 'warn',
      text: (
        <>
          <strong>{t('werkbank.sicherung.extern.hinweis.alt')}</strong>{' '}
          {x.letzte
            ? t('werkbank.sicherung.extern.hinweis.letzte', { datum: zeit(x.letzte.beginn) })
            : t('werkbank.sicherung.extern.hinweis.nie')}
        </>
      ),
    });
}
