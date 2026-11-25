import {
  inAllgemeinerSuche,
  schluesselAus,
  zieleVon,
  MEHRZAHL_MAX,
  type Feld as FeldDef,
  type Mappentyp,
  type Register,
} from '../../../shared/src/model';
import type { Beschriftungen, TypTeile } from '../../../shared/src/beschriftung';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { t, tn } from '../sprache';
import { Bereich, Feld, HakenFeld } from '../bausteine';
import { Beschriftungsstand, SprachText } from './Beschriftung';
import { TeilEinstellung } from './Teil';
import type { Entwurf } from './entwurf';
import type { TypZustand } from './useTypEditor';

/** Bereich „Grunddaten“ des Mappentyp-Editors (#1279 aus `TypEditor` gezogen): Name, Kennung, Beschreibung und mehr. */
export function GrunddatenBereich({ z }: { z: TypZustand }) {
  const { d, e, setE, neu, system, gespeichert, klappe, sichtAnlegen, setSichtAnlegen } = z;
  return (
    <Bereich
      id="grunddaten"
      titel={t('mappentypen.editor.grunddaten')}
      klappe={klappe('grunddaten')}
      kurz={
        <>
          {tn('mappentypen.editor.kennung', { code: <code className="mono">{e.schluessel || '–'}</code> })}
          {e.beschreibung ? <> · {e.beschreibung}</> : null}
          {inAllgemeinerSuche(e) ? null : <> · {t('mappentypen.editor.in-suche-kurz')}</>}
        </>
      }>
      <div className="raster">
        <SprachText
          beschriftung={t('mappentypen.editor.name')}
          id="typ-name"
          wert={e.name}
          placeholder={t('mappentypen.editor.z-b-vertrag')}
          autoFocus={neu}
          teil="name"
          beschriftungen={e.beschriftungen}
          setzeWert={(name) => setE({ ...e, name, ...(neu && !e._schluesselGetippt ? { schluessel: schluesselAus(name) } : {}) })}
          setzeBeschriftungen={(b) => setE({ ...e, beschriftungen: b as Beschriftungen<TypTeile> | undefined })}
        />
        <Feld
          beschriftung={t('mappentypen.editor.kennung-2')}
          hinweis={
            neu || !gespeichert?.schluessel
              ? t('mappentypen.editor.wird-nach-dem-speichern')
              : t('mappentypen.editor.fest-name-laesst-sich')
          }>
          <input
            className="mono"
            value={e.schluessel}
            placeholder={t('mappentypen.editor.z-b-vertrag-2')}
            readOnly={!neu && !!gespeichert?.schluessel}
            onChange={(ev) => setE({ ...e, schluessel: ev.target.value, _schluesselGetippt: true })}
          />
        </Feld>
      </div>
      {/* Mehrzahl (#1446): Listen zeigen „12 Verträge“ statt „12 × Vertrag“. */}
      <SprachText
        beschriftung={t('mappentypen.editor.mehrzahl')}
        optional
        hinweis={t('mappentypen.editor.mehrzahl-hilfe')}
        id="typ-mehrzahl"
        wert={e.mehrzahl}
        placeholder={t('mappentypen.editor.mehrzahl-beispiel')}
        teil="mehrzahl"
        beschriftungen={e.beschriftungen}
        setzeWert={(mehrzahl) => setE({ ...e, mehrzahl: mehrzahl.slice(0, MEHRZAHL_MAX) })}
        setzeBeschriftungen={(b) => setE({ ...e, beschriftungen: b as Beschriftungen<TypTeile> | undefined })}
      />
      <SprachText
        beschriftung={t('mappentypen.editor.beschreibung')}
        optional
        id="typ-beschreibung"
        wert={e.beschreibung}
        placeholder={t('mappentypen.editor.wofuer-ist-dieser-mappentyp')}
        teil="beschreibung"
        beschriftungen={e.beschriftungen}
        setzeWert={(beschreibung) => setE({ ...e, beschreibung })}
        setzeBeschriftungen={(b) => setE({ ...e, beschriftungen: b as Beschriftungen<TypTeile> | undefined })}
      />
      {/* Ist Teil einer anderen Mappe (#1031): nicht bei Systemtypen. */}
      {!system && (
        <TeilEinstellung
          eigeneId={e.id}
          felder={e.felder as unknown as Array<FeldDef & { _uid: string }>}
          teilVon={e._teilVon}
          berechtigungen={e.berechtigungen}
          typen={d.typen}
          entwurf={z.entwurfTyp}
          setze={(x) =>
            setE((y) => ({
              ...y,
              _teilVon: x.teilVon,
              ...(x.berechtigungen ? { berechtigungen: x.berechtigungen } : {}),
              felder: x.pflicht ? y.felder.map((f) => (f._uid === x.pflicht ? { ...f, pflicht: true } : f)) : y.felder,
            }))
          }
        />
      )}
      {/* Dokument übernehmen (#937): nicht bei Systemtypen und Teilen – die sind nie Ziel von „Wohin gehört das?“. */}
      {!system && e._teilVon === null && <DokumentUebernehmen e={e} setE={setE} />}
      {/* In der allgemeinen Suche zeigen (#1220): nicht bei Systemtypen und Teilen (Teile stehen ohnehin nie in der Suche). */}
      {!system && e._teilVon === null && (
        <HakenFeld
          beschriftung={t('mappentypen.editor.in-suche')}
          hilfe="mappentyp.in-suche"
          hinweis={t('mappentypen.editor.in-suche-hilfe')}>
          <input type="checkbox" checked={inAllgemeinerSuche(e)} onChange={(ev) => setE((x) => ({ ...x, inSuche: ev.target.checked }))} />
        </HakenFeld>
      )}
      {/* „12 von 14 Beschriftungen auf Englisch“ (#728): nur ein Hinweis, nie ein Fehler. */}
      <Beschriftungsstand
        typ={{
          ...e,
          felder: e.felder as unknown as FeldDef[],
          register: e.register as unknown as Register[],
          trefferlisten: e.trefferlisten,
        }}
      />
      {neu && e._teilVon === null && (
        <HakenFeld beschriftung={t('mappentypen.editor.eigene-ansicht-in-der')} hinweis={t('mappentypen.editor.abwaehlen-wenn-die-mappen')}>
          <input type="checkbox" checked={sichtAnlegen} onChange={(ev) => setSichtAnlegen(ev.target.checked)} />
        </HakenFeld>
      )}
      {gespeichert && <VerwendetIn typ={gespeichert} />}
    </Bereich>
  );
}

/**
 * Grunddaten (#937): „Kann aus Post angelegt werden“ – Grundlage für „Dokument übernehmen“. Ohne eigene Wahl gilt die
 * Vorgabe: an, wenn der Typ ein Dokumentenregister hat. „Woran man ihn erkennt“ steht seit #1645 im Abschnitt „Erkennung“.
 */
function DokumentUebernehmen({ e, setE }: { e: Entwurf; setE: (f: (x: Entwurf) => Entwurf) => void }) {
  const vorgabe = e.register.some((r) => r.art === 'dokumente');
  const an = e.ausPost ?? vorgabe;
  return (
    <>
      <HakenFeld
        beschriftung={t('mappentypen.editor.kann-aus-post')}
        hinweis={t(vorgabe ? 'mappentypen.editor.kann-aus-post-hilfe' : 'mappentypen.editor.kann-aus-post-ohne-register')}>
        <input
          type="checkbox"
          checked={an}
          onChange={(ev) => setE((x) => ({ ...x, ausPost: ev.target.checked === vorgabe ? null : ev.target.checked }))}
        />
      </HakenFeld>
    </>
  );
}

/** „Verwendet in“ (#147): Sichten, Referenzfelder und Verknüpfungsregister, die diesen Typ nutzen. */
function VerwendetIn({ typ }: { typ: Mappentyp }) {
  const d = useDaten();
  const sichten = d.sichten.filter((s) => s.typen.includes(typ.id));
  const felder = d.typen
    .filter((mappentyp) => mappentyp.id !== typ.id)
    .flatMap((mappentyp) =>
      mappentyp.felder.filter((f) => f.typ === 'referenz' && zieleVon(f).includes(typ.id)).map((f) => ({ t: mappentyp, f })),
    );
  const register = d.typen
    .filter((mappentyp) => mappentyp.id !== typ.id)
    .flatMap((mappentyp) =>
      mappentyp.register
        .filter((r) => r.art === 'verknuepfungen' && r.quellen?.some((q) => q.typId === typ.id))
        .map((r) => ({ t: mappentyp, r })),
    );
  // Tabellen (#1030) anderer Typen, die Mappen dieses Typs zeigen.
  const tabellen = d.typen
    .filter((mappentyp) => mappentyp.id !== typ.id)
    .flatMap((mappentyp) =>
      mappentyp.felder.filter((f) => f.typ === 'tabelle' && f.quelle?.typId === typ.id).map((f) => ({ t: mappentyp, f })),
    );
  const leer = !sichten.length && !felder.length && !register.length && !tabellen.length;
  return (
    <div className="verwendet">
      <h3 className="zwischen">{t('mappentypen.editor.verwendet-in')}</h3>
      {leer ? (
        <p className="leise klein">{t('mappentypen.editor.nirgends-verwendet-keine-ansicht')}</p>
      ) : (
        <ul className="verwendetliste klein">
          {sichten.map((s) => (
            <li key={s.id}>
              {tn('mappentypen.editor.ansicht', {
                link: (
                  <Link to={`/werkbank/sichten/${s.id}`} className="verweis">
                    {s.name}
                  </Link>
                ),
              })}
            </li>
          ))}
          {felder.map(({ t: mappentyp, f }) => (
            <li key={`${mappentyp.id}-${f.key}`}>
              {tn('mappentypen.editor.feld-2', {
                link: (
                  <Link to={`/werkbank/typen/${mappentyp.id}#felder`} className="verweis">
                    {mappentyp.name} › {f.label || f.key}
                  </Link>
                ),
              })}
            </li>
          ))}
          {register.map(({ t: mappentyp, r }) => (
            <li key={`${mappentyp.id}-${r.key}`}>
              {tn('mappentypen.editor.verknuepfungsregister', {
                link: (
                  <Link to={`/werkbank/typen/${mappentyp.id}#register`} className="verweis">
                    {mappentyp.name} › {r.name}
                  </Link>
                ),
              })}
            </li>
          ))}
          {tabellen.map(({ t: mappentyp, f }) => (
            <li key={`t-${mappentyp.id}-${f.key}`}>
              {tn('mappentypen.tabelle.verwendet', {
                link: (
                  <Link to={`/werkbank/typen/${mappentyp.id}#felder`} className="verweis">
                    {mappentyp.name} › {f.label || f.key}
                  </Link>
                ),
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
