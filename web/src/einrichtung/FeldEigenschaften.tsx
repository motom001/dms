import { useState } from 'react';
import { Mehrfachauswahl } from '../ablage/Mehrfachauswahl';
import { einzigesZiel, jedeMappe, zieleVon, type Feld as FeldDef } from '../../../shared/src/model';
import type { Mappentyp } from '../../../shared/src/model';
import { moeglicheQuellen, moeglicheZielFelder } from '../../../shared/src/folgtaus';
import { FRIST_STANDARD } from '../../../shared/src/fristen';
import { FELDFORMATE, formatName, HEUTE, type Feldformat } from '../../../shared/src/feldformate';
import { artenFuer, artVon, datumsPaare, ERKENNUNG_HINWEIS_MAX, ERKENNUNGSARTEN, type Erkennungsart } from '../../../shared/src/erkennung';
import { moeglicheDatumsfelder, moeglicheJahresfelder } from '../../../shared/src/ausdatum';
import { moeglicheReihenfolgefelder } from '../../../shared/src/auswahlreihenfolge';
import { Link } from '../ort';
import { t } from '../sprache';
import { DatumEingabe, Feld, HakenFeld } from '../bausteine';
import type { EntwurfFeld } from './entwurf';

/**
 * Einzelne Eigenschaften eines Felds im Mappentyp-Editor (#1279 aus Einrichtung.tsx gezogen): Format, Datumsgrenzen,
 * Frist, Aus Dokument füllen, Wiederfinden, Zieltypen, „Folgt aus“ und die Reihenfolge der Auswahl.
 */

/** Format eines Textfelds (#535); bei PLZ das FeldDef mit dem Land. */
export function FormatEditor({
  f,
  id,
  setze,
  alleFelder,
}: {
  f: EntwurfFeld;
  id: (x: string) => string;
  setze(p: Partial<EntwurfFeld>): void;
  alleFelder: FeldDef[];
}) {
  const laender = alleFelder.filter((x) => x.key !== f.key && (x.typ === 'text' || x.typ === 'auswahl'));
  return (
    <>
      <Feld beschriftung={t('felder.editor.format')} hilfe="mappentyp.format" hinweis={f.format && t('felder.editor.format.hilfe')}>
        <select
          id={id('format')}
          value={f.format ?? ''}
          onChange={(e) =>
            setze({ format: (e.target.value || null) as Feldformat | null, ...(e.target.value !== 'plz' ? { landFeld: null } : {}) })
          }>
          <option value="">{t('felder.editor.format.keins')}</option>
          {FELDFORMATE.map((x) => (
            <option key={x} value={x}>
              {formatName(x)}
            </option>
          ))}
        </select>
      </Feld>
      {f.format === 'plz' && (
        <Feld beschriftung={t('felder.editor.landfeld')} hinweis={t('felder.editor.landfeld.hilfe')}>
          <select id={id('landfeld')} value={f.landFeld ?? ''} onChange={(e) => setze({ landFeld: e.target.value || null })}>
            <option value="">{t('felder.editor.landfeld.keins')}</option>
            {laender.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
            {f.landFeld && !laender.some((x) => x.key === f.landFeld) && <option value={f.landFeld}>{f.landFeld}</option>}
          </select>
        </Feld>
      )}
    </>
  );
}

/** Grenzen eines Datumsfelds (#535): keine, heute oder ein festes Datum. */
export function DatumGrenzen({ f, id, setze }: { f: EntwurfFeld; id: (x: string) => string; setze(p: Partial<EntwurfFeld>): void }) {
  const eine = (prop: 'min' | 'max') => {
    const w = f[prop] ?? '';
    const art = !w ? '' : w === HEUTE ? HEUTE : 'fest';
    return (
      <Feld beschriftung={t(prop === 'min' ? 'felder.editor.datum.min' : 'felder.editor.datum.max')}>
        <span className="wertgruppe">
          <select
            id={id(prop)}
            value={art}
            onChange={(e) =>
              setze({
                [prop]:
                  e.target.value === HEUTE
                    ? HEUTE
                    : e.target.value === 'fest'
                      ? art === 'fest'
                        ? w
                        : new Date().toISOString().slice(0, 10)
                      : '',
              } as Partial<EntwurfFeld>)
            }>
            <option value="">{t('felder.editor.datum.keine')}</option>
            <option value={HEUTE}>{t('felder.editor.datum.heute')}</option>
            <option value="fest">{t('felder.editor.datum.fest')}</option>
          </select>
          {art === 'fest' && (
            <Feld beschriftung={t(prop === 'min' ? 'felder.editor.datum.min' : 'felder.editor.datum.max')} beschriftungVerbergen>
              <DatumEingabe wert={w} setze={(x) => setze({ [prop]: x } as Partial<EntwurfFeld>)} />
            </Feld>
          )}
        </span>
      </Feld>
    );
  };
  return (
    <div className="raster">
      {eine('min')}
      {eine('max')}
      <p className="leise klein ff-hinweis">{t('felder.editor.datum.hilfe')}</p>
    </div>
  );
}

/** FeldDef-Eigenschaft „Aus Dokument füllen“ (#336, #391; bis #938 „Für die Erkennung nutzen“): Art und Erkennungshinweis. */
export function ErkennungEditor({
  f,
  id,
  setze,
  alleFelder = [],
}: {
  f: EntwurfFeld;
  id: (x: string) => string;
  setze(p: Partial<EntwurfFeld>): void;
  alleFelder?: FeldDef[];
}) {
  const an = !!f.erkennung;
  const geschaetzt = artVon({ key: f.key, label: f.label, typ: f.typ, format: f.format });
  return (
    <div className="raster">
      <div className="eigenschaft unten">
        <HakenFeld
          beschriftung={t('mappentypen.editor.aus-dokument-fuellen')}
          hilfe="mappentyp.erkennung"
          hinweis={t('mappentypen.editor.aus-dokument-fuellen-hilfe')}>
          <input type="checkbox" checked={an} onChange={(e) => setze({ erkennung: e.target.checked ? {} : null })} />
        </HakenFeld>
      </div>
      {an && artenFuer(f.typ).length > 1 && (
        <Feld beschriftung={t('mappentypen.editor.was-steht-im-feld')}>
          <select
            id={id('erkart')}
            value={f.erkennung?.art ?? ''}
            onChange={(e) => setze({ erkennung: { ...f.erkennung, art: (e.target.value || undefined) as Erkennungsart | undefined } })}>
            <option value="">
              {t('mappentypen.editor.automatisch', {
                wert: geschaetzt ? ` – ${ERKENNUNGSARTEN[geschaetzt]}` : t('mappentypen.editor.nichts-erkannt'),
              })}
            </option>
            {artenFuer(f.typ).map((a) => (
              <option key={a} value={a}>
                {ERKENNUNGSARTEN[a]}
              </option>
            ))}
          </select>
        </Feld>
      )}
      {an && (
        <Feld beschriftung={t('mappentypen.editor.erkennungshinweis')} optional>
          <input
            id={id('erkhinweis')}
            maxLength={ERKENNUNG_HINWEIS_MAX}
            placeholder={t('mappentypen.editor.z-b-kundennummer-oben')}
            value={f.erkennung?.hinweis ?? ''}
            onChange={(e) => setze({ erkennung: { ...f.erkennung, hinweis: e.target.value } })}
          />
        </Feld>
      )}
      {an && f.typ === 'datum' && <ZeitraumEditor f={f} id={id} setze={setze} alleFelder={alleFelder} />}
    </div>
  );
}

/**
 * Zeitraum (#1646) am Datumsfeld für das Ende: „Ende des Zeitraums ab …“ – welches Datumsfeld den Beginn trägt. Ohne Wahl
 * ergibt es sich aus Kennung und Bezeichnung (Beginn/Ende, Von/Bis …); die Auswahl nennt, was Ablago dann annimmt.
 */
function ZeitraumEditor({
  f,
  id,
  setze,
  alleFelder,
}: {
  f: EntwurfFeld;
  id: (x: string) => string;
  setze(p: Partial<EntwurfFeld>): void;
  alleFelder: FeldDef[];
}) {
  const andere = alleFelder.filter((x) => x.typ === 'datum' && x.key && x.key !== f.key);
  if (!andere.length) return null;
  const ohneWahl = alleFelder.map((x) => (x.key === f.key ? { ...x, erkennung: { ...x.erkennung, endeVon: undefined } } : x));
  const auto = datumsPaare({ felder: ohneWahl as FeldDef[] }).find((p) => p.ende.key === f.key)?.beginn;
  return (
    <Feld beschriftung={t('mappentypen.editor.zeitraum-ende-von')} hinweis={t('mappentypen.editor.zeitraum-ende-von-hilfe')}>
      <select
        id={id('erkende')}
        value={f.erkennung?.endeVon ?? ''}
        onChange={(e) => setze({ erkennung: { ...f.erkennung, endeVon: e.target.value || undefined } })}>
        <option value="">
          {t('mappentypen.editor.automatisch', {
            wert: auto ? ` – ${auto.label || auto.key}` : t('mappentypen.editor.zeitraum-keiner'),
          })}
        </option>
        {andere.map((x) => (
          <option key={x.key} value={x.key}>
            {x.label || x.key}
          </option>
        ))}
      </select>
    </Feld>
  );
}

/**
 * Aus Datum ableiten (#1648): Das Verweisfeld schlägt die Mappe vor, deren Feld zum Jahr eines Datumsfelds dieser Mappe
 * passt – z. B. Steuerjahr aus „Bis“. Nur ein Vorschlag; gibt es keine passende Mappe, bietet Ablago an, sie anzulegen.
 */
export function AusDatumEditor({
  f,
  id,
  setze,
  alleFelder,
  felderVon,
}: {
  f: EntwurfFeld;
  id: (x: string) => string;
  setze(patch: Partial<EntwurfFeld>): void;
  alleFelder: FeldDef[];
  felderVon(typId: string): FeldDef[] | undefined;
}) {
  const daten = moeglicheDatumsfelder(alleFelder).filter((x) => x.key);
  if (!daten.length && !f.ausDatum) return null;
  const z = einzigesZiel(f);
  const jahresfelder = z ? moeglicheJahresfelder(felderVon(z) ?? []) : [];
  const a = f.ausDatum;
  return (
    <div className="raster folgtaus">
      <Feld beschriftung={t('mappentypen.editor.aus-datum')} hinweis={t('mappentypen.editor.aus-datum-hilfe')}>
        <select
          id={id('ausdatum')}
          value={a?.datumFeld ?? ''}
          onChange={(e) =>
            setze({
              ausDatum: e.target.value
                ? {
                    datumFeld: e.target.value,
                    zielFeld: a?.zielFeld || (jahresfelder.find((x) => /jahr|year/i.test(x.key)) ?? jahresfelder[0])?.key || '',
                  }
                : undefined,
            })
          }>
          <option value="">{t('mappentypen.editor.folgt-aus-nicht')}</option>
          {daten.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label || x.key}
            </option>
          ))}
          {a && !daten.some((x) => x.key === a.datumFeld) && <option value={a.datumFeld}>{a.datumFeld}</option>}
        </select>
      </Feld>
      {a && (
        <Feld
          beschriftung={t('mappentypen.editor.aus-datum-jahr')}
          hinweis={!jahresfelder.length && t('mappentypen.editor.aus-datum-kein-jahr')}>
          <select id={id('ausdatum-ziel')} value={a.zielFeld} onChange={(e) => setze({ ausDatum: { ...a, zielFeld: e.target.value } })}>
            {!jahresfelder.some((x) => x.key === a.zielFeld) && (
              <option value={a.zielFeld}>{a.zielFeld || t('mappentypen.editor.bitte-waehlen')}</option>
            )}
            {jahresfelder.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label || x.key}
              </option>
            ))}
          </select>
        </Feld>
      )}
    </div>
  );
}

/** Systemspalten für die Reihenfolge der Auswahl (#1671) – auch bei mehreren Zieltypen. */
const REIHENFOLGE_SYSTEM_TEXT = () => [
  { key: '_titel', label: t('mappentypen.editor.reihenfolge.titel') },
  { key: '_erstellt', label: t('mappentypen.editor.reihenfolge.erstellt') },
  { key: '_geaendert', label: t('mappentypen.editor.reihenfolge.geaendert') },
];

/**
 * Reihenfolge der Auswahl (#1671): Nach welchem Feld des Zieltyps (nur bei genau einem) oder nach Titel, Angelegt,
 * Zuletzt geändert die Auswahl sortiert – auf- oder absteigend. Ohne Einstellung Titel aufsteigend, Zahlen als Zahlen.
 */
export function AuswahlReihenfolgeEditor({
  f,
  id,
  setze,
  felderVon,
}: {
  f: EntwurfFeld;
  id: (x: string) => string;
  setze(patch: Partial<EntwurfFeld>): void;
  felderVon(typId: string): FeldDef[] | undefined;
}) {
  // Nicht für „jede Mappe“ und ohne Zieltyp; Felder des Zieltyps nur bei genau einem.
  if (jedeMappe(f) || !zieleVon(f).length) return null;
  const z = einzigesZiel(f);
  const zielFelder = (z && felderVon(z)) || [];
  const r = f.auswahlReihenfolge;
  const felder = [
    ...REIHENFOLGE_SYSTEM_TEXT(),
    ...moeglicheReihenfolgefelder(zielFelder).map((x) => ({ key: x.key, label: x.label || x.key })),
  ];
  return (
    <div className="raster folgtaus">
      <Feld beschriftung={t('mappentypen.editor.reihenfolge')} hinweis={t('mappentypen.editor.reihenfolge-hilfe')}>
        <select
          id={id('reihenfolge')}
          value={r?.feld ?? ''}
          onChange={(e) => setze({ auswahlReihenfolge: e.target.value ? { feld: e.target.value, absteigend: r?.absteigend } : undefined })}>
          <option value="">{t('mappentypen.editor.reihenfolge.vorgabe')}</option>
          {felder.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
          {r && !felder.some((x) => x.key === r.feld) && <option value={r.feld}>{r.feld}</option>}
        </select>
      </Feld>
      {r && (
        <Feld beschriftung={t('mappentypen.editor.reihenfolge.richtung')}>
          <select
            id={id('reihenfolge-richtung')}
            value={r.absteigend ? 'ab' : 'auf'}
            onChange={(e) => setze({ auswahlReihenfolge: { feld: r.feld, ...(e.target.value === 'ab' ? { absteigend: true } : {}) } })}>
            <option value="auf">{t('mappentypen.editor.reihenfolge.aufsteigend')}</option>
            <option value="ab">{t('mappentypen.editor.reihenfolge.absteigend')}</option>
          </select>
        </Feld>
      )}
    </div>
  );
}

/** FeldDef-Eigenschaft „Zum Wiederfinden nutzen“ (#938): eigener Haken, unabhängig von „eindeutig“. */
export function WiederfindenEditor({ f, setze }: { f: EntwurfFeld; setze(p: Partial<EntwurfFeld>): void }) {
  return (
    <div className="raster">
      <div className="eigenschaft unten">
        <HakenFeld
          beschriftung={t('mappentypen.editor.zum-wiederfinden-nutzen')}
          hilfe="mappentyp.wiederfinden"
          hinweis={
            f.typ === 'referenz' ? t('mappentypen.editor.zum-wiederfinden-verweis') : t('mappentypen.editor.zum-wiederfinden-hilfe')
          }>
          <input type="checkbox" checked={!!f.wiederfinden} onChange={(e) => setze({ wiederfinden: e.target.checked || undefined })} />
        </HakenFeld>
      </div>
    </div>
  );
}

/**
 * „Ist eine Frist“ an einem Datumsfeld (#129, seit #712): Das Datum steht unter „Zu erledigen“ und im Kalender und löst
 * „Datum erreicht“ aus. Wann und an wen Ablago erinnert, stellt man in einer Automatisierung ein – nicht mehr am FeldDef.
 * Bestehende Angaben (Vorlauf, Empfänger, Text, Wiederholung) bleiben gespeichert (Vorgabe aus dem Paket).
 */
export function FristEditor({
  f,
  setze,
}: {
  f: EntwurfFeld;
  id: (x: string) => string;
  setze(p: Partial<EntwurfFeld>): void;
  benutzerFelder: Array<{ key: string; label: string }>;
}) {
  return (
    <div className="fristeditor">
      <HakenFeld beschriftung={t('felder.editor.frist')} hilfe="mappentyp.frist" hinweis={t('felder.editor.frist.hilfe')}>
        <input
          type="checkbox"
          checked={!!f.frist}
          onChange={(e) => setze({ frist: e.target.checked ? { ...(f.frist ?? FRIST_STANDARD) } : null })}
        />
      </HakenFeld>
      {f.frist && (
        <p className="leise klein">
          {t('felder.editor.frist.erinnern')}{' '}
          <Link className="verweis" to="/werkbank/automatisierungen">
            {t('felder.editor.frist.link')}
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * Ziele eines Verweisfelds (#1036): ein oder mehrere Mappentypen, gewählt mit dem einen Auswahl-Baustein
 * (Mehrfachauswahl). Optionale Ziele aus einem Paket, die es noch nicht gibt, stehen darunter; wer einen davon entfernt,
 * nimmt ihn auch aus den optionalen (sonst käme er mit dem nächsten Paket wieder).
 */
export function ZielTypenWahl({
  id,
  f,
  typen,
  eigeneId,
  eigenerName,
  setze,
}: {
  id: string;
  f: EntwurfFeld;
  typen: Mappentyp[];
  eigeneId: string;
  eigenerName: string;
  setze(patch: Partial<EntwurfFeld>): void;
}) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const gewaehlt = zieleVon(f);
  const eigen = {
    id: eigeneId,
    name: t('mappentypen.editor.dieser-mappentyp-3', { wert: eigenerName || t('mappentypen.editor.dieser-mappentyp-2') }),
    schluessel: undefined as string | undefined,
  };
  const alle = [...typen.filter((x) => x.id !== eigeneId).map((x) => ({ id: x.id, name: x.name, schluessel: x.schluessel })), eigen];
  const q = eingabe.trim().toLowerCase();
  const auswahl = alle.filter((x) => !gewaehlt.includes(x.id) && (!q || x.name.toLowerCase().includes(q)));
  const name = (z: string) => alle.find((x) => x.id === z)?.name ?? '–';
  const offenOpt = (f.zielOptional ?? []).filter((k) => !typen.some((x) => x.schluessel === k && gewaehlt.includes(x.id)));
  const entferne = (z: string) => {
    const k = typen.find((x) => x.id === z)?.schluessel;
    const rest = gewaehlt.filter((y) => y !== z);
    const opt = (f.zielOptional ?? []).filter((x) => x !== k);
    setze({
      zielTypen: rest,
      zielOptional: opt.length ? opt : undefined,
      ...(rest.length < 2 && !opt.length ? { gleicherTyp: undefined } : {}),
    });
  };
  return (
    <>
      <Mehrfachauswahl
        id={id}
        name={t('mappentypen.editor.zieltypen')}
        platzhalter={t('mappentypen.editor.zieltyp-suchen')}
        eingabe={eingabe}
        setEingabe={setEingabe}
        offen={offen}
        setOffen={setOffen}
        vorschlaege={auswahl.map((x) => ({ id: x.id, text: x.name }))}
        leerText={t('mappentypen.editor.keine-weiteren-typen')}
        waehle={(z) => {
          setze({ zielTypen: [...gewaehlt, z] });
          setEingabe('');
          setOffen(false);
        }}
        gewaehlt={gewaehlt.map((z) => ({
          id: z,
          inhalt: name(z),
          entfernenText: t('mappentypen.editor.zieltyp-entfernen', { name: name(z) }),
        }))}
        entferne={entferne}
      />
      {offenOpt.length > 0 && (
        <p className="leise klein zieltypen-offen">{t('mappentypen.editor.ziele-optional', { typen: offenOpt.join(', ') })}</p>
      )}
    </>
  );
}

/**
 * Folgt aus (#886): Das Verweisfeld füllt sich aus einem anderen Verweisfeld dieser Mappe – über ein Verweisfeld der
 * Mappe, auf die jenes zeigt (z. B. Organisation aus Niederlassung → Organisation). Nur ein leeres FeldDef, keine Sperre.
 */
export function FolgtAusEditor({
  f,
  id,
  setze,
  alleFelder,
  felderVon,
}: {
  f: EntwurfFeld;
  id: (x: string) => string;
  setze(patch: Partial<EntwurfFeld>): void;
  alleFelder: FeldDef[];
  felderVon(typId: string): FeldDef[] | undefined;
}) {
  const quellen = moeglicheQuellen(alleFelder, f);
  if (!quellen.length && !f.folgtAus) return null;
  const quelle = f.folgtAus ? alleFelder.find((x) => x.key === f.folgtAus!.feld) : undefined;
  const qz = quelle ? einzigesZiel(quelle) : undefined;
  const zielFelder = qz ? moeglicheZielFelder(felderVon(qz) ?? [], f) : [];
  const waehleQuelle = (k: string) => {
    if (!k) {
      setze({ folgtAus: undefined });
      return;
    }
    const q = alleFelder.find((x) => x.key === k);
    const qz2 = q ? einzigesZiel(q) : undefined;
    const z = qz2 ? moeglicheZielFelder(felderVon(qz2) ?? [], f) : [];
    setze({ folgtAus: { feld: k, zielFeld: z[0]?.key ?? '' } });
  };
  return (
    <div className="raster folgtaus">
      <Feld beschriftung={t('mappentypen.editor.folgt-aus')} hinweis={t('mappentypen.editor.folgt-aus-hilfe')}>
        <select id={id('folgt')} value={f.folgtAus?.feld ?? ''} onChange={(e) => waehleQuelle(e.target.value)}>
          <option value="">{t('mappentypen.editor.folgt-aus-nicht')}</option>
          {quellen.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label || x.key}
            </option>
          ))}
          {f.folgtAus && !quellen.some((x) => x.key === f.folgtAus!.feld) && <option value={f.folgtAus.feld}>{f.folgtAus.feld}</option>}
        </select>
      </Feld>
      {f.folgtAus && (
        <Feld
          beschriftung={t('mappentypen.editor.folgt-aus-ueber', { feld: quelle?.label || f.folgtAus.feld })}
          hinweis={!zielFelder.length && t('mappentypen.editor.folgt-aus-kein-ziel')}>
          <select
            id={id('folgt-ziel')}
            value={f.folgtAus.zielFeld}
            onChange={(e) => setze({ folgtAus: { feld: f.folgtAus!.feld, zielFeld: e.target.value } })}>
            {!zielFelder.some((x) => x.key === f.folgtAus!.zielFeld) && (
              <option value={f.folgtAus.zielFeld}>{f.folgtAus.zielFeld || t('mappentypen.editor.bitte-waehlen')}</option>
            )}
            {zielFelder.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label || x.key}
              </option>
            ))}
          </select>
        </Feld>
      )}
    </div>
  );
}
