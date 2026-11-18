/** Offene Aufgaben über der Mappe (#54, #1279 eigene Datei): erledigen, weitergeben, Folgetermin (#130). */
import { useEffect, useState } from 'react';
import { AUFGABENARTEN, type Aufgabe } from '../../../../shared/src/model';
import { datumDe } from '../../../../shared/src/fristen';
import { heuteIn } from '../../../../shared/src/sichten';
import { aufgabenBeschriftung, ausNotiz } from '../../../../shared/src/mappenansicht';
import { gebietsschema } from '../../../../shared/src/sprache';
import { aufgabenApi } from '../../api/aufgaben';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { Person } from '../../Person';
import { rueckfrage } from '../../rueckfrage';
import { t, tn } from '../../sprache';
import { Etikett, etikettArt, Knopf } from '../../bausteine';
import { BenutzerWahl, trotzdemZuweisen } from './gemeinsam';

/** Aufgaben an einer Mappe (#54): offene als Hinweis über der Mappe; eigene erledigen oder weitergeben. */
const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'short' });

type Folge = { aufgabe: Aufgabe; datum: string };

/** Was zu tun ist, mit Frist (#130), seit wann und von wem. */
function AufgabenText({ a, meine }: { a: Aufgabe; meine: boolean }) {
  return (
    <div className="aufgabentext">
      {/* „Deine Aufgabe:“ (#427) – damit klar ist, dass Erledigt/Weitergeben rechts zur Aufgabe gehören. */}
      <strong>
        {meine ? (
          aufgabenBeschriftung(a.art, true, a.anlass)
        ) : (
          <>
            {aufgabenBeschriftung(a.art, false, a.anlass)}{' '}
            {a.empfaengerId ? <Person id={a.empfaengerId} /> : t('konten.verwaltende.ohneEmpfaenger')}
          </>
        )}
        :
      </strong>{' '}
      {a.text}
      {a.art === 'frist' && a.datum && (
        <Etikett art={etikettArt(a.datum <= heuteIn() ? 'schlecht' : 'warn')} title={t('ablage.aufgaben.frist')}>
          {noch(a.datum)}
        </Etikett>
      )}
      <span className="leise klein">
        {' '}
        {t('ablage.aufgaben.seit', { AUFGABENARTEN: AUFGABENARTEN[a.art], datum: datum(a.erstellt) })}
        {a.erstelltVon && (
          <>
            {' '}
            {t('ablage.aufgaben.von')} <Person id={a.erstelltVon} />
          </>
        )}
      </span>
    </div>
  );
}

type Tu = (f: () => Promise<unknown>, meldung?: string) => Promise<void>;

/** Erledigt, Weitergeben, zur Notiz; automatisch zugeordnet (#337): „Passt“ bestätigt, „Rückgängig“ nimmt sie zurück. */
function Aktionen({ a, tu, weiter, zuNotizen }: { a: Aufgabe; tu: Tu; weiter(): void; zuNotizen?: () => void }) {
  return (
    <div className="aufgabenaktionen">
      {zuNotizen && ausNotiz(a) && (
        <Knopf groesse="klein" onClick={zuNotizen}>
          {t('ablage.aufgaben.zur-notiz')}
        </Knopf>
      )}
      {/* Automatisch zugeordnet (#337): „Passt“ bestätigt, „Rückgängig“ nimmt die Zuordnung zurück. */}
      {a.art === 'zugeordnet' && (
        <Knopf
          groesse="klein"
          onClick={async () => {
            if (
              await rueckfrage({
                titel: t('ablage.aufgaben.zuordnung-rueckgaengig-machen'),
                text: t('ablage.aufgaben.die-dokumente-kommen-zurueck'),
                ja: t('ablage.aufgaben.rueckgaengig-machen'),
              })
            ) {
              await tu(() => aufgabenApi.zuordnungRueckgaengig(a.id), t('ablage.aufgaben.zuordnung-rueckgaengig-gemacht-die'));
            }
          }}>
          {t('ablage.aufgaben.rueckgaengig')}
        </Knopf>
      )}
      {a.art !== 'passung' && (
        <Knopf
          groesse="klein"
          art={a.art === 'zugeordnet' ? 'haupt' : 'neben'}
          symbol="haken"
          onClick={() => tu(() => aufgabenApi.aufgabeErledigt(a.id))}>
          {a.art === 'zugeordnet' ? t('ablage.aufgaben.passt') : t('ablage.aufgaben.erledigt')}
        </Knopf>
      )}
      <Knopf groesse="klein" onClick={weiter}>
        {t('ablage.aufgaben.weitergeben')}
      </Knopf>
    </div>
  );
}

/** Weitergeben an … (Escape bricht ab); darf der Empfänger die Mappe nicht lesen, erst nachfragen (#798). */
function Weitergeben({ a, an, setAn, tu, abbrechen }: { a: Aufgabe; an: string; setAn(an: string): void; tu: Tu; abbrechen(): void }) {
  const d = useDaten();
  return (
    <form
      className="weitergeben"
      onSubmit={(e) => {
        e.preventDefault();
        if (an)
          void (async () => {
            if (await trotzdemZuweisen(a.mappeId, an, d.person(an)))
              await tu(() => aufgabenApi.aufgabeDelegieren(a.id, an), t('ablage.aufgaben.an-weitergegeben', { person: d.person(an) }));
          })();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') abbrechen();
      }}>
      <span className="leise klein">{t('ablage.aufgaben.weitergeben-an')}</span>
      <BenutzerWahl label={t('ablage.aufgaben.weitergeben-an')} wert={an} setze={setAn} ohne={a.empfaengerId} fokus />
      <Knopf art="haupt" groesse="klein" type="submit" gesperrt={!an}>
        {t('ablage.aufgaben.weitergeben')}
      </Knopf>
      <Knopf groesse="klein" onClick={abbrechen}>
        {t('ablage.aufgaben.abbrechen')}
      </Knopf>
    </form>
  );
}

function Zeile({
  a,
  neuLaden,
  setBestaetigt,
  setFolge,
  zuNotizen,
}: {
  a: Aufgabe;
  neuLaden: () => Promise<void>;
  setBestaetigt: (text: string) => void;
  setFolge: (f: Folge) => void;
  zuNotizen?: () => void;
}) {
  const d = useDaten();
  const { ich, ohneEmpfaenger } = useKonto();
  const [weiter, setWeiter] = useState(false);
  const [an, setAn] = useState('');
  const [fehler, setFehler] = useState<string>();
  // Aufgaben ohne Empfänger (#719): auch beim gewählten Alltags-Benutzer.
  const meine = a.empfaengerId === ich.id || (!a.empfaengerId && ohneEmpfaenger);
  const darf = meine || ich.rolle === 'admin';
  async function tu(f: () => Promise<unknown>, meldung?: string) {
    setFehler(undefined);
    try {
      const r = (await f()) as { hinweis?: string; folgetermin?: string } | null;
      setWeiter(false);
      setAn('');
      // Wiederkehrende Frist (#130): nächsten Termin vorschlagen.
      if (r?.folgetermin) setFolge({ aufgabe: a, datum: r.folgetermin });
      // Empfänger darf die Mappe nicht lesen (#127): trotzdem vergeben, aber Bescheid sagen.
      if (meldung || r?.hinweis) setBestaetigt([meldung, r?.hinweis].filter(Boolean).join(' '));
      await neuLaden();
      await d.neuLaden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  const abbrechen = () => {
    setWeiter(false);
    setAn('');
  };
  return (
    <li className={meine ? 'meine' : ''}>
      <AufgabenText a={a} meine={meine} />
      {darf && !weiter && <Aktionen a={a} tu={tu} weiter={() => setWeiter(true)} zuNotizen={zuNotizen} />}
      {darf && weiter && <Weitergeben a={a} an={an} setAn={setAn} tu={tu} abbrechen={abbrechen} />}
      {fehler && <p className="fehlertext">{fehler}</p>}
    </li>
  );
}

/** Hinweis über der Mappe mit allen offenen Aufgaben. */
export function AufgabenHinweis({
  aufgaben,
  neuLaden,
  zuNotizen,
}: {
  aufgaben: Aufgabe[];
  neuLaden: () => Promise<void>;
  zuNotizen?: () => void;
}) {
  const offen = aufgaben.filter((a) => !a.erledigt);
  const [bestaetigt, setBestaetigt] = useState<string>();
  const [folge, setFolge] = useState<Folge>();
  useEffect(() => {
    if (!bestaetigt) return;
    const timer = window.setTimeout(() => setBestaetigt(undefined), 6000);
    return () => window.clearTimeout(timer);
  }, [bestaetigt]);
  const vorschlag = folge && (
    <Folgetermin
      f={folge}
      neuLaden={neuLaden}
      fertig={(eintrag) => {
        setFolge(undefined);
        if (eintrag) setBestaetigt(eintrag);
      }}
    />
  );
  if (!offen.length)
    return bestaetigt || vorschlag ? (
      <>
        {vorschlag}
        {bestaetigt && (
          <div className="hinweis gut" role="status">
            <p>{bestaetigt}</p>
          </div>
        )}
      </>
    ) : null;
  return (
    <>
      {vorschlag}
      <div className="hinweis warn stapel aufgabenhinweis" role="status">
        <ul>
          {offen.map((a) => (
            <Zeile key={a.id} a={a} neuLaden={neuLaden} setBestaetigt={setBestaetigt} setFolge={setFolge} zuNotizen={zuNotizen} />
          ))}
        </ul>
        {bestaetigt && <p className="gutertext klein">{bestaetigt}</p>}
      </div>
    </>
  );
}

/** „noch 12 Tage“, „heute“, „seit 3 Tagen“ bis zur Frist. */
function noch(iso: string): string {
  const tage = Math.round((Date.parse(iso) - Date.parse(heuteIn())) / 86_400_000);
  return tage === 0
    ? t('ablage.aufgaben.heute')
    : tage === 1
      ? t('ablage.aufgaben.morgen')
      : tage > 0
        ? t('ablage.aufgaben.noch-tage', { tage })
        : tage === -1
          ? t('ablage.aufgaben.seit-gestern')
          : t('ablage.aufgaben.seit-tagen', { wert: -tage });
}

/** Wiederkehrende Frist erledigt (#130): „Datum auf … setzen“ – nie automatisch. */
function Folgetermin({ f, neuLaden, fertig }: { f: Folge; neuLaden: () => Promise<void>; fertig: (meldung?: string) => void }) {
  const d = useDaten();
  const [fehler, setFehler] = useState<string>();
  async function setzen() {
    try {
      const r = await aufgabenApi.folgetermin(f.aufgabe.id);
      await neuLaden();
      await d.neuLaden();
      fertig(r.hinweis ?? t('ablage.aufgaben.naechster-termin-eingetragen', { datumDe: datumDe(f.datum) }));
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  return (
    <div className="hinweis info folgetermin" role="status">
      <p>
        {tn('ablage.aufgaben.erledigt-der-termin-wiederholt', {
          b: <strong>{t('ablage.aufgaben.naechsten-termin-auf-setzen', { datumDe: datumDe(f.datum) })}</strong>,
        })}
      </p>
      <div className="knoepfe">
        <Knopf art="haupt" groesse="klein" onClick={() => setzen()}>
          {t('ablage.aufgaben.datum-auf-setzen', { datumDe: datumDe(f.datum) })}
        </Knopf>
        <Knopf groesse="klein" onClick={() => fertig()}>
          {t('ablage.aufgaben.nein-danke')}
        </Knopf>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}
