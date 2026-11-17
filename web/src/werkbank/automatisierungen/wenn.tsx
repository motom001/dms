import {
  kontextTyp,
  PROTOKOLL_FILTER_MAX,
  PROTOKOLL_STUFEN,
  WENN_EREIGNISSE,
  WOCHENTAGE,
  zeitplanText,
  type Kontextdaten,
  type WennBetrieb,
  type WennKarte,
} from '../../../../shared/src/automatisierung';
import { EREIGNISKATALOG, ereignisSchluessel, istBetriebWenn, type Ereignisgruppe } from '../../../../shared/src/ereignisse';
import { VORLAUF_EINHEITEN, WIEDERHOLUNGEN, type VorlaufEinheit } from '../../../../shared/src/fristen';
import type { Mappentyp } from '../../../../shared/src/model';
import { MODULE } from '../../../../shared/src/protokollmodule';
import { Feld, FeldGruppe, HakenFeld } from '../../bausteine';
import { t } from '../../sprache';
import { AufrufWenn } from '../AutomatisierungAufruf';
import { ereignisName, ohneMappeWenn } from './hilfen';

/**
 * Die Wenn-Karte einer Automatisierung (#675; #1279 aus Automatisierungen.tsx gezogen): Ereignis und Mappentyp, Zeitplan
 * (#678), Datum mit Vorlauf und Wiederholung, Protokollmeldung (#677), Aufruf von außen (#679), geänderte Felder.
 */

const ZEITPLAN_NEU: WennKarte = { art: 'zeitplan', uhrzeit: '07:00', tage: [1, 2, 3, 4, 5], feiertage: false, jeBenutzer: false };
/** Neue Wenn-Karte aus dem Vorrat bzw. der Auswahl; der Mappentyp bleibt, wo er passt. */
export function neueWenn(art: string, alt: WennKarte, typ: Mappentyp | null, k: Kontextdaten): WennKarte {
  if (art === 'datum')
    return {
      art: 'datum',
      typ: typ?.id ?? k.typen.find((x) => x.system !== 'benutzer' && x.system !== 'rolle')?.id ?? '',
      feld: '',
      vorlauf: 7,
      einheit: 'tage',
      uhrzeit: '07:00',
      wiederholung: null,
    };
  if (art === 'zeitplan') return { ...ZEITPLAN_NEU };
  // Werkbank-Karten (#677): ohne Mappentyp; „Protokollmeldung“ zunächst ab Fehler, alle Module.
  if (art === 'protokoll.meldung') return { art, stufe: 'error', modul: null, enthaelt: null };
  if (istBetriebWenn(art)) return { art } as WennBetrieb;
  // Aufruf von außen (#679): zunächst ohne Parameter; Adresse und Geheimnis nach dem Speichern.
  if (art === 'aufruf') return { art: 'aufruf', parameter: [] };
  return {
    art: art as never,
    typ: alt.art === 'zeitplan' || ohneMappeWenn(alt) ? null : alt.art === 'datum' ? alt.typ : (alt.typ ?? null),
  };
}
const TAG_NAMEN = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Wenn-Karte „Zeitplan“ (#678): Wochentage, Uhrzeit, Feiertage, „für jeden Benutzer (der Rolle …)“, Uhrzeit aus dem Profil. */
function ZeitplanEditor({ w, k, setze }: { w: Extract<WennKarte, { art: 'zeitplan' }>; k: Kontextdaten; setze: (w: WennKarte) => void }) {
  const profil = w.jeBenutzer && w.profilzeit;
  return (
    <>
      {!profil && (
        <>
          <FeldGruppe beschriftung={t('automatisierung.ui.wenn.zeitplan.tage')}>
            {WOCHENTAGE.map((d) => (
              <label key={d} className="haken klein">
                <input
                  type="checkbox"
                  checked={w.tage.includes(d)}
                  onChange={(x) => setze({ ...w, tage: x.target.checked ? [...w.tage, d].sort() : w.tage.filter((y) => y !== d) })}
                />
                <span>{TAG_NAMEN[d]}</span>
              </label>
            ))}
          </FeldGruppe>
          <Feld beschriftung={t('automatisierung.ui.wenn.uhrzeit')}>
            <input type="time" step={900} value={w.uhrzeit} onChange={(x) => setze({ ...w, uhrzeit: x.target.value || '07:00' })} />
          </Feld>
          <HakenFeld beschriftung={t('automatisierung.ui.wenn.zeitplan.feiertage')}>
            <input type="checkbox" checked={w.feiertage} onChange={(x) => setze({ ...w, feiertage: x.target.checked })} />
          </HakenFeld>
        </>
      )}
      <HakenFeld beschriftung={t('automatisierung.ui.wenn.zeitplan.je-benutzer')} className="breit">
        <input
          type="checkbox"
          checked={w.jeBenutzer}
          onChange={(x) =>
            setze(
              x.target.checked
                ? { ...w, jeBenutzer: true, rolle: null, profilzeit: false }
                : { art: 'zeitplan', uhrzeit: w.uhrzeit, tage: w.tage, feiertage: w.feiertage, jeBenutzer: false },
            )
          }
        />
      </HakenFeld>
      {w.jeBenutzer && (
        <>
          <Feld beschriftung={t('automatisierung.ui.wenn.zeitplan.rolle')}>
            <select value={w.rolle ?? ''} onChange={(x) => setze({ ...w, rolle: x.target.value || null })}>
              <option value="">{t('automatisierung.ui.wenn.zeitplan.alle')}</option>
              {k.rollen.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Feld>
          <HakenFeld beschriftung={t('automatisierung.ui.wenn.zeitplan.profilzeit')} className="breit">
            <input type="checkbox" checked={!!w.profilzeit} onChange={(x) => setze({ ...w, profilzeit: x.target.checked })} />
          </HakenFeld>
        </>
      )}
    </>
  );
}

const GRUPPEN_FOLGE: Ereignisgruppe[] = ['mappe', 'zeit', 'person', 'benutzer', 'verarbeitung', 'betrieb'];

/** Wenn „Datum“: Feld, Vorlauf mit Einheit, Wiederholung, Uhrzeit. */
function DatumFelder({ w, typ, setze }: { w: Extract<WennKarte, { art: 'datum' }>; typ: Mappentyp | null; setze: (w: WennKarte) => void }) {
  return (
    <>
      <Feld beschriftung={t('automatisierung.ui.wenn.feld')}>
        <select value={w.feld} onChange={(x) => setze({ ...w, feld: x.target.value })}>
          <option value="">–</option>
          {(typ?.felder ?? [])
            .filter((f) => f.typ === 'datum')
            .map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
        </select>
      </Feld>
      <Feld
        beschriftung={
          <>
            {t('automatisierung.ui.wenn.vorlauf')} <small>{t('automatisierung.ui.wenn.vorlauf.hilfe')}</small>
          </>
        }>
        <span className="zeile">
          <input
            type="number"
            min={-3650}
            max={3650}
            value={w.vorlauf}
            onChange={(x) => setze({ ...w, vorlauf: Number(x.target.value) })}
          />
          <Feld beschriftung={t('automatisierung.ui.wenn.einheit')} beschriftungVerbergen>
            <select value={w.einheit} onChange={(x) => setze({ ...w, einheit: x.target.value as VorlaufEinheit })}>
              {Object.entries(VORLAUF_EINHEITEN).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </Feld>
        </span>
      </Feld>
      <Feld
        beschriftung={
          <>
            {t('automatisierung.ui.wenn.wiederholung')} <small>{t('automatisierung.ui.wenn.wiederholung.hilfe')}</small>
          </>
        }>
        <select
          value={w.wiederholung ?? ''}
          onChange={(x) => setze({ ...w, wiederholung: x.target.value ? Number(x.target.value) : null })}>
          <option value="">{t('automatisierung.ui.wenn.einmalig')}</option>
          {Object.entries(WIEDERHOLUNGEN).map(([m, name]) => (
            <option key={m} value={m}>
              {name}
            </option>
          ))}
        </select>
      </Feld>
      <Feld beschriftung={t('automatisierung.ui.wenn.uhrzeit')}>
        <input type="time" value={w.uhrzeit} onChange={(x) => setze({ ...w, uhrzeit: x.target.value || '07:00' })} />
      </Feld>
    </>
  );
}

/** Wenn „Mappe geändert“: welche Felder (mit Typ) und – #1001 – auch beim Anlegen auslösen. */
function GeaendertFelder({
  w,
  typ,
  setze,
}: {
  w: Extract<WennKarte, { angelegt?: boolean }>;
  typ: Mappentyp | null;
  setze: (w: WennKarte) => void;
}) {
  return (
    <>
      {typ && (
        <FeldGruppe beschriftung={t('automatisierung.ui.wenn.felder')} className="breit">
          {typ.felder.map((f) => (
            <label key={f.key} className="haken klein">
              <input
                type="checkbox"
                checked={!!w.felder?.includes(f.key)}
                onChange={(x) =>
                  setze({ ...w, felder: x.target.checked ? [...(w.felder ?? []), f.key] : (w.felder ?? []).filter((y) => y !== f.key) })
                }
              />
              <span>{f.label}</span>
            </label>
          ))}
        </FeldGruppe>
      )}
      {/* #1001: „neue Post oder ‚An‘ geändert“ ist eine Karte – auch beim Anlegen auslösen. */}
      {
        <HakenFeld
          beschriftung={t('automatisierung.ui.wenn.angelegt')}
          hinweis={t('automatisierung.ui.wenn.angelegt.hilfe')}
          className="breit">
          <input type="checkbox" checked={w.angelegt === true} onChange={(x) => setze({ ...w, angelegt: x.target.checked || undefined })} />
        </HakenFeld>
      }
    </>
  );
}

export function WennEditor({ w, k, setze }: { w: WennKarte; k: Kontextdaten; setze: (w: WennKarte) => void }) {
  const typen = k.typen.filter((x) => x.system !== 'benutzer' && x.system !== 'rolle');
  const typ = kontextTyp(w, k.typen);
  const benutzerGruppe = w.art === 'zeitplan' || ohneMappeWenn(w) || (w.art !== 'datum' && EREIGNISKATALOG[w.art].gruppe === 'benutzer');
  return (
    <div className="karte offen">
      <div className="raster">
        <Feld beschriftung={t('automatisierung.ui.wenn.ereignis')}>
          <select value={w.art} onChange={(x) => setze(neueWenn(x.target.value, w, typ, k))}>
            <option value="datum">{ereignisName('datum')}</option>
            <option value="zeitplan">{ereignisName('zeitplan')}</option>
            <option value="aufruf">{ereignisName('aufruf')}</option>
            {GRUPPEN_FOLGE.map((g) => (
              <optgroup key={g} label={t.frei(`ereignisse.gruppe.${g}`)}>
                {WENN_EREIGNISSE.filter((a) => EREIGNISKATALOG[a].gruppe === g).map((a) => (
                  <option key={a} value={a}>
                    {ereignisName(a)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Feld>
        {!benutzerGruppe && (
          <Feld beschriftung={t('automatisierung.ui.wenn.typ')}>
            <select
              value={w.typ ?? ''}
              onChange={(x) =>
                setze(w.art === 'datum' ? { ...w, typ: x.target.value, feld: '' } : { ...w, typ: x.target.value || null, felder: [] })
              }>
              {w.art !== 'datum' && <option value="">{t('automatisierung.ui.wenn.alle-typen')}</option>}
              {typen.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Feld>
        )}
        {w.art === 'zeitplan' && <ZeitplanEditor w={w} k={k} setze={setze} />}
        {w.art === 'protokoll.meldung' && <ProtokollFilter w={w} setze={setze} />}
        {w.art === 'aufruf' && <AufrufWenn w={w} setze={setze} />}
        {w.art === 'datum' && <DatumFelder w={w} typ={typ} setze={setze} />}
        {w.art === 'mappe.geaendert' && <GeaendertFelder w={w} typ={typ} setze={setze} />}
      </div>
      <p className="leise klein">
        {w.art === 'datum'
          ? t('automatisierung.ui.wenn.datum.text')
          : w.art === 'zeitplan'
            ? `${zeitplanText(w)}. ${t('automatisierung.ui.wenn.zeitplan.text')}`
            : w.art === 'aufruf'
              ? t('automatisierung.ui.aufruf.text')
              : t.frei(`ereignisse.text.${ereignisSchluessel(w.art)}`)}
      </p>
    </div>
  );
}

/**
 * Wenn-Karte „Protokollmeldung“ (#677): ab Warnung oder ab Fehler, wahlweise nur ein Modul und ein Text. Bei Fehlern im
 * Modul „E-Mail“ hilft eine E-Mail meist nicht – der Hinweis schlägt Aufgabe oder Benachrichtigung im DMS vor.
 */
function ProtokollFilter({ w, setze }: { w: Extract<WennBetrieb, { art: 'protokoll.meldung' }>; setze: (w: WennKarte) => void }) {
  return (
    <>
      <Feld beschriftung={t('automatisierung.ui.wenn.protokoll.stufe')}>
        <select value={w.stufe} onChange={(x) => setze({ ...w, stufe: x.target.value === 'warn' ? 'warn' : 'error' })}>
          {PROTOKOLL_STUFEN.map((s) => (
            <option key={s} value={s}>
              {t.frei(`automatisierung.ui.wenn.protokoll.ab-${s}`)}
            </option>
          ))}
        </select>
      </Feld>
      <Feld beschriftung={t('automatisierung.ui.wenn.protokoll.modul')}>
        <select value={w.modul ?? ''} onChange={(x) => setze({ ...w, modul: x.target.value || null })}>
          <option value="">{t('automatisierung.ui.wenn.protokoll.alle-module')}</option>
          {MODULE.filter((m) => m !== 'automatisierung' && m !== 'ereignisse').map((m) => (
            <option key={m} value={m}>
              {t.frei(`werkbank.protokoll.modul.${m}`)}
            </option>
          ))}
        </select>
      </Feld>
      <Feld
        beschriftung={t('automatisierung.ui.wenn.protokoll.enthaelt')}
        hinweis={t('automatisierung.ui.wenn.protokoll.enthaelt.hilfe')}
        className="breit">
        <input
          value={w.enthaelt ?? ''}
          maxLength={PROTOKOLL_FILTER_MAX}
          onChange={(x) => setze({ ...w, enthaelt: x.target.value || null })}
        />
      </Feld>
      {/* #671: „URL aufrufen“ (z. B. Push über die Hausautomatisierung) statt einer E-Mail – der Text nennt beides. */}
      {w.modul === 'mail' && (
        <div className="hinweis info breit" role="status">
          <p>{t('automatisierung.ui.wenn.protokoll.mail')}</p>
        </div>
      )}
    </>
  );
}
