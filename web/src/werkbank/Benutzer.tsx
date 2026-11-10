import { WasSiehtBlatt } from './Berechtigungen';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { abwesenheitWirkt, AKTIV_MINUTEN, geraetText, istGeradeAktiv, KEINE_ABWESENHEIT, type Benutzer, type Sitzung } from '../../../shared/src/model';
import { darfVerwalten, GESAMT, hatGesamt, verwaltungsbaum } from '../../../shared/src/verwaltungsrecht';
import { bereichName } from '../../../shared/src/werkbankansicht';
import { heuteIn } from '../../../shared/src/sichten';
import { AbwesenheitFormular, zeitraumText } from '../profil/Abwesenheit';
import { api, type LinkErgebnis, type Systemkonto } from '../api';
import { t, tn } from '../sprache';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link, loeseWache } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { Listenkopf } from '../Listenkopf';
import { rueckfrage } from '../rueckfrage';
import { SystemkontenGruppe, SystemkontoKennzeichen } from './Systemkonten';
import { SYSTEMKONTEN_AUF } from '../../../shared/src/systemkonten';
import { gebietsschema } from '../../../shared/src/sprache';
import { abfangen, Knopf, KnopfLink } from '../bausteine';

const datumZeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : t('werkbank.benutzer.noch-nie'));
const status = (b: Benutzer) => (!b.aktiv ? { text: t('werkbank.benutzer.status.deaktiviert'), art: '' } : !b.hatPasswort ? { text: t('werkbank.benutzer.status.eingeladen'), art: 'warn' } : { text: t('werkbank.benutzer.status.aktiv'), art: 'gut' });

type RolleEintrag = { id: string; name: string; system: boolean };

/** Rollen für die Auswahl; „weitere“ sind die selbst angelegten (ohne die Systemrolle Mitglied). */
function useRollen() {
  const d = useDaten();
  const [rollen, setRollen] = useState<RolleEintrag[] | null>(null);
  useEffect(() => { api.rollen().then(setRollen).catch(() => setRollen([])); }, [d.stand]);
  return { weitere: (rollen ?? []).filter((r) => !r.system), geladen: rollen !== null, typ: d.typen.find((mappentyp) => mappentyp.system === 'rolle') };
}

/** Rollen als Haken; die Systemrolle Mitglied hat jeder. Verwalten ist keine Rolle (#818), sondern ein Recht. */
function WeitereRollen({ gewaehlt, setze, sperre }: { gewaehlt: string[]; setze: (ids: string[]) => void; sperre?: boolean }) {
  const r = useRollen();
  return (
    <fieldset className="wahl rollenwahl">
      <legend>{tn('werkbank.benutzer.rollen', { klein: <small className="leise">{t('werkbank.benutzer.z-b-als-verantwortliche')}</small> })}</legend>
      {r.geladen && !r.weitere.length && <p className="leise klein">{t('werkbank.benutzer.noch-keine-rollen-angelegt')}</p>}
      {r.weitere.map((x) => (
        <label key={x.id} className="haken"><input type="checkbox" disabled={sperre} checked={gewaehlt.includes(x.id)}
          onChange={(e) => setze(e.target.checked ? [...gewaehlt, x.id] : gewaehlt.filter((y) => y !== x.id))} /><span>{x.name}</span></label>
      ))}
      {r.typ && <Link to={`/ablage/${r.typ.id}`} className="verweis klein">{t('werkbank.benutzer.rollen-in-der-ablage')}</Link>}
    </fieldset>
  );
}

export function useBenutzer() {
  const [liste, setListe] = useState<Benutzer[]>([]);
  const [geladen, setGeladen] = useState(false);
  // Geladen wird erst beim Öffnen des Bereichs; die Zahl links kommt bis dahin aus der Übersicht (#375).
  const laden = useCallback(async () => { try { setListe(await api.benutzer()); } finally { setGeladen(true); } }, []);
  return { liste, geladen, laden };
}

export function BenutzerListe({ liste: alle, offen, alltag }: { liste: Benutzer[]; offen?: string; alltag?: string | null }) {
  const { ich } = useKonto();
  const d = useDaten();
  // Deaktivierte standardmäßig ausblenden (#77); die Wahl merkt sich die Werkbank je Benutzer.
  const zeigeDeaktivierte = d.einstellungen.benutzer_deaktivierte === true;
  const deaktiviert = alle.filter((b) => !b.aktiv);
  const liste = [...alle.filter((b) => b.aktiv), ...(zeigeDeaktivierte || deaktiviert.some((b) => b.id === offen) ? deaktiviert : [])];
  const aktiv = alle.filter((b) => istGeradeAktiv(b.zuletztAktiv)).length;
  const heute = heuteIn();
  return (
    <>
      <Listenkopf titel={t('werkbank.benutzer.benutzer')} hilfe="werkbank.benutzer" beschreibung={<>{t('werkbank.benutzer.gerade-aktiv-in-den', { wert: t('werkbank.verwaltungsrecht.liste'), aktiv, AKTIV_MINUTEN })}</>}>
        <KnopfLink to="/werkbank/benutzer/neu" art="anlegen" groesse="klein">{t('werkbank.benutzer.neu')}</KnopfLink>
      </Listenkopf>
      {deaktiviert.length > 0 && (
        <label className="haken klein"><input type="checkbox" checked={zeigeDeaktivierte} onChange={(e) => d.setzeEinstellung('benutzer_deaktivierte', e.target.checked || null)} />
          <span>{t('werkbank.benutzer.deaktivierte-zeigen', { deaktiviert: deaktiviert.length })}</span></label>
      )}
      {/* Systemkonten über den Menschen, eingeklappt als Vorgabe (#817). */}
      <SystemkontenListe offen={offen} />
      <ul className="mappenliste">
        {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">{t('werkbank.benutzer.neuer-benutzer')}</span><span className="unter">{t('werkbank.benutzer.noch-nicht-angelegt')}</span></span></li>}
        {liste.map((b) => {
          const s = status(b);
          return (
            <li key={b.id}>
              <Link to={`/werkbank/benutzer/${b.id}`} className={`eintrag werk ${offen === b.id ? 'an' : ''} ${b.aktiv ? '' : 'grau'}`}>
                <span className="titel">{b.aktiv ? b.name || b.email : <span className="person-ehemalig">{b.name || b.email}</span>}{b.id === ich.id && <span className="chip">{t('werkbank.benutzer.du')}</span>}</span>
                {b.id === alltag && <span className="unter"><span className="chip info">{t('werkbank.aufgabenempfaenger.chip')}</span></span>}
                <span className="unter">{b.email}{darfVerwalten(b) && <> · <span className="chip">{hatGesamt(b) ? t('werkbank.verwaltungsrecht.chip.gesamt') : t('werkbank.verwaltungsrecht.chip.teil')}</span></>}</span>
                <span className="unter">{t('werkbank.benutzer.letzte-anmeldung', { datumZeit: datumZeit(b.letzteAnmeldung) })}</span>
                <span><span className={`chip ${s.art}`}>{s.text}</span>{istGeradeAktiv(b.zuletztAktiv) && <> <span className="chip gut punkt">{t('werkbank.benutzer.gerade-aktiv')}</span></>}
                  {b.aktiv && b.abwesenheit?.an && <> <span className="chip warn">{abwesenheitWirkt(b.abwesenheit, heute) ? t('werkbank.benutzer.abwesend') : t('werkbank.benutzer.demnaechst-abwesend')}{b.abwesenheit.bis ? t('werkbank.benutzer.bis', { reverse: b.abwesenheit.bis.split('-').reverse().join('.') }) : ''}</span></>}</span>
                {b.aktiv && b.abwesenheit?.an && <span className="unter">{t('werkbank.benutzer.vertreten-durch', { person: d.person(b.abwesenheit.vertreterId) })}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Systemkonten und Dienstkonten der Pakete (#673): sichtbar, aber nicht bearbeitbar. */
export function useSystemkonten() {
  const d = useDaten();
  const [liste, setListe] = useState<Systemkonto[] | null>(null);
  useEffect(() => { api.systemkonten().then(setListe).catch(() => setListe([])); }, [d.stand]);
  return liste;
}

/**
 * Systemkonten als eingeklappte Gruppe über den Benutzern (#817). Auf- oder zugeklappt merkt sich die Werkbank je
 * Person; ist gerade ein Systemkonto geöffnet, steht die Gruppe offen.
 */
function SystemkontenListe({ offen }: { offen?: string }) {
  const liste = useSystemkonten();
  const d = useDaten();
  if (!liste) return null;
  if (!liste.length) return <p className="leise klein">{t('konten.systemkonten.leer')} <Hilfe ort="werkbank.systemkonten" /></p>;
  const auf = d.einstellungen[SYSTEMKONTEN_AUF] === true || !!offen?.startsWith('konto-');
  return (
    <SystemkontenGruppe liste={liste} auf={auf} setzeAuf={(x) => d.setzeEinstellung(SYSTEMKONTEN_AUF, x || null)} id="benutzer-systemkonten" kinder={<>
      <p className="leise klein">{t('konten.systemkonten.beschreibung')} <Hilfe ort="werkbank.systemkonten" /></p>
      <ul className="mappenliste">
        {liste.map((k) => (
          <li key={k.id}>
            <Link to={`/werkbank/benutzer/konto-${k.id}`} className={`eintrag werk ${offen === `konto-${k.id}` ? 'an' : ''} ${k.aktiv ? '' : 'grau'}`}>
              <span className="titel">{k.name}<SystemkontoKennzeichen k={k} /></span>
              <span className="unter">{t(`konten.systemkonten.rolle.${k.rolle}`)} · {t('konten.systemkonten.nichtAnmeldbar')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>} />
  );
}

/** Rechte Spalte zu einem Systemkonto (#673): nur Angaben, nichts zu bearbeiten. */
export function SystemkontoDetail({ id }: { id: string }) {
  const liste = useSystemkonten();
  if (!liste) return <p className="leise">{t('werkbank.benutzer.lade')}</p>;
  const k = liste.find((x) => x.id === id);
  if (!k) return <div className="leer"><p>{t('werkbank.benutzer.dieses-konto-gibt-es')}</p></div>;
  const rolle = t(`konten.systemkonten.rolle.${k.rolle}`);
  return (
    <div className="blatt">
      <h2 className="h3">{k.name} <span className="chip">{rolle}</span></h2>
      <p className="leise">{t('konten.systemkonten.beschreibung')}</p>
      {k.rolle === 'paket' && <p>{k.paket ? t('konten.systemkonten.paket', { paket: k.paket }) : t('konten.systemkonten.paketEntfernt')}</p>}
      <p>{t('konten.systemkonten.rechte', { rolle })}</p>
      {k.fehler && <div className="hinweis schlecht"><p><strong>{t.frei(`konten.systemkonten.fehler.${k.fehler}`)}</strong>{k.fehler === 'angehalten' && <> {t('konten.systemkonten.fehler.angehalten.text')}</>}</p></div>}
      {k.weitreichend && <div className="hinweis warn"><p><strong>{t('konten.systemkonten.weitreichend')}:</strong> {t('konten.systemkonten.weitreichend.text')}</p>{k.paketId && <Link to={`/werkbank/pakete/${k.paketId}`} className="knopf klein">{t('konten.systemkonten.zum-paket')}</Link>}</div>}
      {k.rolle === 'systemkonto' && <p>{k.automatisierungen.length ? t('konten.systemkonten.automatisierungen', { liste: k.automatisierungen.map((a) => a.name).join(', ') }) : t('konten.systemkonten.keineAutomatisierungen')}</p>}
    </div>
  );
}

export function BenutzerDetail({ b, neuLaden }: { b: Benutzer; neuLaden: () => Promise<void> }) {
  const { ich, aktualisieren } = useKonto();
  const d = useDaten();
  const benutzerTyp = d.typen.find((mappentyp) => mappentyp.system === 'benutzer');
  // Löschen nur, solange eine Einladung nie angenommen wurde; sonst deaktivieren (#26).
  const loeschbar = !b.hatPasswort && !b.letzteAnmeldung;
  const [name, setName] = useState(b.name);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [ergebnis, setErgebnis] = useState<LinkErgebnis>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(b.name, name, { zuruecksetzen: () => setName(b.name) });
  const selbst = b.id === ich.id;
  const s = status(b);

  async function aktion(fn: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try { await fn(); if (gut) setMeldung({ art: 'gut', text: gut }); await neuLaden(); if (selbst) await aktualisieren(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.benutzer.benutzer')}</p>
        <h1>{b.name || b.email}</h1>
        <dl className="index">
          <div><dt>{t('werkbank.benutzer.status')}</dt><dd><span className={`chip ${s.art}`}>{s.text}</span></dd></div>
          <div><dt>{t('werkbank.benutzer.angelegt')}</dt><dd>{datumZeit(b.erstellt)}</dd></div>
          <div><dt>{t('werkbank.benutzer.letzte-anmeldung-2')}</dt><dd>{datumZeit(b.letzteAnmeldung)}</dd></div>
          <div><dt>{t('werkbank.benutzer.zuletzt-aktiv')}</dt><dd>{datumZeit(b.zuletztAktiv ?? null)}{istGeradeAktiv(b.zuletztAktiv) && <> <span className="chip gut punkt">{t('werkbank.benutzer.gerade-aktiv')}</span></>}</dd></div>
        </dl>
        {benutzerTyp && <p className="leise klein"><Link to={`/ablage/${benutzerTyp.id}/${b.id}`} className="verweis">{t('werkbank.benutzer.mappe-in-der-ablage')}</Link></p>}
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {ergebnis && <LinkAnzeige e={ergebnis} schliessen={() => setErgebnis(undefined)} />}

      <form className="blatt" onKeyDown={ent.tasten} onSubmit={(e) => { e.preventDefault(); setSendet(true); void aktion(() => api.benutzerAendern(b.id, { name }), t('werkbank.benutzer.gespeichert')).finally(() => setSendet(false)); }}>
        <div className="raster">
          <label className="eigenschaft"><span>{t('werkbank.benutzer.name')}</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="eigenschaft"><span>{tn('werkbank.benutzer.e-mail-adresse', { klein: <small>{selbst ? t('werkbank.benutzer.aenderst-du-unter-mein') : t('werkbank.benutzer.aendert-der-benutzer-selbst')}</small> })}</span><input value={b.email} readOnly disabled /></label>
        </div>
        <WeitereRollen gewaehlt={b.rollen ?? []} setze={(rollen) => void aktion(() => api.benutzerAendern(b.id, { rollen }), t('werkbank.benutzer.rollen-gespeichert'))} />
        <Speicherleiste ent={ent} gegenstand={t('werkbank.benutzer.name')} sendet={sendet} />
      </form>

      <Verwaltungsrecht key={`${b.id}-${(b.verwaltung ?? []).join(',')}`} b={b} aktion={aktion} />

      <div className="blatt">
        <h2 className="h3">{t('werkbank.benutzer.zugang')}</h2>
        <p className="leise">{b.hatPasswort
          ? t('werkbank.benutzer.ein-passwort-link-ist')
          : t('werkbank.benutzer.der-benutzer-hat-sein')}
          {' '}{loeschbar ? t('werkbank.benutzer.solange-die-einladung-nicht') : t('werkbank.benutzer.wer-schon-angemeldet-war')}</p>
        <div className="knoepfe">
          <button className="knopf" onClick={() => void aktion(async () => setErgebnis(await api.neuerLink(b.id)))}>{b.hatPasswort ? t('werkbank.benutzer.passwort-link-erzeugen') : t('werkbank.benutzer.einladung-erneut-senden')}</button>
        </div>
      </div>

      <AbwesenheitFormular hilfe="benutzer.abwesenheit" benutzerId={b.id} wer={selbst ? 'du' : b.name || b.email} wert={b.abwesenheit ?? KEINE_ABWESENHEIT} offeneAufgaben={b.offeneAufgaben ?? 0}
        speichern={(a) => api.benutzerAbwesenheit(b.id, a)} uebergeben={() => api.benutzerAufgabenAnVertreter(b.id)}
        nachSpeichern={async () => { await neuLaden(); if (selbst) await aktualisieren(); }} />

      <ZweifaktorVon b={b} />
      <Sitzungen b={b} neuLaden={neuLaden} />

      <WasSiehtBlatt key={b.id} benutzerId={b.id} admin={false} />

      {!selbst && b.aktiv && (
        <div className="blatt">
          <h2 className="h3">{t('werkbank.benutzer.fehler-nachstellen')}</h2>
          <p className="leise">{t('werkbank.benutzer.du-siehst-und-bedienst', { wert: b.name || b.email })}</p>
          <div className="knoepfe"><Knopf onClick={async () => {
            if (await rueckfrage({ titel: t('werkbank.benutzer.als-anmelden', { wert: b.name || b.email }), text: t('werkbank.benutzer.deine-eigene-sitzung-endet'), ja: t('werkbank.benutzer.anmelden') })) {
              void aktion(async () => { await api.vertreten(b.id); geheZu('/ablage', true); await aktualisieren(); });
            }
          }}>{t('werkbank.benutzer.als-anmelden-2', { wert: b.name || b.email })}</Knopf></div>
        </div>
      )}

      <ZugangSperren b={b} selbst={selbst} loeschbar={loeschbar} aktion={aktion} />
    </div>
  );
}

/**
 * Zugang sperren (#77): deaktivieren nur mit Vertreter und ohne offene Aufgaben (#78); der Vertreter
 * wirkt danach dauerhaft. Löschen bleibt für Einladungen, die nie angenommen wurden.
 */
function ZugangSperren({ b, selbst, loeschbar, aktion }: { b: Benutzer; selbst: boolean; loeschbar: boolean; aktion: (fn: () => Promise<unknown>, gut?: string) => Promise<void> }) {
  const d = useDaten();
  const name = b.name || b.email;
  const vertreter = b.abwesenheit?.vertreterId ? d.person(b.abwesenheit.vertreterId) : null;
  const offen = b.offeneAufgaben ?? 0;
  if (!b.aktiv) return (
    <div className="blatt">
      <h2 className="h3">{t('werkbank.benutzer.zugang-wieder-freigeben')}</h2>
      <p className="leise">{t('werkbank.benutzer.ist-deaktiviert-aktivieren-gibt', { name, wert: b.deaktiviert ? t('werkbank.benutzer.seit', { datumZeit: datumZeit(b.deaktiviert) }) : '', wert2: vertreter ? t('werkbank.benutzer.aufgaben-die-noch-fuer', { name, vertreter }) : '' })}</p>
      <div className="knoepfe"><button className="knopf primaer" onClick={() => void aktion(() => api.benutzerAendern(b.id, { aktiv: true }), t('werkbank.benutzer.aktiviert'))}>{t('werkbank.benutzer.benutzer-aktivieren')}</button></div>
    </div>
  );
  if (selbst) return null;
  const gruende = [!vertreter && t('werkbank.benutzer.es-ist-kein-vertreter'), offen > 0 && t('werkbank.benutzer.hat-noch-offene-aufgaben', { anzahl: offen, name, wert: vertreter ? t('werkbank.benutzer.gib-sie-oben-an', { vertreter }) : '.' })].filter(Boolean) as string[];
  return (
    <div className="blatt gefahrenzone">
      <h2 className="h3">{t('werkbank.benutzer.zugang-sperren')} <Hilfe ort="benutzer.sperren" /></h2>
      <ul className="leise">
        <li>{t('werkbank.benutzer.der-zugang-ist-sofort')}</li>
        <li>{t('werkbank.benutzer.die-mappe-bleibt-erhalten')}</li>
        <li>{t('werkbank.benutzer.der-vertreter-bleibt-hinterlegt', { name })}</li>
        <li>{tn('werkbank.benutzer.macht-es-jederzeit-rueckgaengig', { b: <strong>{t('werkbank.benutzer.aktivieren')}</strong> })}</li>
      </ul>
      {gruende.length > 0 && <div className="hinweis warn stapel"><p>{t('konten.sperren.nochnicht')}</p><ul>{gruende.map((g) => <li key={g}>{g}</li>)}</ul></div>}
      <div className="knoepfe">
        {loeschbar && <Knopf className="gefahr-rand" onClick={async () => {
          if (await rueckfrage({ titel: t('werkbank.benutzer.einladung-loeschen'), text: t('werkbank.benutzer.die-einladung-an-wird', { email: b.email }), ja: t('werkbank.benutzer.einladung-loeschen-2'), gefahr: true })) void aktion(async () => { await api.benutzerLoeschen(b.id); loeseWache(); geheZu('/werkbank/benutzer'); });
        }}>{t('werkbank.benutzer.einladung-loeschen-2')}</Knopf>}
        <Knopf art="gefahr" gesperrt={gruende.length > 0} onClick={async () => {
          if (await rueckfrage({ titel: t('werkbank.benutzer.deaktivieren', { name }), text: t('werkbank.benutzer.der-zugang-ist-sofort-2', { name, vertreter: String(vertreter) }), ja: t('werkbank.benutzer.deaktivieren-2'), gefahr: true })) {
            void aktion(() => api.benutzerAendern(b.id, { aktiv: false }), t('werkbank.benutzer.deaktiviert-alle-sitzungen-beendet'));
          }
        }}>{t('werkbank.benutzer.benutzer-deaktivieren')}</Knopf>
      </div>
    </div>
  );
}

/** Zwei-Faktor-Anmeldung des Benutzers (#242): Stand und Zurücksetzen (z. B. Handy verloren). */
function ZweifaktorVon({ b }: { b: Benutzer }) {
  const [stand, setStand] = useState<{ aktiv: boolean; seit: string | null; codesUebrig: number } | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const laden = useCallback(async () => { try { setStand(await api.benutzerZweifaktor(b.id)); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } }, [b.id]);
  useEffect(() => { void laden(); }, [laden]);
  const name = b.name || b.email;
  return (
    <div className="blatt">
      <h2 className="h3">{t('werkbank.benutzer.zwei-faktor-anmeldung')}</h2>
      {!stand ? !meldung && <p className="leise">{t('werkbank.benutzer.lade')}</p> : stand.aktiv ? <>
        <p><span className="chip gut punkt">{t('werkbank.benutzer.eingerichtet')}</span>{stand.seit && <> {' '}{t('werkbank.benutzer.seit-2', { datum: new Date(stand.seit).toLocaleDateString(gebietsschema()) })}</>} {' '}{t('werkbank.benutzer.wiederherstellungscodes-uebrig', { codesUebrig: stand.codesUebrig })}</p>
        <div className="knoepfe"><Knopf className="gefahr-rand" onClick={async () => {
          if (await rueckfrage({ titel: t('werkbank.benutzer.zwei-faktor-anmeldung-von', { name }), text: t('werkbank.benutzer.danach-reicht-das-passwort', { name }), ja: t('werkbank.benutzer.zuruecksetzen'), gefahr: true })) {
            void api.benutzerZweifaktorZuruecksetzen(b.id).then(() => { setMeldung({ art: 'gut', text: t('werkbank.benutzer.zurueckgesetzt') }); return laden(); }).catch((e) => setMeldung({ art: 'schlecht', text: (e as Error).message }));
          }
        }}>{t('werkbank.benutzer.zuruecksetzen')}</Knopf></div>
      </> : <p className="leise">{t('werkbank.benutzer.nicht-eingerichtet')}</p>}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}

/** Angemeldete Geräte des Benutzers; einzeln oder alle abmelden. */
function Sitzungen({ b, neuLaden }: { b: Benutzer; neuLaden: () => Promise<void> }) {
  const [liste, setListe] = useState<Sitzung[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await api.sitzungen(b.id)); } catch (e) { setFehler((e as Error).message); } }, [b.id]);
  useEffect(() => { void laden(); }, [laden]);
  async function beende(fn: () => Promise<unknown>, eigene: boolean) {
    try { await fn(); } catch (e) { setFehler((e as Error).message); }
    if (eigene) location.reload(); else { await laden(); await neuLaden(); }
  }
  return (
    <div className="blatt">
      <h2 className="h3">{t('werkbank.benutzer.angemeldet-auf', { wert: liste?.length ?? '…', wert2: liste?.length === 1 ? t('werkbank.benutzer.geraet') : t('werkbank.benutzer.geraeten') })}</h2>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {liste && !liste.length && <p className="leise">{t('werkbank.benutzer.gerade-nirgends-angemeldet')}</p>}
      {liste && liste.length > 0 && (
        <ul className="sitzungsliste">
          {liste.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{geraetText(s.geraet)}</strong>
                {s.aktuell && <> <span className="chip">{t('werkbank.benutzer.diese-sitzung')}</span></>}
                {s.vertretungId && <> <span className="chip warn">{t('werkbank.verwaltungsrecht.vertretung')}</span></>}
                {istGeradeAktiv(s.zuletztAktiv) && <> <span className="chip gut punkt">{t('werkbank.benutzer.gerade-aktiv')}</span></>}
                <span className="leise klein blockzeile">{t('werkbank.benutzer.zuletzt-aktiv-angemeldet-seit', { datumZeit: datumZeit(s.zuletztAktiv), datumZeit2: datumZeit(s.erstellt), wert: s.ip ? ` · ${s.ip}` : '' })}</span>
              </div>
              <button className="textknopf gefahr" onClick={() => void beende(() => api.sitzungBeenden(b.id, s.id), !!s.aktuell)}>{t('werkbank.benutzer.abmelden')}</button>
            </li>
          ))}
        </ul>
      )}
      {liste && liste.length > 1 && (
        <div className="knoepfe"><Knopf className="gefahr-rand" onClick={async () => {
          if (await rueckfrage({ titel: t('werkbank.benutzer.auf-allen-geraeten-abmelden', { wert: b.name || b.email, liste: liste.length }), ja: t('werkbank.benutzer.ueberall-abmelden'), gefahr: true })) void beende(() => api.alleSitzungenBeenden(b.id), liste.some((s) => s.aktuell));
        }}>{t('werkbank.benutzer.ueberall-abmelden')}</Knopf></div>
      )}
    </div>
  );
}

export function BenutzerNeu({ neuLaden }: { neuLaden: () => Promise<void> }) {
  const { mail } = useKonto();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [rollen, setRollen] = useState<string[]>([]);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [ergebnis, setErgebnis] = useState<LinkErgebnis>();
  const ent = useEntwurf({ email: '', name: '', rollen: [] as string[] }, { email, name, rollen }, { neu: true, aus: !!ergebnis, liste: '/werkbank/benutzer', zuruecksetzen: () => undefined });

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setSendet(true); setFehler(undefined);
    try { setErgebnis(await api.benutzerAnlegen({ email, name, rollen })); await neuLaden(); }
    catch (err) { setFehler((err as Error).message); }
    finally { setSendet(false); }
  }

  if (ergebnis) return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">{t('werkbank.benutzer.benutzer')}</p><h1>{t('werkbank.benutzer.ist-angelegt', { wert: ergebnis.benutzer.name || ergebnis.benutzer.email })}</h1></div>
      <LinkAnzeige e={ergebnis} />
      <div className="knoepfe"><Link to={`/werkbank/benutzer/${ergebnis.benutzer.id}`} className="knopf">{t('werkbank.benutzer.zum-benutzer')}</Link></div>
    </div>
  );

  return (
    <form className="einspaltig" onSubmit={abfangen(anlegen, setFehler)} onKeyDown={ent.tasten}>
      <div className="mappenkopf"><p className="ueber">{t('werkbank.benutzer.benutzer')}</p><h1>{t('werkbank.benutzer.neuer-benutzer')}</h1>
        <p className="leise">{mail ? t('werkbank.benutzer.er-bekommt-eine-e') : t('werkbank.benutzer.kein-e-mail-versand')}</p></div>
      <div className="blatt">
        <div className="raster">
          <label className="eigenschaft"><span>{t('werkbank.benutzer.name')}</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label className="eigenschaft"><span>{t('werkbank.benutzer.e-mail-adresse-2')}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        </div>
        <p className="leise klein">{t('werkbank.verwaltungsrecht.neu')}</p>
        <WeitereRollen gewaehlt={rollen} setze={setRollen} />
        {fehler && <p className="fehlertext">{fehler}</p>}
        <Speicherleiste ent={ent} gegenstand={t('werkbank.benutzer.benutzer')} sendet={sendet} haupttext={mail ? t('werkbank.benutzer.benutzer-anlegen-und-einladen') : undefined} />
      </div>
    </form>
  );
}

/**
 * Verwaltungsrecht an der Person (#818): Haken „Darf Ablago verwalten“, darunter der Baum der Werkbank-Bereiche aus
 * `BEREICHE`, ganz oben „Gesamte Verwaltung“ (auch künftige Bereiche). Ändern darf nur, wer selbst „Gesamte
 * Verwaltung“ hat – der Server verlangt dafür eine frische Anmeldung (der Dialog fragt sie ab).
 */
function Verwaltungsrecht({ b, aktion }: { b: Benutzer; aktion: (fn: () => Promise<unknown>, gut?: string) => Promise<void> }) {
  const { verwaltungsmodus } = useKonto();
  const darfAendern = verwaltungsmodus.bereiche === null;
  const [wahl, setWahl] = useState<string[]>(b.verwaltung ?? []);
  const [sendet, setSendet] = useState(false);
  const an = wahl.length > 0;
  const gesamt = wahl.includes(GESAMT);
  const geaendert = [...wahl].sort().join(',') !== [...(b.verwaltung ?? [])].sort().join(',');
  const baum = verwaltungsbaum();
  const umschalten = (pfad: string, x: boolean) => setWahl((w) => (x ? [...w.filter((y) => y !== GESAMT), pfad] : w.filter((y) => y !== pfad)));
  if (b.art) return null;
  return (
    <div className="blatt verwaltungsrecht" id="verwaltungsrecht">
      <h2 className="h3">{t('werkbank.verwaltungsrecht.titel')} <Hilfe ort="werkbank.verwaltungsrecht" /></h2>
      <p className="leise">{t('werkbank.verwaltungsrecht.text')}</p>
      {!darfAendern && <p className="hinweis info"><span>{t('werkbank.verwaltungsrecht.nurGesamt')}</span></p>}
      <fieldset disabled={!darfAendern || sendet} className="wahl">
        <legend className="sr-only">{t('werkbank.verwaltungsrecht.titel')}</legend>
        <label className="haken"><input id="darf-verwalten" type="checkbox" checked={an} onChange={(e) => setWahl(e.target.checked ? [GESAMT] : [])} /><span><strong>{t('werkbank.verwaltungsrecht.darf')}</strong></span></label>
        {an && <div className="verwaltungsbaum">
          <label className="haken"><input id="gesamte-verwaltung" type="checkbox" checked={gesamt} onChange={(e) => setWahl(e.target.checked ? [GESAMT] : baum.flatMap((a) => a.bereiche.map((x) => x.pfad)))} />
            <span><strong>{t('werkbank.verwaltungsrecht.gesamt')}</strong> <small className="leise">{t('werkbank.verwaltungsrecht.gesamt.text')}</small></span></label>
          {baum.map((a) => (
            <fieldset key={a.gruppe} className="verwaltungsast">
              <legend>{a.name}</legend>
              {a.bereiche.map((x) => (
                <label key={x.pfad} className="haken"><input type="checkbox" checked={gesamt || wahl.includes(x.pfad)} disabled={gesamt} onChange={(e) => umschalten(x.pfad, e.target.checked)} />
                  <span>{bereichName(x.pfad)}{x.heikel && <> <span className="chip warn klein" title={t('werkbank.verwaltungsrecht.heikel.titel')}><Symbol name="warnung" /> {t('werkbank.verwaltungsrecht.heikel')}</span></>}</span></label>
              ))}
            </fieldset>
          ))}
        </div>}
      </fieldset>
      {an && !gesamt && <p className="leise klein">{t('werkbank.verwaltungsrecht.ordnung')}</p>}
      {darfAendern && geaendert && <div className="knoepfe">
        <button type="button" className="knopf" onClick={() => setWahl(b.verwaltung ?? [])}>{t('werkbank.verwaltungsrecht.verwerfen')}</button>
        <button type="button" id="verwaltungsrecht-speichern" className="knopf primaer" disabled={sendet || (an && !wahl.length)} onClick={() => { setSendet(true); void aktion(() => api.verwaltungSetzen(b.id, wahl), t('werkbank.verwaltungsrecht.gespeichert')).finally(() => setSendet(false)); }}>{t('werkbank.verwaltungsrecht.speichern')}</button>
      </div>}
    </div>
  );
}

function LinkAnzeige({ e, schliessen }: { e: LinkErgebnis; schliessen?: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  if (e.mailVerschickt) return <div className="hinweis gut"><p>{t('werkbank.benutzer.e-mail-an-ist', { email: e.benutzer.email })}</p>{schliessen && <button className="textknopf" onClick={schliessen}>{t('werkbank.benutzer.schliessen')}</button>}</div>;
  return (
    <div className="hinweis info stapel">
      <p>{t('werkbank.benutzer.er-funktioniert-nur-einmal', { wert: e.mailFehler ? t('werkbank.benutzer.die-e-mail-an', { email: e.benutzer.email, mailFehler: e.mailFehler }) : t('werkbank.benutzer.schicke-diesen-link-an', { email: e.benutzer.email }) })}</p>
      <div className="linkzeile">
        <input readOnly value={e.link} onFocus={(ev) => ev.target.select()} aria-label={t('werkbank.benutzer.link-zum-passwort-setzen')} className="mono" />
        <Knopf groesse="klein" onClick={async () => { try { await navigator.clipboard.writeText(e.link!); setKopiert(true); } catch { /* Feld ist markierbar */ } }}>{kopiert ? t('werkbank.benutzer.kopiert') : t('werkbank.benutzer.kopieren')}</Knopf>
      </div>
      {schliessen && <button className="textknopf" onClick={schliessen}>{t('werkbank.benutzer.schliessen')}</button>}
    </div>
  );
}
