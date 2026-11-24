import type { ReactNode } from 'react';
import { AuswahlFilter } from '../werkbank/Sichten';
import { ZusammengesetztEditor } from './Zusammengesetzt';
import { TabellenEditor } from './Tabelle';
import { VorbelegenEditor } from './Vorbelegen';
import { kreisImStandard } from '../../../shared/src/nummernkreis';
import { einzigesZiel, gemeinsameFelder, jedeMappe, zieleVon, type Feld as FeldDef, type Mappentyp } from '../../../shared/src/model';
import { optionText } from '../../../shared/src/beschriftung';
import { t } from '../sprache';
import { DatumEingabe, Feld, FeldGruppe, HakenFeld } from '../bausteine';
import { standardAnzeige, type EntwurfFeld, type EntwurfRegister, type Zahlprop } from './entwurf';
import { DatumGrenzen, FolgtAusEditor, FormatEditor, FristEditor, ZielTypenWahl } from './FeldEigenschaften';

/**
 * Eigenschaften je Feldart und Standardwert im Mappentyp-Editor (#1279 aus `FeldZeile` gezogen). Hier stehen auch die
 * Angaben, die eine Feldzeile vom Editor bekommt.
 */
export interface FeldZeileProps {
  f: EntwurfFeld;
  i: number;
  anzahl: number;
  offen: boolean;
  fehler?: string[];
  eigeneId: string;
  eigenerName: string;
  typen: Mappentyp[];
  feldregister: EntwurfRegister[];
  /** Fristen (#129): Benutzerfelder dieses Typs als möglicher Empfänger. */
  benutzerFelder: Array<{ key: string; label: string }>;
  /** Auswahlfilter (#173): die Felder dieses Typs, deren Werte der Filter nutzen kann. */
  alleFelder: FeldDef[];
  umschalten(): void;
  verschiebe(r: number): void;
  entferne(): void;
  setze(patch: Partial<EntwurfFeld>): void;
  /** Ausblenden (#655): an mit Rückfrage, wenn das FeldDef noch genutzt wird; aus sofort. */
  ausblenden(an: boolean): void;
  /** Das Register des Felds ist ausgeblendet – dann ist es das FeldDef auch. */
  registerAusgeblendet: boolean;
  /** Berechnete Felder (#1034): je Paket Name und ob es noch rechnet. */
  berechnung?: Mappentyp['berechnung'];
  zieh: { className: string };
  griff: ReactNode;
}

type Teil = { p: FeldZeileProps; id: (x: string) => string };

/** Eingabe einer Zahl-Eigenschaft (als Aufruf, nicht als Komponente: React verwendet die Elemente beim Wechsel der Feldart weiter wie bisher). */
function zahlEingabe({ f, id, setze }: Basis, prop: Zahlprop, label: string, platzhalter: string) {
  return (
    <Feld beschriftung={label}>
      <input
        id={id(prop)}
        inputMode="decimal"
        placeholder={platzhalter}
        value={f[prop]}
        onChange={(e) => setze({ [prop]: e.target.value } as Partial<EntwurfFeld>)}
      />
    </Feld>
  );
}
type Basis = { f: EntwurfFeld; id: (x: string) => string; setze(patch: Partial<EntwurfFeld>): void };

/** Haken an einer Eigenschaft – als Aufruf wie `zahlEingabe`. */
export function haken(
  f: EntwurfFeld,
  setze: (patch: Partial<EntwurfFeld>) => void,
  prop: 'pflicht' | 'eindeutig' | 'mehrfach' | 'negativ',
  label: string,
  hilfe: string,
) {
  return (
    <HakenFeld beschriftung={label} hinweis={hilfe}>
      <input type="checkbox" checked={!!f[prop]} onChange={(e) => setze({ [prop]: e.target.checked })} />
    </HakenFeld>
  );
}

/**
 * Eigenschaften für die Feldart des Felds – oder null, wenn sie keine eigenen hat. Die Teile werden aufgerufen, nicht als
 * Komponenten eingesetzt: Beim Wechsel der Feldart verwendet React die Eingaben an derselben Stelle weiter wie bisher.
 */
export function feldBesonders({ p, id }: Teil): ReactNode {
  const { f, setze } = p;
  const b = { f, id, setze };
  if (f.typ === 'text' || f.typ === 'langtext' || f.typ === 'formatiert') return textEigenschaften(b, p.alleFelder);
  if (f.typ === 'zahl' || f.typ === 'prozent')
    return (
      <div className="raster">
        {zahlEingabe(b, 'min', t('mappentypen.editor.minimum'), t('mappentypen.editor.leer.keins'))}
        {zahlEingabe(b, 'max', t('mappentypen.editor.maximum'), t('mappentypen.editor.leer.keins'))}
        {zahlEingabe(b, 'nachkomma', t('mappentypen.editor.nachkommastellen'), t('mappentypen.editor.leer.beliebig'))}
      </div>
    );
  if (f.typ === 'betrag') return betragEigenschaften(b);
  if (f.typ === 'zeitraum') return <p className="leise klein">{t('mappentypen.editor.zeitraum-hilfe')}</p>;
  if (f.typ === 'auswahl') return auswahlEigenschaften(b);
  if (f.typ === 'datum')
    return (
      <>
        <DatumGrenzen f={f} id={id} setze={setze} />
        <FristEditor f={f} id={id} setze={setze} benutzerFelder={p.benutzerFelder} />
      </>
    );
  if (f.typ === 'passwort') return <p className="leise klein">{t('mappentypen.editor.wird-verschluesselt-gespeichert-und')}</p>;
  // Zusammengesetzt (#1050): Vorlage aus Platzhaltern, Knöpfe zum Einfügen der Felder dieses Typs.
  if (f.typ === 'zusammengesetzt') return <ZusammengesetztEditor f={f} id={id} felder={p.alleFelder} setze={setze} />;
  // Tabelle (#1030): Quelle wie ein Verknüpfungsregister, Spalten aus einer Trefferliste des anderen Typs, „+ Neu“.
  if (f.typ === 'tabelle')
    return (
      <TabellenEditor
        f={f}
        id={id}
        eigeneId={p.eigeneId}
        eigenerName={p.eigenerName}
        typen={p.typen}
        eigeneFelder={p.alleFelder}
        setze={setze}
      />
    );
  if (f.typ === 'referenz') return <ReferenzEigenschaften p={p} id={id} />;
  return null;
}

function textEigenschaften(b: Basis, alleFelder: FeldDef[]) {
  const { f, id, setze } = b;
  return (
    <div className="raster">
      {zahlEingabe(b, 'minLen', t('mappentypen.editor.mindestlaenge'), t('mappentypen.editor.leer.keine'))}
      {zahlEingabe(b, 'maxLen', t('mappentypen.editor.hoechstlaenge'), t('mappentypen.editor.leer.keine'))}
      {f.typ === 'text' && (
        <Feld beschriftung={t('mappentypen.editor.muster')} hinweis={t('mappentypen.editor.regulaerer-ausdruck')}>
          <input
            id={id('muster')}
            className="mono"
            placeholder="z. B. [A-Z]{2}-\d+"
            value={f.muster ?? ''}
            onChange={(e) => setze({ muster: e.target.value })}
          />
        </Feld>
      )}
      {f.typ === 'text' && <FormatEditor f={f} id={id} setze={setze} alleFelder={alleFelder} />}
    </div>
  );
}

function betragEigenschaften(b: Basis) {
  const { f, id, setze } = b;
  return (
    <div className="raster">
      {zahlEingabe(b, 'min', t('mappentypen.editor.minimum'), t('mappentypen.editor.leer.keins'))}
      {zahlEingabe(b, 'max', t('mappentypen.editor.maximum'), t('mappentypen.editor.leer.keins'))}
      <Feld beschriftung={t('mappentypen.editor.standardwaehrung')}>
        <input
          id={id('waehrung')}
          className="mono"
          maxLength={3}
          value={f.waehrung ?? 'EUR'}
          onChange={(e) => setze({ waehrung: e.target.value.toUpperCase() })}
        />
      </Feld>
      {/* Negative Beträge (#1035): Vorgabe aus, also wie bisher ≥ 0. */}
      <div className="eigenschaft unten">
        {haken(f, setze, 'negativ', t('mappentypen.editor.negativ'), t('mappentypen.editor.negativ-hilfe'))}
      </div>
    </div>
  );
}

function auswahlEigenschaften(b: Basis) {
  const { f, id, setze } = b;
  return (
    <div className="raster">
      <Feld beschriftung={t('mappentypen.editor.auswahlwerte')} hinweis={t('mappentypen.editor.einer-pro-zeile')}>
        <textarea
          id={id('optionen')}
          rows={4}
          defaultValue={(f.optionen ?? []).join('\n')}
          onBlur={(e) =>
            setze({
              optionen: e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </Feld>
      <div className="eigenschaft unten">
        {haken(f, setze, 'mehrfach', t('mappentypen.editor.mehrfachauswahl'), t('mappentypen.editor.mehrere-werte-gleichzeitig-waehlbar'))}
      </div>
    </div>
  );
}

/** Verweisfeld: Ziele, Art des Verweises, mehrere, Auswahlfilter (#172), Folgt aus (#886), Vorbelegen (#1037). */
function ReferenzEigenschaften({ p, id }: Teil) {
  const { f, setze } = p;
  const ziele = zieleVon(f);
  return (
    <>
      <div className="raster">
        <div className="eigenschaft">
          <label htmlFor={id('ziel')}>{t('mappentypen.editor.verweist-auf-mappen-vom')}</label>
          {jedeMappe(f) ? (
            <p className="leise">{t('mappentypen.editor.jede-mappe')}</p>
          ) : (
            <ZielTypenWahl id={id('ziel')} f={f} typen={p.typen} eigeneId={p.eigeneId} eigenerName={p.eigenerName} setze={setze} />
          )}
          <small className="hilfe">
            {t('mappentypen.editor.dieser-mappentyp-ergibt-eine')} {t('mappentypen.editor.mehrere-ziele-hilfe')}
          </small>
        </div>
        <VerweisArt f={f} id={id} setze={setze} />
        <div className="eigenschaft unten">
          {haken(f, setze, 'mehrfach', t('mappentypen.editor.mehrere-mappen-erlaubt'), t('mappentypen.editor.z-b-eine-zahlung'))}
          {/* „Alle vom selben Typ“ (#1036): nur mit mehreren Mappen und mehr als einem möglichen Zieltyp. */}
          {f.mehrfach && (ziele.length > 1 || !!f.zielOptional?.length) && (
            <HakenFeld beschriftung={t('mappentypen.editor.gleicher-typ')} hinweis={t('mappentypen.editor.gleicher-typ-hilfe')}>
              <input type="checkbox" checked={!!f.gleicherTyp} onChange={(e) => setze({ gleicherTyp: e.target.checked || undefined })} />
            </HakenFeld>
          )}
        </div>
      </div>
      {/* Auswahlfilter (#172): nicht für „jede Mappe“. Eigene Zeile in voller Breite (#372) – Bedingungen brauchen Platz.
      Mehrere Zieltypen (#1036): Bedingungen über die Felder, die alle haben. */}
      {ziele.length > 0 && <ZielFilter p={p} ziele={ziele} />}
      {/* Folgt aus (#886): nur bei genau einem Ziel-Mappentyp. */}
      {!!einzigesZiel(f) && (
        <FolgtAusEditor
          f={f}
          id={id}
          setze={setze}
          alleFelder={p.alleFelder}
          felderVon={(x) => (x === p.eigeneId ? p.alleFelder : p.typen.find((y) => y.id === x)?.felder)}
        />
      )}
      {/* Beim Auswählen übernehmen (#1037): auch mit mehreren Zieltypen – je Typ, der das FeldDef hat. */}
      {!jedeMappe(f) && ziele.length > 0 && (
        <VorbelegenEditor
          f={f}
          id={id}
          setze={setze}
          alleFelder={p.alleFelder}
          zielListen={ziele
            .map((x) => (x === p.eigeneId ? p.alleFelder : p.typen.find((y) => y.id === x)?.felder))
            .filter((x): x is FeldDef[] => !!x)}
        />
      )}
    </>
  );
}

function VerweisArt({ f, id, setze }: Basis) {
  return (
    <FeldGruppe beschriftung={t('mappentypen.editor.art-des-verweises')}>
      <div className="feldstapel">
        <label className="haken">
          <input
            type="radio"
            name={id('va')}
            checked={f.verweisart === 'zugehoerigkeit'}
            onChange={() => setze({ verweisart: 'zugehoerigkeit' })}
          />
          <span>
            <span className="haken-titel">{t('mappentypen.editor.zugehoerigkeit')}</span>
            <small className="hilfe">{t('mappentypen.editor.gehoert-zu-zaehlt-bei')}</small>
          </span>
        </label>
        <label className="haken">
          <input type="radio" name={id('va')} checked={f.verweisart !== 'zugehoerigkeit'} onChange={() => setze({ verweisart: 'bezug' })} />
          <span>
            <span className="haken-titel">{t('mappentypen.editor.bezug')}</span>
            <small className="hilfe">{t('mappentypen.editor.nur-verknuepft-z-b')}</small>
          </span>
        </label>
      </div>
    </FeldGruppe>
  );
}

/** Auswahlfilter eines Verweisfelds; auf den eigenen Typ nicht möglich. */
function ZielFilter({ p, ziele }: { p: FeldZeileProps; ziele: string[] }) {
  const { f, setze } = p;
  if (ziele.includes(p.eigeneId)) return <p className="leise klein">{t('mappentypen.editor.einen-auswahlfilter-auf-diesen')}</p>;
  const zt = ziele.map((z) => p.typen.find((mappentyp) => mappentyp.id === z)).filter((x): x is Mappentyp => !!x);
  if (zt.length !== ziele.length) return null;
  const ziel =
    zt.length === 1
      ? zt[0]
      : { ...zt[0], id: '', name: zt.map((x) => x.name).join(', '), felder: gemeinsameFelder(zt.map((x) => x.felder)) };
  return (
    <div>
      <AuswahlFilter
        ziel={ziel}
        zielTypen={ziele}
        bedingungen={f.auswahlFilter ?? []}
        setze={(b) => setze({ auswahlFilter: b })}
        eigeneFelder={p.alleFelder}
        feldKey={f.key}
      />
    </div>
  );
}

/** Standardwert je Feldart (Text mit Nummernkreis, Datum, Ja/Nein, Auswahl) – oder nichts. */
export function StandardWert({ f, id, setze }: Basis) {
  if (
    f.typ === 'text' ||
    f.typ === 'langtext' ||
    f.typ === 'formatiert' ||
    f.typ === 'zahl' ||
    f.typ === 'betrag' ||
    f.typ === 'prozent' ||
    f.typ === 'zeitraum'
  )
    return (
      <Feld
        beschriftung={t('mappentypen.editor.standardwert-2')}
        optional
        hinweis={
          f.typ === 'text'
            ? kreisImStandard(f.standard)
              ? t('mappentypen.editor.nummernkreis-das-feld-wird')
              : t('mappentypen.editor.oder-nummernkreis-schluessel')
            : f.typ === 'zeitraum' && t('mappentypen.editor.zeitraum-standard')
        }>
        <input
          id={id('std')}
          placeholder={t('mappentypen.editor.leer')}
          value={standardAnzeige(f)}
          onChange={(e) => setze({ standard: e.target.value })}
        />
      </Feld>
    );
  if (f.typ === 'datum')
    return (
      <Feld beschriftung={t('mappentypen.editor.standardwert-2')} optional>
        <DatumEingabe id={id('std')} wert={String(f.standard ?? '')} setze={(w) => setze({ standard: w })} />
      </Feld>
    );
  if (f.typ === 'janein')
    return (
      <div className="eigenschaft unten">
        <HakenFeld beschriftung={t('mappentypen.editor.standardmaessig-ja')}>
          <input type="checkbox" checked={f.standard === true} onChange={(e) => setze({ standard: e.target.checked })} />
        </HakenFeld>
      </div>
    );
  if (f.typ === 'auswahl' && !f.mehrfach)
    return (
      <Feld beschriftung={t('mappentypen.editor.standardwert-2')} optional>
        <select id={id('std')} value={String(f.standard ?? '')} onChange={(e) => setze({ standard: e.target.value })}>
          <option value="">{t('mappentypen.editor.keiner')}</option>
          {(f.optionen ?? []).map((o) => (
            <option key={o} value={o}>
              {optionText(f, o)}
            </option>
          ))}
        </select>
      </Feld>
    );
  return null;
}
