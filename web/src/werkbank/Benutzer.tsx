import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { abwesenheitWirkt, AKTIV_MINUTEN, istGeradeAktiv, type Benutzer } from '../../../shared/src/model';
import { darfVerwalten, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { heuteIn } from '../../../shared/src/sichten';
import { kontoApi, type LinkErgebnis, type Systemkonto } from '../api/konto';
import { t } from '../sprache';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { Listenkopf } from '../Listenkopf';
import { SystemkontenGruppe, SystemkontoKennzeichen } from './Systemkonten';
import { SYSTEMKONTEN_AUF } from '../../../shared/src/systemkonten';
import { abfangen, Bereich, Feld, HakenFeld, KnopfLink, useBereiche } from '../bausteine';
import { benutzerBereiche, datumZeit, LinkAnzeige, status, WeitereRollen } from './BenutzerEditor';

export { BenutzerDetail } from './BenutzerEditor';


export function useBenutzer() {
  const [liste, setListe] = useState<Benutzer[]>([]);
  const [geladen, setGeladen] = useState(false);
  // Geladen wird erst beim Öffnen des Bereichs; die Zahl links kommt bis dahin aus der Übersicht (#375).
  const laden = useCallback(async () => { try { setListe(await kontoApi.benutzer()); } finally { setGeladen(true); } }, []);
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
        <HakenFeld beschriftung={t('werkbank.benutzer.deaktivierte-zeigen', { deaktiviert: deaktiviert.length })} className="klein">
          <input type="checkbox" checked={zeigeDeaktivierte} onChange={(e) => d.setzeEinstellung('benutzer_deaktivierte', e.target.checked || null)} />
        </HakenFeld>
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
  useEffect(() => { kontoApi.systemkonten().then(setListe).catch(() => setListe([])); }, [d.stand]);
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

export function BenutzerNeu({ neuLaden }: { neuLaden: () => Promise<void> }) {
  const { mail } = useKonto();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [rollen, setRollen] = useState<string[]>([]);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [ergebnis, setErgebnis] = useState<LinkErgebnis>();
  const ent = useEntwurf({ email: '', name: '', rollen: [] as string[] }, { email, name, rollen }, { neu: true, aus: !!ergebnis, liste: '/werkbank/benutzer', zuruecksetzen: () => undefined });
  const b = useBereiche(benutzerBereiche(false).slice(0, 2), 'benutzer', null);

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setSendet(true); setFehler(undefined);
    try { setErgebnis(await kontoApi.benutzerAnlegen({ email, name, rollen })); await neuLaden(); }
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
    <form className="editorform" onSubmit={abfangen(anlegen, setFehler)} onKeyDown={ent.tasten}>
      <div className="mappenkopf"><p className="ueber">{t('werkbank.benutzer.benutzer')}</p><h1>{t('werkbank.benutzer.neuer-benutzer')}</h1>
        <p className="leise">{mail ? t('werkbank.benutzer.er-bekommt-eine-e') : t('werkbank.benutzer.kein-e-mail-versand')}</p></div>
      {/* Dieselben Bereiche wie am gespeicherten Benutzer (#1000) – nur zwei, also ohne Sprungleiste. */}
      <Bereich id="grunddaten" titel={t('werkbank.benutzer.bereich.grunddaten')} klappe={b.klappe('grunddaten', !!fehler)}>
        <div className="raster">
          <Feld beschriftung={t('werkbank.benutzer.name')}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Feld>
          <Feld beschriftung={t('werkbank.benutzer.e-mail-adresse-2')}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Feld>
        </div>
        {fehler && <p className="fehlertext">{fehler}</p>}
      </Bereich>
      <Bereich id="rechte" titel={t('werkbank.benutzer.bereich.rechte')} klappe={b.klappe('rechte')}>
        <WeitereRollen gewaehlt={rollen} setze={setRollen} />
        <p className="leise klein">{t('werkbank.verwaltungsrecht.neu')}</p>
      </Bereich>
      <Speicherleiste ent={ent} gegenstand={t('werkbank.benutzer.ueber')} sendet={sendet} haupttext={mail ? t('werkbank.benutzer.benutzer-anlegen-und-einladen') : undefined} />
    </form>
  );
}
