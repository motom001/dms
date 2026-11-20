/** Kleine Teile einer Dokumentzeile (#1279): Infozeile, Zustand, Herunterladen, Teilen am Handy. */
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { Dokument, OcrStand } from '../../../../shared/src/model';
import type { ArchivStand } from '../../../../shared/src/archivfassung';
import { sprache } from '../../../../shared/src/sprache';
import { t, tn } from '../../sprache';
import { archivfassungUrl, dokumentUrl } from '../../api/dokumente';
import { Person } from '../../Person';
import { Hilfe } from '../../Hilfe';
import { Symbol } from '../../Symbol';
import { Knopf, KnopfLink } from '../../bausteine';
import { artVon, groesse, herkunftVon, zeit } from './hilfen';

/** Schmaler Bildschirm (Handy, #505) – wie die Blätter von unten in styles.css (bis 600 px). */
export function useHandy() {
  const abfrage = '(max-width: 600px)';
  const [an, setAn] = useState(() => typeof matchMedia === 'function' && matchMedia(abfrage).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(abfrage);
    const f = () => setAn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return an;
}

/**
 * Teilen (#505, Web Share API): „An … senden“ mit der Datei, wo der Browser das kann. Safari verlangt das
 * Teilen direkt aus dem Tipp; dauert das Laden zu lange, steht danach „Jetzt teilen“ da (zweiter Tipp).
 */
export function DokTeilen({ d }: { d: Dokument }) {
  const [datei, setDatei] = useState<File | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const kann =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([''], d.name, { type: d.mime })] });
  if (!kann) return null;
  async function teile() {
    setFehler(undefined);
    let f = datei;
    try {
      if (!f) {
        setLaeuft(true);
        const r = await fetch(dokumentUrl(d.id, true), { credentials: 'same-origin', headers: { 'x-dms': '1', 'x-sprache': sprache() } });
        if (!r.ok) throw new Error(t('ablage.dokumente.das-dokument-liess-sich'));
        f = new File([await r.blob()], d.name, { type: d.mime });
        setDatei(f);
      }
      await navigator.share({ files: [f], title: d.name });
    } catch (e) {
      const n = (e as Error).name;
      if (n === 'NotAllowedError') return; // zweiter Tipp: „Jetzt teilen“
      if (n !== 'AbortError') setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <>
      <Knopf laeuft={laeuft} laeuftText={t('ablage.dokumente.lade')} onClick={() => void teile()}>
        {datei ? t('ablage.dokumente.jetzt-teilen') : t('ablage.dokumente.teilen')}
      </Knopf>
      {fehler && <span className="fehlertext klein">{fehler}</span>}
    </>
  );
}

/**
 * Herkunft und Person (#1489): „per E-Mail · für Lena“ bei Eingangskanälen, sonst wer hochgeladen hat. Ohne Person
 * (z. B. ein Postfach ohne „für“) fällt der Teil weg – kein „unbekannt“.
 */
export function HerkunftUndPerson({ x }: { x: Dokument }) {
  return (
    <>
      {herkunftVon(x.herkunft)}
      {x.eingangFuer ? (
        <>
          {' · '}
          {t('ablage.dokumente.info.fuer')} <Person id={x.eingangFuer} />
        </>
      ) : x.erstelltVon ? (
        <>
          {' · '}
          <Person id={x.erstelltVon} />
        </>
      ) : null}
    </>
  );
}

/** Eine Infozeile (#1211): Art · Seiten · Größe · Datum · Herkunft · Version und Archivnummer, wenn vorhanden. */
export function Infozeile({ x, s }: { x: Dokument; s?: OcrStand }) {
  const teile: ReactNode[] = [
    artVon(x),
    s?.stand === 'fertig' && s.seiten ? t('ablage.dokumente.info.seiten', { anzahl: s.seiten }) : null,
    groesse(x.groesse),
    zeit(x.erstellt),
    <HerkunftUndPerson x={x} />,
    (x.version ?? 1) > 1 ? t('ablage.dokumente.version-2', { wert: x.version ?? 1 }) : null,
    x.archivnummer ? tn('ablage.dokumente.archivnummer-2', { b: <strong className="mono">{x.archivnummer}</strong> }) : null,
  ].filter((v) => v !== null && v !== '');
  return (
    <>
      {teile.map((v, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {v}
        </Fragment>
      ))}
    </>
  );
}

/** Zustand (#1211): nur, wenn etwas nicht stimmt – als ruhige Zeile mit Ausweg („Text nicht lesbar … [Erneut versuchen]“). */
export function Zustand({ s, archiv, erneut }: { s?: OcrStand; archiv?: ArchivStand | null; erneut(): void }) {
  const text = s && (s.stand === 'fehler' || s.stand === 'ausgelassen');
  const archivFehler = archiv?.stand === 'fehler';
  if (!text && !archivFehler) return null;
  return (
    <span className="dokzustand klein">
      {text && (
        <span>
          <Symbol name="warnung" />{' '}
          {s!.info ? t('ablage.dokumente.zustand.text', { grund: s!.info }) : t('ablage.dokumente.zustand.text-ohne')}{' '}
          <Knopf groesse="klein" onClick={erneut}>
            {t('ablage.dokumente.erneut-versuchen')}
          </Knopf>
        </span>
      )}
      {archivFehler && (
        <span>
          <Symbol name="warnung" /> {t('ablage.dokumente.zustand.archiv', { grund: archiv!.info ?? '' })}
        </span>
      )}
    </span>
  );
}

/**
 * „Herunterladen“ ohne Exportrecht (#723): gesperrt aus einem Grund (#1210, Leitsatz 6) – gestrichelt mit Schloss und
 * ⓘ, die Erklärung öffnet sich direkt am Knopf; Bildschirmleser hören den Grund schon am Knopf.
 */
export function NichtHerunterladen() {
  return (
    <Knopf
      groesse="klein"
      gesperrt={{
        grund: t('mappen.mitnehmen.grund'),
        titel: t('mappen.mitnehmen.titel'),
        stattdessen: (
          <p className="leise">
            {t('mappen.mitnehmen.ansehen')} <Hilfe ort="dokumente.mitnehmen" />
          </p>
        ),
      }}>
      {t('mappen.mitnehmen.knopf')}
    </Knopf>
  );
}

/**
 * Herunterladen (#631): mit Archivfassung die Wahl – vorausgewählt (vorn) ist, was man gerade sieht, bei E-Rechnungen
 * immer das Original.
 */
export function Herunterladen({ x, archiv }: { x: Dokument; archiv: boolean }) {
  const a = x.archivfassung?.stand === 'fertig' ? x.archivfassung.fassung : undefined;
  if (!a || a.imOriginal)
    return (
      <KnopfLink href={dokumentUrl(x.id, true)} art="link">
        {t('ablage.dokumente.herunterladen')}
      </KnopfLink>
    );
  const zuerstArchiv = archiv && !a.erechnung;
  const orig = (
    <KnopfLink key="o" href={dokumentUrl(x.id, true)} title={t('volltext.archiv.laden.original.titel')} art="link">
      {zuerstArchiv ? t('volltext.archiv.laden.original') : t('ablage.dokumente.herunterladen')}
    </KnopfLink>
  );
  const arch = (
    <KnopfLink key="a" href={archivfassungUrl(x.id, true)} title={t('volltext.archiv.laden.archiv.titel')} art="link">
      {zuerstArchiv ? t('ablage.dokumente.herunterladen') : t('volltext.archiv.laden.archiv')}
    </KnopfLink>
  );
  return <>{zuerstArchiv ? [arch, orig] : [orig, arch]}</>;
}
