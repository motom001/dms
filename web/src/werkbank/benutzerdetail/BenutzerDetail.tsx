import { useEffect, useRef, useState } from 'react';
import { istGeradeAktiv, type Benutzer } from '../../../../shared/src/model';
import { AbwesenheitFelder, AufgabenUebergeben, uebergebenText } from '../../profil/Abwesenheit';
import { kontoApi, type LinkErgebnis } from '../../api/konto';
import { t } from '../../sprache';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { Link } from '../../ort';
import { Speicherleiste, useEntwurf } from '../../Speicherleiste';
import { Hilfe } from '../../Hilfe';
import { Bereich, Feld, useBereiche, type BereicheZustand } from '../../bausteine';
import { WasSiehtBlatt } from '../Berechtigungen';
import { benutzerBereiche, datumZeit, status, type Aktion, type BenutzerBereich } from './hilfen';
import { entwurfVon, rechteKurz, speichereBenutzer, teilweiseText, vertretungKurz, type Entwurf, type Teil } from './entwurf';
import { WeitereRollen } from './Rollen';
import { Sicherheit } from './Sicherheit';
import { Zugang } from './Zugang';
import { Verwaltungsrecht } from './Verwaltungsrecht';
import { LinkAnzeige } from './LinkAnzeige';

type Daten = ReturnType<typeof useDaten>;
type SetzeE = (f: Entwurf | ((x: Entwurf) => Entwurf)) => void;

/**
 * Werkbank → Benutzer, rechte Spalte (#1000): Sprungleiste und Bereiche wie beim Mappentyp, ein Speichern für Name,
 * Rollen, Verwaltungsrecht und Vertretung. Was sofort wirkt, bleibt sofort: Passwort-Link, Zwei-Faktor und Passkeys
 * zurücksetzen, Geräte abmelden, Aufgaben übergeben, Fehler nachstellen, sperren und wieder freigeben.
 */
export function BenutzerDetail({ b, neuLaden }: { b: Benutzer; neuLaden: () => Promise<void> }) {
  const { ich, aktualisieren, verwaltungsmodus } = useKonto();
  const d = useDaten();
  // Löschen nur, solange eine Einladung nie angenommen wurde; sonst deaktivieren (#26).
  const loeschbar = !b.hatPasswort && !b.letzteAnmeldung;
  const gespeichert = entwurfVon(b);
  const [e, setE] = useState<Entwurf>(gespeichert);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  // Fehler beim Speichern stehen nur an der Speicherleiste (B2), Meldungen der Sofortaktionen oben.
  const [speicherFehler, setSpeicherFehler] = useState<string>();
  const [ergebnis, setErgebnis] = useState<LinkErgebnis>();
  const [sendet, setSendet] = useState(false);
  const [fehlerOrt, setFehlerOrt] = useState<BenutzerBereich | null>(null);
  // Reihenfolge der Haken zählt nicht als Änderung.
  const ent = useEntwurf(
    gespeichert,
    { ...e, rollen: [...e.rollen].sort(), verwaltung: [...e.verwaltung].sort() },
    {
      zuruecksetzen: () => {
        setE(gespeichert);
        setFehlerOrt(null);
        setSpeicherFehler(undefined);
      },
    },
  );
  const selbst = b.id === ich.id;
  // Verwaltungsrecht ändern darf nur, wer selbst „Gesamte Verwaltung“ hat (#818).
  const darfVerwaltung = verwaltungsmodus.bereiche === null && !b.art;
  const b2 = useBereiche(benutzerBereiche(!selbst || !b.aktiv), 'benutzer', b.id);
  const uebernehmen = useUebernehmen(b, setE);

  async function aktion(fn: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try {
      await fn();
      if (gut) setMeldung({ art: 'gut', text: gut });
      await neuLaden();
      if (selbst) await aktualisieren();
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  async function speichern() {
    setSendet(true);
    setMeldung(undefined);
    setSpeicherFehler(undefined);
    setFehlerOrt(null);
    try {
      await speichereBenutzer(b, e, darfVerwaltung);
      setMeldung({ art: 'gut', text: t('werkbank.benutzer.gespeichert') });
      uebernehmen.current = true;
    } catch (x) {
      const ort = (x as { ort?: BenutzerBereich }).ort ?? 'grunddaten';
      setSpeicherFehler(teilweiseText(x as Error & { teil?: Teil; gespeichert?: Teil[] }));
      setFehlerOrt(ort);
      b2.oeffne([ort]);
    } finally {
      // Auch nach einem Fehler neu laden: Was davor gelang, ist gespeichert und zählt nicht mehr als Änderung.
      await neuLaden();
      await d.neuLaden();
      if (selbst) await aktualisieren();
      setSendet(false);
    }
  }
  const hatFehler = (k: BenutzerBereich) => fehlerOrt === k;

  return (
    <div className="editorform">
      {kopf(b, d)}
      {b2.leiste(hatFehler, t('werkbank.benutzer.bereiche'))}
      {meldung && (
        <div className={`hinweis ${meldung.art}`}>
          <p>{meldung.text}</p>
        </div>
      )}
      {ergebnis && <LinkAnzeige e={ergebnis} schliessen={() => setErgebnis(undefined)} />}

      <form
        id="benutzer-formular"
        className="editorform"
        onKeyDown={ent.tasten}
        onSubmit={(x) => {
          x.preventDefault();
          void speichern();
        }}>
        {grunddaten(b, e, setE, selbst, b2.klappe('grunddaten', hatFehler('grunddaten')))}
        {rechte(b, e, setE, { darfVerwaltung, sendet }, b2.klappe('rechte', hatFehler('rechte')))}
        {vertretung({
          b,
          e,
          setE,
          gespeichert,
          selbst,
          d,
          ent,
          aktion,
          setMeldung,
          klappe: b2.klappe('vertretung', hatFehler('vertretung')),
        })}
      </form>
      <Sicherheit b={b} b2={b2} aktion={aktion} setErgebnis={setErgebnis} neuLaden={neuLaden} loeschbar={loeschbar} />
      {(!selbst || !b.aktiv) && <Zugang b={b} b2={b2} selbst={selbst} loeschbar={loeschbar} aktion={aktion} />}
      <Speicherleiste
        ent={ent}
        gegenstand={t('werkbank.benutzer.ueber')}
        sendet={sendet}
        formular="benutzer-formular"
        meldung={speicherFehler ? { art: 'schlecht', text: speicherFehler } : undefined}
      />
    </div>
  );
}

/** Kopf: Name, Status, angelegt, letzte Anmeldung, zuletzt aktiv; Link zur Mappe in der Ablage. */
function kopf(b: Benutzer, d: Daten) {
  const s = status(b);
  const benutzerTyp = d.typen.find((mappentyp) => mappentyp.system === 'benutzer');
  return (
    <div className="mappenkopf">
      <p className="ueber">{t('werkbank.benutzer.ueber')}</p>
      <h1>{b.name || b.email}</h1>
      <dl className="index">
        <div>
          <dt>{t('werkbank.benutzer.status')}</dt>
          <dd>
            <span className={`chip ${s.art}`}>{s.text}</span>
          </dd>
        </div>
        <div>
          <dt>{t('werkbank.benutzer.angelegt')}</dt>
          <dd>{datumZeit(b.erstellt)}</dd>
        </div>
        <div>
          <dt>{t('werkbank.benutzer.letzte-anmeldung-2')}</dt>
          <dd>{datumZeit(b.letzteAnmeldung)}</dd>
        </div>
        <div>
          <dt>{t('werkbank.benutzer.zuletzt-aktiv')}</dt>
          <dd>
            {datumZeit(b.zuletztAktiv ?? null)}
            {istGeradeAktiv(b.zuletztAktiv) && (
              <>
                {' '}
                <span className="chip gut punkt">{t('werkbank.benutzer.gerade-aktiv')}</span>
              </>
            )}
          </dd>
        </div>
      </dl>
      {benutzerTyp && (
        <p className="leise klein">
          <Link to={`/ablage/${benutzerTyp.id}/${b.id}`} className="verweis">
            {t('werkbank.benutzer.mappe-in-der-ablage')}
          </Link>
        </p>
      )}
    </div>
  );
}

type Klappe = ReturnType<BereicheZustand<BenutzerBereich>['klappe']>;

/** Grunddaten: Name; die E-Mail-Adresse ändert der Benutzer selbst. */
function grunddaten(b: Benutzer, e: Entwurf, setE: SetzeE, selbst: boolean, klappe: Klappe) {
  return (
    <Bereich id="grunddaten" titel={t('werkbank.benutzer.bereich.grunddaten')} klappe={klappe} kurz={`${e.name} · ${b.email}`}>
      <div className="raster">
        <Feld beschriftung={t('werkbank.benutzer.name')}>
          <input id="benutzer-name" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} />
        </Feld>
        <Feld
          beschriftung={t('werkbank.benutzer.e-mail-adresse-2')}
          hinweis={selbst ? t('werkbank.benutzer.aenderst-du-unter-mein') : t('werkbank.benutzer.aendert-der-benutzer-selbst')}>
          <input value={b.email} readOnly />
        </Feld>
      </div>
    </Bereich>
  );
}

/** Rollen und Rechte: weitere Rollen, Verwaltungsrecht (#818), „Was sieht dieser Benutzer?“. */
function rechte(
  b: Benutzer,
  e: Entwurf,
  setE: SetzeE,
  { darfVerwaltung, sendet }: { darfVerwaltung: boolean; sendet: boolean },
  klappe: Klappe,
) {
  return (
    <Bereich id="rechte" titel={t('werkbank.benutzer.bereich.rechte')} klappe={klappe} kurz={rechteKurz(e)}>
      <WeitereRollen gewaehlt={e.rollen} setze={(rollen) => setE({ ...e, rollen })} />
      {!b.art && (
        <Verwaltungsrecht
          wahl={e.verwaltung}
          setWahl={(verwaltung) =>
            setE((x) => ({ ...x, verwaltung: typeof verwaltung === 'function' ? verwaltung(x.verwaltung) : verwaltung }))
          }
          darfAendern={darfVerwaltung}
          sperre={sendet}
        />
      )}
      <WasSiehtBlatt key={b.id} benutzerId={b.id} admin={false} />
    </Bereich>
  );
}

/** Vertretung (#1000): Abwesenheit mit Vertreter, offene Aufgaben übergeben. */
function vertretung({
  b,
  e,
  setE,
  gespeichert,
  selbst,
  d,
  ent,
  aktion,
  setMeldung,
  klappe,
}: {
  b: Benutzer;
  e: Entwurf;
  setE: SetzeE;
  gespeichert: Entwurf;
  selbst: boolean;
  d: Daten;
  ent: ReturnType<typeof useEntwurf>;
  aktion: Aktion;
  setMeldung: (m: { art: 'gut' | 'schlecht'; text: string }) => void;
  klappe: Klappe;
}) {
  return (
    <Bereich
      id="vertretung"
      titel={t('werkbank.benutzer.bereich.vertretung')}
      hilfe={<Hilfe ort="benutzer.abwesenheit" />}
      klappe={klappe}
      kurz={vertretungKurz(e.abwesenheit, d.person)}>
      <AbwesenheitFelder
        a={e.abwesenheit}
        setA={(abwesenheit) => setE({ ...e, abwesenheit })}
        wert={gespeichert.abwesenheit}
        wer={selbst ? 'du' : b.name || b.email}
        benutzerId={b.id}
        offeneAufgaben={b.offeneAufgaben ?? 0}
      />
      <div className="knoepfe">
        <AufgabenUebergeben
          wert={gespeichert.abwesenheit}
          offeneAufgaben={b.offeneAufgaben ?? 0}
          gesperrt={ent.geaendert}
          uebergeben={() =>
            aktion(async () => {
              const r = await kontoApi.benutzerAufgabenAnVertreter(b.id);
              setMeldung({ art: 'gut', text: uebergebenText(r, d.person(gespeichert.abwesenheit.vertreterId)) });
              await d.neuLaden();
            })
          }
        />
      </div>
    </Bereich>
  );
}

/** Nach dem Speichern den Stand des Servers übernehmen (z. B. gekürzter Name), sobald der Benutzer neu geladen ist. */
function useUebernehmen(b: Benutzer, setE: (e: Entwurf) => void) {
  const uebernehmen = useRef(false);
  useEffect(() => {
    if (uebernehmen.current) {
      uebernehmen.current = false;
      setE(entwurfVon(b));
    }
  }, [b, setE]);
  return uebernehmen;
}
