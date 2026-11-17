import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Dokument } from '../../../../shared/src/model';
import type { Bereich, SchwaerzSeite } from '../../../../shared/src/schwaerzen';
import { wegfallendeSeiten, type Leerseiten } from '../../../../shared/src/leerseiten';
import { dokumentUrl, schwaerzBildUrl } from '../../api/dokumente';
import { Knopf, Umschalter } from '../../bausteine';
import { Hilfe } from '../../Hilfe';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { farbeVon, setzeNutzlast, type Marke, type Nutzlast } from '../bruecke';
import { ansichtVon } from '../Dokumente';
import { GrosseSeiteMarke, grosseSeite, MitLeerseiten } from '../Leerseiten';
import type { Woerter } from './hilfen';

/**
 * Ein Dokument in der Mitte: Seitenbilder mit Rahmen und markierbarem Text. Kopf wie in der Mappe (#1211, #1217):
 * Umschalter „PDF/A · Original“, „In neuem Tab“; Betrachter mit fester Höhe; ein Original, das sich nicht anzeigen
 * lässt, mit Satz und „Original herunterladen“.
 */
export function DokumentBlatt({
  x,
  w,
  marken,
  hervor,
  setHervor,
  insAktive,
  leer,
  setzeLeer,
  herunterladen,
}: {
  x: Dokument;
  w: Woerter | 'keine' | undefined;
  marken: Marke[];
  hervor: string | null;
  setHervor(k: string | null): void;
  insAktive(n: Nutzlast, eigenesFeld?: string): void;
  /** Leerseiten (#997): Markierung des Pakets und Wahl je Seite; null ohne. */
  leer: Leerseiten | null;
  setzeLeer(l: Leerseiten | null): void;
  /** Darf das Original heruntergeladen werden (Exportrecht, kein Pflicht-Stempel)? */
  herunterladen: boolean;
}) {
  const weg = wegfallendeSeiten(leer);
  const mitArchiv = x.archivfassung?.stand === 'fertig';
  const [archiv, setArchiv] = useState(mitArchiv);
  useEffect(() => {
    setArchiv(mitArchiv);
  }, [mitArchiv]);
  const { seiten, nurArchiv } = zuZeigen(w, archiv);
  const ansicht = ansichtVon(x, !archiv);
  return (
    <article className="ue-dokument" aria-label={x.name}>
      <DokKopf x={x} archiv={mitArchiv ? archiv : null} setArchiv={setArchiv} tab={ansicht?.url} />
      {w === undefined ? (
        <p className="leise klein ue-betrachter-text">{t('ablage.uebernehmen.lade')}</p>
      ) : seiten?.length ? (
        <div className="ue-betrachter" tabIndex={0} role="group" aria-label={x.name}>
          {w !== 'keine' && !w.mitText && (
            <p className="leise klein">
              {x.ocr?.stand === 'wartet' || x.ocr?.stand === 'laeuft'
                ? t('ablage.uebernehmen.text-kommt')
                : t('ablage.uebernehmen.ohne-text')}
            </p>
          )}
          <MitLeerseiten x={x} l={leer} darf geaendert={setzeLeer}>
            {seiten.map((s, i) => (
              <Seite
                key={`${i}-${archiv}`}
                x={x}
                nr={i + 1}
                s={s}
                archiv={archiv}
                marken={marken}
                hervor={hervor}
                setHervor={setHervor}
                insAktive={insAktive}
                weg={weg.includes(i + 1)}
              />
            ))}
          </MitLeerseiten>
        </div>
      ) : ansicht && !nurArchiv ? (
        <div className="ue-ansicht">
          {ansicht.pdf ? <iframe src={ansicht.url} title={x.name} /> : <img src={ansicht.url} alt={x.name} />}
        </div>
      ) : (
        <NichtAnzeigbar x={x} herunterladen={herunterladen} />
      )}
    </article>
  );
}

/**
 * Welche Seiten das Blatt zeigt: Stammen sie nur aus der Archivfassung (#1137, z. B. E-Mail), zeigt „Original“ keine
 * Seiten und keinen Betrachter, sondern den Satz mit „Original herunterladen“ wie in der Mappe.
 */
function zuZeigen(w: Woerter | 'keine' | undefined, archiv: boolean): { seiten: SchwaerzSeite[] | null; nurArchiv: boolean } {
  if (!w || w === 'keine') return { seiten: null, nurArchiv: false };
  return { seiten: archiv || !w.archiv ? w.seiten : null, nurArchiv: !!w.archiv };
}

/** Kopf eines Dokuments wie in der Mappe (#1211): Name, Umschalter „PDF/A · Original“ (`archiv` null: ohne Archivfassung), „In neuem Tab“. */
function DokKopf({ x, archiv, setArchiv, tab }: { x: Dokument; archiv: boolean | null; setArchiv(an: boolean): void; tab?: string }) {
  return (
    <div className="dokansicht-kopf klein ue-dokkopf">
      <span className="ue-dokname">{x.name}</span>
      {archiv !== null && (
        <Umschalter
          wert={archiv ? 'archiv' : 'original'}
          setze={(v) => setArchiv(v === 'archiv')}
          beschriftung={t('ablage.dokumente.fassung')}
          wahlen={[
            { wert: 'archiv', text: t('ablage.dokumente.laden.pdfa') },
            { wert: 'original', text: t('ablage.dokumente.laden.original') },
          ]}
        />
      )}
      {archiv === null && x.archivfassung?.stand === 'wartet' && <span className="leise">{t('volltext.archiv.wird-erstellt')}</span>}
      {archiv !== null && <Hilfe ort="dokumente.archivfassung" />}
      {tab && (
        <a
          className="verweis dokansicht-tab"
          href={tab}
          target="_blank"
          rel="noreferrer"
          aria-label={t('ablage.dokumente.in-neuem-tab-oeffnen-2', { name: x.name })}>
          {t('ablage.dokumente.in-neuem-tab')} <Symbol name="extern" />
        </a>
      )}
    </div>
  );
}

/** Original, das der Browser nicht zeigt (#946, #1211, z. B. eine E-Mail): ein Satz und „Original herunterladen“. */
function NichtAnzeigbar({ x, herunterladen }: { x: Dokument; herunterladen: boolean }) {
  const endung = /\.([^.]{1,8})$/.exec(x.name)?.[1]?.toLowerCase();
  return (
    <div className="dokansicht-leer">
      <p>{endung ? t('ablage.dokumente.original-nicht-anzeigbar', { endung }) : t('ablage.dokumente.original-nicht-anzeigbar-ohne')}</p>
      {herunterladen && (
        <Knopf
          symbol="herunterladen"
          onClick={() => {
            location.assign(dokumentUrl(x.id, true));
          }}>
          {t('ablage.dokumente.original-herunterladen')}
        </Knopf>
      )}
    </div>
  );
}

/** Eine Seite: Bild, darüber die Wörter (zum Markieren) und die Rahmen (zum Ziehen und Anklicken). */
function Seite({
  x,
  nr,
  s,
  archiv,
  marken,
  hervor,
  setHervor,
  insAktive,
  weg = false,
}: {
  x: Dokument;
  nr: number;
  s: SchwaerzSeite;
  archiv: boolean;
  marken: Marke[];
  hervor: string | null;
  setHervor(k: string | null): void;
  insAktive(n: Nutzlast, eigenesFeld?: string): void;
  /** Leerseite (#997): fällt beim Übernehmen weg – blass. */
  weg?: boolean;
}) {
  const [wahl, setWahl] = useState<{ von: number; bis: number; zieht: boolean } | null>(null);
  const prozent = (a: { x: number; y: number; b: number; h: number }) => ({
    left: `${a.x * 100}%`,
    top: `${a.y * 100}%`,
    width: `${a.b * 100}%`,
    height: `${a.h * 100}%`,
  });
  const hier = marken.flatMap((m) =>
    m.bereiche
      .filter((b) => b.seite === nr)
      .map((b, i) => ({ m, b, erster: i === 0 && m.bereiche.findIndex((y) => y.seite === nr) === m.bereiche.indexOf(b) })),
  );
  const gewaehlt = wahl ? [Math.min(wahl.von, wahl.bis), Math.max(wahl.von, wahl.bis)] : null;
  function fertig() {
    if (!wahl || !gewaehlt) return;
    const text = s.woerter
      .slice(gewaehlt[0], gewaehlt[1] + 1)
      .map((y) => y[0])
      .join(' ');
    setWahl({ ...wahl, zieht: false });
    if (text.trim()) insAktive({ text });
  }
  return (
    <figure className={`ue-seite ${grosseSeite(weg)}`} data-leer={weg ? 'ja' : undefined}>
      <div
        className={`ue-flaeche${s.breite > 1 && s.hoehe > 1 ? ' mass' : ''}`}
        style={s.breite > 1 && s.hoehe > 1 ? { aspectRatio: `${s.breite} / ${s.hoehe}` } : undefined}
        onPointerUp={() => {
          if (wahl?.zieht) fertig();
        }}
        onPointerLeave={() => {
          if (wahl?.zieht) fertig();
        }}>
        <img
          src={schwaerzBildUrl(x, nr, archiv)}
          alt={t('ablage.uebernehmen.seite', { nr })}
          loading={nr <= 2 ? 'eager' : 'lazy'}
          draggable={false}
        />
        {s.woerter.map((y, k) => (
          <span
            key={k}
            className={`ue-wort${gewaehlt && k >= gewaehlt[0] && k <= gewaehlt[1] ? ' an' : ''}`}
            style={prozent({ x: y[1], y: y[2], b: y[3], h: y[4] })}
            onPointerDown={(e: ReactPointerEvent) => {
              if (e.button > 0) return;
              e.preventDefault();
              setWahl({ von: k, bis: k, zieht: true });
            }}
            onPointerEnter={() => {
              if (wahl?.zieht) setWahl({ ...wahl, bis: k });
            }}
          />
        ))}
        {hier.map(({ m, b, erster }, k) => (
          <span
            key={`r${k}`}
            className={`ue-rahmen ${farbeVon(m.nr)}${hervor === m.feldKey ? ' an' : ''}${m.beleg !== undefined ? ' beleg' : ''}`}
            style={prozent(b as Bereich)}
            draggable
            role="button"
            tabIndex={erster ? 0 : -1}
            aria-label={t('ablage.uebernehmen.rahmen', { nr: m.nr, text: m.nutzlast.text })}
            title={t('ablage.uebernehmen.rahmen-titel', { text: m.nutzlast.text })}
            onDragStart={(e) => setzeNutzlast(e, m.nutzlast)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseEnter={() => setHervor(m.feldKey)}
            onMouseLeave={() => setHervor(null)}
            onFocus={() => setHervor(m.feldKey)}
            onBlur={() => setHervor(null)}
            onClick={() => insAktive(m.nutzlast, m.feldKey)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                insAktive(m.nutzlast, m.feldKey);
              }
            }}>
            {erster && <span className="ue-rahmen-nr">{m.nr}</span>}
          </span>
        ))}
      </div>
      <figcaption className="leise klein">
        {t('ablage.uebernehmen.seite', { nr })}
        <GrosseSeiteMarke weg={weg} />
      </figcaption>
    </figure>
  );
}
