import { t, tn } from '../../sprache';
import { useEffect, useState, type FormEvent } from 'react';
import type { PostfachAnsicht, PostfachEingabe } from '../../api/eingaenge';
import { useDaten } from '../../daten';
import { Speicherleiste, useEntwurf, useGespeichertNachziehen } from '../../Speicherleiste';
import { Hilfe } from '../../Hilfe';
import { PostfachStand } from '../PostfachStand';
import { Bereich, Fassungen, Feld, HakenFeld, Schalter, useBereiche, type BereichListe, type Klappe } from '../../bausteine';
import { alsEingabe, NEU, type Meldung } from './hilfen';
import { useRueckkehr, type PostfachZustand } from './zustand';
import { postfachAktionen } from './postfach-aktionen';
import { Verbindung } from './Verbindung';
import { OAuthBereich, postfachZiel } from './OAuthBereich';

type Setze = (x: Partial<PostfachEingabe>) => void;

/** Bereiche eines Postfachs (#1000): Anmeldung beim Anbieter nur mit OAuth, der Stand erst nach dem Anlegen. */
export type PostfachBereich = 'grunddaten' | 'verbindung' | 'abholen' | 'anbieter' | 'stand' | 'fassungen';
function postfachBereiche(oauth: boolean, gespeichert: boolean): BereichListe<PostfachBereich> {
  return [
    ['grunddaten', t('werkbank.postfaecher.bereich.grunddaten')],
    ['verbindung', t('werkbank.postfaecher.bereich.verbindung')],
    ...(oauth ? [['anbieter', t('werkbank.postfaecher.anmeldung-per-oauth-2')] as const] : []),
    ['abholen', t('werkbank.postfaecher.bereich.abholen')],
    ...(gespeichert ? [['stand', t('werkbank.postfaecher.stand')] as const, ['fassungen', t('oberflaeche.fassungen.titel')] as const] : []),
  ];
}

export function PostfachEditor({ z, id }: { z: PostfachZustand; id: string }) {
  const d = useDaten();
  const vorhanden = id !== 'neu' ? z.liste?.find((p) => p.id === id) : undefined;
  const gespeichert = vorhanden ? alsEingabe(vorhanden) : NEU;
  const [e, setE] = useState<PostfachEingabe>(gespeichert);
  const rueckkehr = useRueckkehr();
  const [meldung, setMeldung] = useState<Meldung | undefined>(rueckkehr);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [fehlerOrte, setFehlerOrte] = useState<Set<PostfachBereich>>(new Set());
  const ent = useEntwurf(gespeichert, e, {
    neu: !vorhanden,
    liste: '/werkbank/postfaecher',
    zuruecksetzen: () => {
      setE(gespeichert);
      setBestaetigt(false);
      setMeldung(undefined);
      setFehlerOrte(new Set());
    },
  });
  const liste = postfachBereiche(e.anmeldung === 'oauth', !!vorhanden);
  // Sprungleiste und Bereiche (#1000) wie beim Mappentyp; gemerkt je Postfach. Zurück vom Anbieter: dessen Bereich offen.
  const b = useBereiche(liste, 'postfach', vorhanden ? id : null);
  // Nach dem Wiederherstellen einer Fassung (#1006).
  useGespeichertNachziehen(gespeichert, e, setE);
  useEffect(() => {
    if (rueckkehr && e.anmeldung === 'oauth') b.oeffne(['anbieter']);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- nur beim Zurückkommen vom Anbieter
  if (id !== 'neu' && !vorhanden)
    return z.liste ? (
      <div className="leer">
        <p>{t('werkbank.postfaecher.dieses-postfach-gibt-es')}</p>
      </div>
    ) : (
      <p className="leise">{t('werkbank.postfaecher.lade')}</p>
    );
  const setze = (x: Partial<PostfachEingabe>) => setE({ ...e, ...x });
  const eingabe = { ...e, unverschluesseltBestaetigt: bestaetigt };
  const a = postfachAktionen({ z, d, vorhanden, e, setE, eingabe, liste, b, setSendet, setFehlerOrte, setMeldung });

  const absenden = (x: FormEvent) => {
    x.preventDefault();
    void a.speichern();
  };
  const hatFehler = (k: PostfachBereich) => fehlerOrte.has(k);
  const klappe = (k: PostfachBereich) => b.klappe(k, hatFehler(k));
  return (
    <div className="editorform">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.postfaecher.postfach')}</p>
        <h1>{vorhanden?.name || t('werkbank.postfaecher.neues-postfach')}</h1>
        <p className="leise">
          {tn('werkbank.postfaecher.am-besten-ein-eigenes', {
            code: <code>{t('werkbank.postfaecher.dms')}</code>,
            b: <strong>{t('werkbank.postfaecher.app-passwort')}</strong>,
            b2: <strong>{t('werkbank.postfaecher.oauth-2-0')}</strong>,
          })}
        </p>
      </div>
      {b.leiste(hatFehler, t('werkbank.postfaecher.bereiche'))}
      {meldung && (
        <div className={`hinweis ${meldung.art}`} role="status">
          <p>{meldung.text}</p>
        </div>
      )}
      <form id="pf-formular" className="editorform" onSubmit={absenden} onKeyDown={ent.tasten}>
        {grunddaten(e, setze, klappe('grunddaten'), d)}
        <Verbindung
          e={e}
          vorhanden={vorhanden}
          setze={setze}
          bestaetigt={bestaetigt}
          setBestaetigt={setBestaetigt}
          klappe={klappe('verbindung')}
          testen={a.testen}
        />
      </form>
      {/* „Anmeldung per OAuth 2.0“ hängt an der Wahl in „Verbindung“ und steht darum gleich danach. Die App beim Anbieter
          gilt für alle Postfächer (und den E-Mail-Versand) – darum mit eigenem Speichern (#370) und außerhalb des
          Formulars; „Abholen“ ist ein zweites Formular, das dieselbe Speicherleiste speichert. */}
      {e.anmeldung === 'oauth' && anbieterBereich({ e, vorhanden, z, klappe: klappe('anbieter'), geaendert: ent.geaendert, setMeldung })}
      <form className="editorform" onSubmit={absenden} onKeyDown={ent.tasten}>
        {abholen(e, setze, klappe('abholen'))}
      </form>
      {vorhanden && (
        <PostfachStand
          p={vorhanden}
          klappe={klappe('stand')}
          geaendert={ent.geaendert}
          abrufen={a.abrufen}
          oeffne={(x) => b.oeffne([x], true, true)}
        />
      )}
      {vorhanden && (
        <Fassungen
          art="postfach"
          eintrag={vorhanden.id}
          stand={JSON.stringify(gespeichert)}
          nachher={() => z.laden()}
          klappe={klappe('fassungen')}
        />
      )}
      {speicherleiste(ent, sendet, vorhanden, a.loeschen)}
    </div>
  );
}

/** Grunddaten: an oder aus, Name, für wen. */
function grunddaten(e: PostfachEingabe, setze: Setze, klappe: Klappe, d: ReturnType<typeof useDaten>) {
  return (
    <Bereich
      id="grunddaten"
      titel={t('werkbank.postfaecher.bereich.grunddaten')}
      klappe={klappe}
      kurz={[e.name, e.aktiv ? t('werkbank.postfaecher.bereich.an') : t('werkbank.postfaecher.aus')].filter(Boolean).join(' · ')}>
      <Schalter id="pf-aktiv" an={e.aktiv} setze={(an) => setze({ aktiv: an })} beschriftung={t('werkbank.postfaecher.schalter')} />
      <div className="raster">
        <Feld beschriftung={t('werkbank.postfaecher.name')}>
          <input
            id="pf-name"
            value={e.name}
            maxLength={80}
            placeholder={t('werkbank.postfaecher.z-b-rechnungen')}
            onChange={(x) => setze({ name: x.target.value })}
          />
        </Feld>
        <Feld beschriftung={t('werkbank.postfaecher.fuer')} optional hinweis={t('werkbank.postfaecher.optional-steht-an-jeder')}>
          <select id="pf-fuer" value={e.fuer ?? ''} onChange={(x) => setze({ fuer: x.target.value || null })}>
            <option value="">{t('werkbank.postfaecher.niemand')}</option>
            {d.personen
              .filter((p) => p.aktiv !== false)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Feld>
      </div>
    </Bereich>
  );
}

/** Abholen: Ordner, Abstand, Absender, was danach mit der Mail geschieht. */
function abholen(e: PostfachEingabe, setze: Setze, klappe: Klappe) {
  return (
    <Bereich
      id="abholen"
      titel={t('werkbank.postfaecher.bereich.abholen')}
      klappe={klappe}
      kurz={t('werkbank.postfaecher.bereich.abholen.kurz', { ordner: e.ordner, anzahl: e.abstand })}>
      <div className="raster">
        <Feld beschriftung={t('werkbank.postfaecher.ordner')}>
          <input id="pf-ordner" value={e.ordner} onChange={(x) => setze({ ordner: x.target.value })} />
        </Feld>
        <Feld beschriftung={t('werkbank.postfaecher.abrufabstand')} hinweis={t('werkbank.postfaecher.in-minuten')}>
          <input
            id="pf-abstand"
            type="number"
            min={1}
            max={1440}
            value={e.abstand}
            onChange={(x) => setze({ abstand: Number(x.target.value) })}
          />
        </Feld>
        <Feld
          beschriftung={t('werkbank.postfaecher.nur-von-diesen-absendern')}
          hinweis={t('werkbank.postfaecher.adressen-oder-domains-durch')}>
          <input
            id="pf-absender"
            value={Array.isArray(e.absender) ? e.absender.join(', ') : e.absender}
            placeholder={t('werkbank.postfaecher.rechnung-stadtwerke-example-bank')}
            onChange={(x) => setze({ absender: x.target.value })}
          />
        </Feld>
        <Feld beschriftung={t('werkbank.postfaecher.nach-dem-uebernehmen')}>
          <select id="pf-nachher" value={e.nachher} onChange={(x) => setze({ nachher: x.target.value as PostfachEingabe['nachher'] })}>
            <option value="verschieben">{t('werkbank.postfaecher.in-einen-ordner-verschieben')}</option>
            <option value="gelesen">{t('werkbank.postfaecher.nur-als-gelesen-markieren')}</option>
            <option value="loeschen">{t('werkbank.postfaecher.loeschen')}</option>
          </select>
        </Feld>
        {e.nachher === 'verschieben' && (
          <Feld
            beschriftung={t('werkbank.postfaecher.ordner-fuer-uebernommenes')}
            hinweis={t('werkbank.postfaecher.wird-bei-bedarf-angelegt')}>
            <input id="pf-zielordner" value={e.zielordner} onChange={(x) => setze({ zielordner: x.target.value })} />
          </Feld>
        )}
      </div>
      <HakenFeld
        beschriftung={t('werkbank.postfaecher.nur-mails-mit-anhang')}
        hinweis={t('werkbank.postfaecher.andere-bleiben-unveraendert-im')}>
        <input id="pf-anhang" type="checkbox" checked={e.nurMitAnhang} onChange={(x) => setze({ nurMitAnhang: x.target.checked })} />
      </HakenFeld>
      <HakenFeld beschriftung={t('werkbank.postfaecher.original-mail-als-eml')}>
        <input id="pf-original" type="checkbox" checked={e.original} onChange={(x) => setze({ original: x.target.checked })} />
      </HakenFeld>
    </Bereich>
  );
}

/** Anmeldung per OAuth 2.0 (#358): eigener Bereich gleich nach der Verbindung. */
function anbieterBereich({
  e,
  vorhanden,
  z,
  klappe,
  geaendert,
  setMeldung,
}: {
  e: PostfachEingabe;
  vorhanden: PostfachAnsicht | undefined;
  z: PostfachZustand;
  klappe: Klappe;
  geaendert: boolean;
  setMeldung: (m: Meldung | undefined) => void;
}) {
  return (
    <Bereich
      id="anbieter"
      titel={t('werkbank.postfaecher.anmeldung-per-oauth-2')}
      hilfe={<Hilfe ort="werkbank.postfaecher.oauth" />}
      klappe={klappe}
      kurz={vorhanden?.oauth?.zustand === 'ok' ? t('werkbank.postfaecher.bereich.angemeldet') : t('werkbank.postfaecher.nicht-angemeldet')}>
      <OAuthBereich
        anbieter={e.anbieter ?? 'microsoft'}
        ziel={vorhanden?.anmeldung === 'oauth' ? postfachZiel(vorhanden, z) : undefined}
        geaendert={geaendert}
        setMeldung={setMeldung}
        eingebettet
      />
    </Bereich>
  );
}

/** Speicherleiste des Postfachs, mit „Postfach entfernen“ für ein gespeichertes. */
function speicherleiste(
  ent: ReturnType<typeof useEntwurf>,
  sendet: boolean,
  vorhanden: PostfachAnsicht | undefined,
  loeschen: () => Promise<void>,
) {
  return (
    <Speicherleiste
      ent={ent}
      gegenstand={t('werkbank.postfaecher.postfach')}
      sendet={sendet}
      formular="pf-formular"
      loeschen={
        vorhanden
          ? {
              text: t('werkbank.postfaecher.postfach-entfernen-2'),
              rueckfrage: {
                titel: t('werkbank.postfaecher.postfach-entfernen', { name: vorhanden.name }),
                text: t('werkbank.postfaecher.die-mails-im-postfach'),
                ja: t('werkbank.postfaecher.entfernen'),
              },
              onClick: loeschen,
            }
          : undefined
      }
    />
  );
}
