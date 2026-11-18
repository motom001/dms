import { teileVon } from '../../../shared/src/zusammengesetzt';
import { FELDTYPEN, feldtypName, jedeMappe, VERWEISARTEN, zieleVon, type Feld as FeldDef } from '../../../shared/src/model';
import { formatName, HEUTE, istFeldformat } from '../../../shared/src/feldformate';
import { ERKENNUNG_FELDTYPEN, WIEDERFINDEN_FELDTYPEN } from '../../../shared/src/erkennung';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { t, t as tx } from '../sprache';
import { Feld, HakenFeld, Knopf } from '../bausteine';
import { AnzeigeChip, AnzeigeEditor } from './Anzeige';
import { OptionenBeschriftung, SprachText } from './Beschriftung';
import { ErkennungEditor, WiederfindenEditor } from './FeldEigenschaften';
import { feldBesonders, haken, StandardWert, type FeldZeileProps } from './FeldArten';

/**
 * Eine Zeile der Feldliste im Mappentyp-Editor (#1279 aus Einrichtung.tsx gezogen): zugeklappt Name, Kennung, Feldart
 * und Merkmale als Chips, aufgeklappt alle Eigenschaften des Felds.
 */
export function FeldZeile(p: FeldZeileProps) {
  const { f, offen, fehler } = p;
  const id = (x: string) => `f${p.i}-${x}`;
  return (
    <div
      {...p.zieh}
      className={`feldzeile ${offen ? 'offen' : ''} ${fehler ? 'fehlerhaft' : ''} ${f.ausgeblendet || p.registerAusgeblendet ? 'ausgeblendet' : ''} ${p.zieh.className}`}>
      <FeldSumme p={p} />
      {fehler && !offen && <p className="fehlertext eingerueckt">{fehler.join(' ')}</p>}
      {offen && <FeldEditor p={p} id={id} />}
    </div>
  );
}

/** Berechnet (#1034): von welchem Paket – oder „nicht mehr berechnet“; nach „freigeben“ nicht mehr. */
function berechnung(p: FeldZeileProps) {
  const { f } = p;
  const berechnetVon = f.berechnetVon && !f._freigeben ? f.berechnetVon : undefined;
  const bInfo = berechnetVon ? p.berechnung?.[berechnetVon] : undefined;
  return { berechnetVon, bInfo, bPaket: bInfo?.name ?? berechnetVon ?? '' };
}

/** Ziele (#1036): einer oder mehrere Mappentypen; „jede Mappe“ nur an Systemfeldern. */
function zielNamen(p: FeldZeileProps) {
  const { f } = p;
  const zielNameVon = (z: string) =>
    z === p.eigeneId
      ? p.eigenerName || t('mappentypen.editor.dieser-mappentyp')
      : (p.typen.find((mappentyp) => mappentyp.id === z)?.name ?? '–');
  const ziele = zieleVon(f);
  const zielName = jedeMappe(f)
    ? t('mappentypen.editor.jede-mappe')
    : ziele.length
      ? ziele.map(zielNameVon).join(', ')
      : f.zielOptional?.length
        ? t('mappentypen.editor.ziele-offen')
        : '–';
  return { zielNameVon, zielName };
}

/** Chips der zugeklappten Zeile: Merkmale des Felds in fester Reihenfolge. */
function feldChips(p: FeldZeileProps): string[] {
  const { f } = p;
  const chips: string[] = [];
  const { berechnetVon, bInfo, bPaket } = berechnung(p);
  if (f.system) chips.push(t('mappentypen.editor.system'));
  if (berechnetVon)
    chips.push(bInfo?.aktiv === false ? t('mappentypen.berechnet.chip-nicht-mehr') : t('mappentypen.berechnet.chip', { paket: bPaket }));
  // Pflicht als Chip statt „*“ (#1213, C4).
  if (f.pflicht) chips.push(t('mappentypen.editor.chip.pflicht'));
  if (f.ausgeblendet || p.registerAusgeblendet) chips.push(t('mappentypen.darstellung.chip.ausgeblendet'));
  if (f.eindeutig && (f.typ === 'text' || f.typ === 'zahl' || f.typ === 'zusammengesetzt')) chips.push('eindeutig');
  // Zusammengesetzt (#1050): aus welchen Feldern.
  if (f.typ === 'zusammengesetzt' && f.vorlage) {
    const teile = teileVon(p.alleFelder, f);
    if (teile.length) chips.push(t('mappentypen.zusammengesetzt.chip', { felder: teile.map((x) => x.label || x.key).join(', ') }));
  }
  return [...chips, ...verweisChips(p), ...weitereChips(p)];
}

/** Chips zu Verweis, Tabelle, Auswahl und Register. */
function verweisChips(p: FeldZeileProps): string[] {
  const { f } = p;
  const chips: string[] = [];
  const { zielNameVon, zielName } = zielNamen(p);
  if (f.typ === 'referenz') chips.push(`→ ${zielName}`, VERWEISARTEN[f.verweisart ?? 'bezug']);
  if (f.typ === 'tabelle' && f.quelle?.typId) chips.push(`← ${zielNameVon(f.quelle.typId)}`);
  if (f.typ === 'auswahl') chips.push(t('mappentypen.editor.werte', { zahl: (f.optionen ?? []).length }));
  if (f.mehrfach && (f.typ === 'auswahl' || f.typ === 'referenz')) chips.push('mehrfach');
  if (f.typ === 'referenz' && f.mehrfach && f.gleicherTyp) chips.push(t('mappentypen.editor.chip.gleicher-typ'));
  if (p.feldregister.length > 1)
    chips.push(t('mappentypen.editor.register', { wert: p.feldregister.find((r) => r.key === f._register)?.name ?? '–' }));
  return [...chips, ...paketChips(p)];
}

/** Chips zu Erkennung und Wiederfinden (#938), dann die eines Verweisfelds aus einem Paket: Folgt aus (#534), Vorbelegen, aus Text. */
function paketChips(p: FeldZeileProps): string[] {
  const { f } = p;
  const chips: string[] = [];
  if (f.erkennung && ERKENNUNG_FELDTYPEN.includes(f.typ)) chips.push(t('mappentypen.editor.chip.aus-dokument'));
  if (f.wiederfinden && WIEDERFINDEN_FELDTYPEN.includes(f.typ)) chips.push(t('mappentypen.editor.chip.wiederfinden'));
  if (f.typ !== 'referenz') return chips;
  // Paket-Update (#534): Verweisfeld, das sich aus einem alten Textfeld füllen lässt.
  if (f.folgtAus)
    chips.push(
      t('mappentypen.editor.folgt-aus-chip', { feld: p.alleFelder.find((x) => x.key === f.folgtAus!.feld)?.label ?? f.folgtAus.feld }),
    );
  if (f.vorbelegen?.length) chips.push(t('mappentypen.editor.vorbelegen-chip', { anzahl: f.vorbelegen.length }));
  if (f.ausText) chips.push(tx('pakete.typ.austext', { aus: p.alleFelder.find((x) => x.key === f.ausText)?.label ?? f.ausText }));
  return chips;
}

/** Chips zu Format, Datumsgrenzen (#535), Frist, negativen Beträgen, eigener Organisation (#995) und Schreibschutz. */
function weitereChips(p: FeldZeileProps): string[] {
  const { f } = p;
  const chips: string[] = [];
  if (f.typ === 'text' && istFeldformat(f.format)) chips.push(t('felder.editor.chip.format', { format: formatName(f.format) }));
  const grenzeText = (g: string) =>
    g === HEUTE
      ? t('felder.editor.datum.heute')
      : /^\d{4}-\d{2}-\d{2}$/.test(g)
        ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}`
        : g;
  if (f.typ === 'datum' && f.min) chips.push(t('felder.editor.chip.min', { datum: grenzeText(f.min) }));
  if (f.typ === 'datum' && f.max) chips.push(t('felder.editor.chip.max', { datum: grenzeText(f.max) }));
  if (f.typ === 'datum' && f.frist) chips.push(t('felder.editor.chip.frist'));
  if (f.typ === 'betrag' && f.negativ) chips.push(t('mappentypen.editor.chip.negativ'));
  // Eigene Organisation (#995): Merkmal und Schreibschutz kommen aus dem Paket und bleiben, wie sie sind.
  if (f.typ === 'janein' && f.merkmal === 'eigeneOrganisation') chips.push(t('mappentypen.editor.chip.eigene-organisation'));
  if (f.schreibschutz) chips.push(t('mappentypen.editor.chip.schreibschutz'));
  return chips;
}

/** Zugeklappte Zeile: Griff, Knopf zum Aufklappen mit Name, Kennung, Feldart und Chips, Pfeile zum Verschieben. */
function FeldSumme({ p }: { p: FeldZeileProps }) {
  const { f, i, offen } = p;
  const chips = feldChips(p);
  return (
    <div className="feldsumme">
      {p.griff}
      <Knopf art="eigen" className="feldkopfknopf" aria-expanded={offen} onClick={p.umschalten}>
        <span className="flabel">{f.label || t('mappentypen.editor.ohne-bezeichnung')}</span>
        <code className="fkey">{f.key}</code>
        <span className="ftyp">{feldtypName(f.typ)}</span>
        {(chips.length > 0 || f.anzeigen) && (
          <span className="chips">
            {chips.map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))}
            <AnzeigeChip regel={f.anzeigen} typ={{ felder: p.alleFelder }} />
          </span>
        )}
      </Knopf>
      <div className="feldaktionen">
        <Knopf gesperrt={i === 0} onClick={() => p.verschiebe(-1)} nurSymbol={t('mappentypen.editor.feld-nach-oben')}>
          <Symbol name="sortiert-auf" />
        </Knopf>
        <Knopf gesperrt={i === p.anzahl - 1} onClick={() => p.verschiebe(1)} nurSymbol={t('mappentypen.editor.feld-nach-unten')}>
          <Symbol name="sortiert-ab" />
        </Knopf>
      </div>
    </div>
  );
}

/** Aufgeklappte Zeile: alle Eigenschaften des Felds. */
function FeldEditor({ p, id }: { p: FeldZeileProps; id: (x: string) => string }) {
  const { f, fehler, setze } = p;
  const besonders = feldBesonders({ p, id });
  return (
    <div className="feldeditor">
      {fehler && (
        <div className="hinweis schlecht">
          <p>{fehler.join(' ')}</p>
        </div>
      )}
      {f.system && <p className="leise klein">{t('mappentypen.editor.systemfeld-bezeichnung-hilfetext-und')}</p>}
      <BerechnetHinweis p={p} />
      <FeldNamen p={p} id={id} />
      {/* Bei Systemfeldern sind Schlüssel, Datentyp und Eigenschaften fest. */}
      <fieldset className="ohnerahmen" disabled={f.system}>
        <FeldKennungUndArt p={p} id={id} />
        <FeldMerkmale p={p} id={id} />
        {/* Anzeigen, wenn … (#1033): nie an Systemfeldern. */}
        {!f.system && (
          <AnzeigeEditor
            regel={f.anzeigen}
            setze={(anzeigen) => setze({ anzeigen })}
            typ={{ felder: p.alleFelder }}
            eigene={[f.key]}
            typen={p.typen}
          />
        )}
        {besonders && (
          <>
            <h3 className="zwischen">{t('mappentypen.editor.eigenschaften-fuer', { FELDTYPEN: feldtypName(f.typ) })}</h3>
            {besonders}
          </>
        )}
        {ERKENNUNG_FELDTYPEN.includes(f.typ) && <ErkennungEditor f={f} id={id} setze={setze} />}
        {WIEDERFINDEN_FELDTYPEN.includes(f.typ) && <WiederfindenEditor f={f} setze={setze} />}
      </fieldset>
      {/* Beschriftungen der festen Werte (#728) – auch an Systemfeldern wie Stand oder Kanal der Post. */}
      {f.typ === 'auswahl' && (
        <OptionenBeschriftung
          id={id('optbeschr')}
          optionen={f.optionen ?? []}
          beschriftungen={f.beschriftungen}
          setze={(b) => setze({ beschriftungen: b as FeldDef['beschriftungen'] })}
        />
      )}
      <div className="feldfuss">
        {/* Entfernen fragt selbst nach (mit der Zahl betroffener Mappen) und wirkt erst beim Speichern. */}
        {f.system ? (
          <span className="leise klein">{t('mappentypen.editor.systemfelder-lassen-sich-nicht')}</span>
        ) : (
          <Knopf symbol="geloescht" onClick={p.entferne}>
            {t('mappentypen.editor.feld-entfernen-2')}
          </Knopf>
        )}
        <Knopf onClick={p.umschalten}>{t('mappentypen.editor.zuklappen')}</Knopf>
      </div>
    </div>
  );
}

/** Berechnet (#1034): nur das Paket schreibt den Wert; freigeben erst, wenn es nicht mehr rechnet. */
function BerechnetHinweis({ p }: { p: FeldZeileProps }) {
  const { f, setze } = p;
  const { berechnetVon, bInfo, bPaket } = berechnung(p);
  return (
    <>
      {berechnetVon && (
        <div className={`hinweis ${bInfo?.aktiv === false ? 'warn' : 'info'} berechnetinfo`} data-anker="mappentyp.berechnet">
          <p>
            <Symbol name="rechnen" />{' '}
            {bInfo?.aktiv === false
              ? t('mappentypen.berechnet.nicht-mehr', { paket: bPaket })
              : t('mappentypen.berechnet.aktiv', { paket: bPaket })}{' '}
            <Hilfe ort="mappentyp.berechnet" />
          </p>
          {bInfo?.aktiv === false && (
            <p>
              <Knopf art="neben" groesse="klein" onClick={() => setze({ _freigeben: true })}>
                {t('mappentypen.berechnet.freigeben')}
              </Knopf>
            </p>
          )}
        </div>
      )}
      {f.berechnetVon && f._freigeben && (
        <div className="hinweis info berechnetinfo">
          <p>
            {t('mappentypen.berechnet.wird-freigegeben')}{' '}
            <Knopf groesse="klein" onClick={() => setze({ _freigeben: undefined })}>
              {t('mappentypen.berechnet.rueckgaengig')}
            </Knopf>
          </p>
        </div>
      )}
    </>
  );
}

/** Bezeichnung, Hilfetext (#372: bei allen Feldarten an derselben Stelle) und Register. */
function FeldNamen({ p, id }: { p: FeldZeileProps; id: (x: string) => string }) {
  const { f, setze } = p;
  return (
    <div className="raster">
      <SprachText
        beschriftung={t('mappentypen.editor.bezeichnung')}
        hinweis={f.typ === 'tabelle' ? t('mappentypen.tabelle.beschriftung-hilfe') : undefined}
        id={id('label')}
        wert={f.label}
        placeholder={t('mappentypen.editor.z-b-kuendigung-bis')}
        autoFocus={f._neu}
        teil="label"
        beschriftungen={f.beschriftungen}
        setzeWert={(label) => setze({ label })}
        setzeBeschriftungen={(b) => setze({ beschriftungen: b as FeldDef['beschriftungen'] })}
      />
      {/* Hilfetext neben der Bezeichnung, bei allen Feldarten an derselben Stelle (#372). */}
      <SprachText
        beschriftung={t('mappentypen.editor.hilfetext')}
        optional
        id={id('hilfe')}
        wert={f.hilfe ?? ''}
        placeholder={t('mappentypen.editor.erklaerung-die-beim-ausfuellen')}
        teil="hilfe"
        beschriftungen={f.beschriftungen}
        setzeWert={(hilfe) => setze({ hilfe })}
        setzeBeschriftungen={(b) => setze({ beschriftungen: b as FeldDef['beschriftungen'] })}
      />
      {p.feldregister.length > 1 && (
        <Feld beschriftung={t('mappentypen.editor.register-2')}>
          <select id={id('reg')} value={f._register} onChange={(e) => setze({ _register: e.target.value })}>
            {p.feldregister.map((r) => (
              <option key={r._uid} value={r.key}>
                {r.name || r.key}
              </option>
            ))}
          </select>
        </Feld>
      )}
    </div>
  );
}

/** Kennung (fest nach dem Speichern) und Feldart. */
function FeldKennungUndArt({ p, id }: { p: FeldZeileProps; id: (x: string) => string }) {
  const { f, setze } = p;
  return (
    <div className="raster">
      <Feld
        beschriftung={t('mappentypen.editor.kennung-2')}
        hinweis={f._neu ? t('mappentypen.editor.wird-nach-dem-speichern') : t('mappentypen.editor.fest-schuetzt-gespeicherte-werte')}>
        <input id={id('key')} className="mono" value={f.key} readOnly={!f._neu} onChange={(e) => setze({ key: e.target.value })} />
      </Feld>
      <Feld beschriftung={t('mappentypen.editor.feldart')}>
        <select id={id('typ')} value={f.typ} onChange={(e) => setze({ typ: e.target.value as FeldDef['typ'] })}>
          {(Object.keys(FELDTYPEN) as FeldDef['typ'][]).map((k) => (
            <option key={k} value={k}>
              {feldtypName(k)}
            </option>
          ))}
        </select>
      </Feld>
    </div>
  );
}

/** Pflicht, Ausblenden, eindeutig und Standardwert. */
function FeldMerkmale({ p, id }: { p: FeldZeileProps; id: (x: string) => string }) {
  const { f, setze } = p;
  return (
    <div className="raster">
      {/* Ausgeblendete Felder (#655) können nicht Pflicht sein – sonst ließe sich keine Mappe speichern. */}
      {/* Tabellen (#1030) haben keinen Wert – nie Pflicht. */}
      {f.typ !== 'tabelle' && (
        <div className="eigenschaft unten">
          <PflichtHaken p={p} />
        </div>
      )}
      <div className="eigenschaft unten">
        <HakenFeld
          beschriftung={t('mappentypen.darstellung.ausblenden')}
          hinweis={
            p.registerAusgeblendet && !f.ausgeblendet
              ? t('mappentypen.darstellung.register-ausgeblendet')
              : t('mappentypen.darstellung.ausblenden-hilfe')
          }>
          <input type="checkbox" checked={!!f.ausgeblendet} onChange={(ev) => p.ausblenden(ev.target.checked)} />
        </HakenFeld>
      </div>
      {(f.typ === 'text' || f.typ === 'zahl') && (
        <div className="eigenschaft unten">
          {haken(f, setze, 'eindeutig', t('mappentypen.editor.eindeutig'), t('mappentypen.editor.wert-darf-je-mappentyp'))}
        </div>
      )}
      {/* Zusammengesetzt (#1050): eindeutig als Kombination, z. B. Rechnungsnummer je Absender. */}
      {f.typ === 'zusammengesetzt' && (
        <div className="eigenschaft unten">
          {haken(f, setze, 'eindeutig', t('mappentypen.editor.eindeutig'), t('mappentypen.zusammengesetzt.eindeutig-hilfe'))}
        </div>
      )}
      <StandardWert f={f} id={id} setze={setze} />
    </div>
  );
}

/** Pflichtfeld – gesperrt mit Grund bei ausgeblendeten, berechneten und zusammengesetzten Feldern. */
function PflichtHaken({ p }: { p: FeldZeileProps }) {
  const { f, setze } = p;
  const { berechnetVon } = berechnung(p);
  if (!(f.ausgeblendet || p.registerAusgeblendet || berechnetVon || f.typ === 'zusammengesetzt'))
    return haken(f, setze, 'pflicht', t('mappentypen.editor.pflichtfeld'), t('mappentypen.editor.mappe-laesst-sich-ohne'));
  return (
    <HakenFeld
      beschriftung={t('mappentypen.editor.pflichtfeld')}
      hinweis={
        <>
          <Symbol name="schloss" />{' '}
          {f.typ === 'zusammengesetzt'
            ? t('mappentypen.zusammengesetzt.nie-pflicht')
            : berechnetVon
              ? t('mappentypen.berechnet.nie-pflicht')
              : f._pflichtWeg
                ? t('mappentypen.darstellung.pflicht-aufgehoben')
                : t('mappentypen.darstellung.nie-pflicht')}
        </>
      }>
      <input type="checkbox" checked={false} disabled />
    </HakenFeld>
  );
}
