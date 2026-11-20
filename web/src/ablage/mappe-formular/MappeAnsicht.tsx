import { Etikett } from '../../bausteine';
import { useCallback, useEffect, useState } from 'react';
import { typName } from '../../../../shared/src/beschriftung';
import { datumText, inFrist } from '../../../../shared/src/archiv';
import { linkZuMappe } from '../../../../shared/src/direktlink';
import { ausDokumentKnopf } from '../../../../shared/src/erkennung';
import { NOTIZEN_REGISTER } from '../../../../shared/src/mappenansicht';
import { darfLoeschen, istLeer, type Mappe, type Mappentyp } from '../../../../shared/src/model';
import type { AktionenAnMappe, AngeboteneAktion } from '../../../../shared/src/paketaktionen';
import { istKernVorlage } from '../../../../shared/src/ablaufvorlagen';
import { mappenApi, type MappeDetails } from '../../api/mappen';
import type { TypVorschlaege } from '../../api/werkbank';
import { useKonto } from '../../konto';
import { geheZu, Link } from '../../ort';
import { Ehemalig, Person } from '../../Person';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { Aktionsmenue, Druckansicht, EmailMaske } from '../Aktionen';
import { AblaufFormular, AufgabenHinweis, ErinnerungFormular, Geplant, NeueAufgabe } from '../Aufgaben';
import { BriefAusVorlage, type VorlagenAktion } from '../BriefAusVorlage';
import { LoeschBaum } from '../LoeschBaum';
import { PaketAktion } from '../PaketAktion';
import { PostLeiste } from '../Post';
import { Stern } from '../Stern';
import { Formular } from './Formular';
import { kopiere, mitVerknuepftenFrage, registerVon, zeit } from './hilfen';
import { rohAusWerten } from '../../werte';
import { LinkKopiert, NurImModus, TeilVon } from './Zeilen';

interface AnsichtProps {
  typ: Mappentyp;
  details: MappeDetails;
  sicht: string;
  anhang?: string;
  neuLaden: () => Promise<void>;
  /** „Aus Dokument ausfüllen“ auf der Seite „Dokument übernehmen“ (#934): Vorschläge aus dem Dokument der Mitte. */
  vorschlagStart?: TypVorschlaege;
}

/** Welcher Dialog an der Mappe offen ist (Aufgabe, Erinnern, Vorlage, E-Mail, Brief, Paket-Aktion, Drucken, Löschen). */
function useDialoge() {
  const [aufgabeOffen, setAufgabeOffen] = useState(false);
  const [erinnernOffen, setErinnernOffen] = useState(false);
  // Automatisierungsvorlagen (#1044): „Aufgabe vergeben“ und „Erinnern“ wie bisher, weitere (Wiedervorlage …) dahinter.
  const [vorlageOffen, setVorlageOffen] = useState<string | null>(null);
  const [emailOffen, setEmailOffen] = useState(false);
  const [briefOffen, setBriefOffen] = useState(false);
  // Paket-Aktionen (#1039): was Pakete im Menü anbieten, die offene Aktion und – beim Kern-Dialog – ihr Lauf.
  const [paketAktion, setPaketAktion] = useState<AngeboteneAktion | null>(null);
  const [vorlagenAktion, setVorlagenAktion] = useState<VorlagenAktion | null>(null);
  const [drucken, setDrucken] = useState(false);
  const [loeschBaum, setLoeschBaum] = useState(false);
  const druckEnde = useCallback(() => setDrucken(false), []);
  return {
    ...{ aufgabeOffen, setAufgabeOffen, erinnernOffen, setErinnernOffen, vorlageOffen, setVorlageOffen, emailOffen, setEmailOffen },
    ...{ briefOffen, setBriefOffen, paketAktion, setPaketAktion, vorlagenAktion, setVorlagenAktion, drucken, setDrucken },
    ...{ loeschBaum, setLoeschBaum, druckEnde },
  };
}
type Dialoge = ReturnType<typeof useDialoge>;

/** Paket-Aktionen (#1039): was Pakete im Menü „Mappe“ anbieten – neu je Stand der Mappe. */
function usePaketAktionen(mappe: Mappe) {
  const [paketAktionen, setPaketAktionen] = useState<AktionenAnMappe | null>(null);
  useEffect(() => {
    let aktuell = true;
    mappenApi.paketAktionen(mappe.id).then(
      (a) => {
        if (aktuell) setPaketAktionen(a);
      },
      () => {
        if (aktuell) setPaketAktionen(null);
      },
    );
    return () => {
      aktuell = false;
    };
  }, [mappe.id, mappe.geaendert]);
  return paketAktionen;
}

export function MappeAnsicht({ typ, details, sicht, anhang = '', neuLaden, vorschlagStart }: AnsichtProps) {
  const mappe = details.mappe;
  const bekannt = new Set(typ.felder.map((f) => f.key));
  const verwaist = Object.entries(mappe.werte).filter(([k, v]) => !bekannt.has(k) && !istLeer(v));
  // Sprung auf einen Register von außen, z. B. „Zur Notiz“ im Aufgaben-Banner (#427).
  const [registerWunsch, setRegisterWunsch] = useState<{ key: string; n: number }>();
  const dl = useDialoge();
  const paketAktionen = usePaketAktionen(mappe);
  // Fehlende Angabe im Dialog → zum Feld: Register wechseln, Feld zeigen und fokussieren.
  const zumFeld = (key: string) => {
    const r = registerVon(typ).find((x) => x.art === 'felder' && x.felder?.includes(key));
    if (r) setRegisterWunsch((w) => ({ key: r.key, n: (w?.n ?? 0) + 1 }));
    window.setTimeout(() => {
      const el = document.getElementById(`feld-${key}`);
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
    }, 80);
  };
  // Mit verknüpften Mappen löschen (#424): im Menü „Mappe ▾“ unter den Löschwegen (#427) und unter
  // „Warum nicht?“ am Löschknopf (#423); die Vorschau steht oben unter dem Kopf.
  const mitVerknuepften =
    darfLoeschen(typ, mappe) && details.rechte?.D !== false
      ? () => {
          dl.setLoeschBaum(true);
          window.setTimeout(() => document.querySelector('.lb-blatt')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
        }
      : undefined;
  return (
    <>
      <MappeKopf typ={typ} details={details} sicht={sicht} dl={dl} paketAktionen={paketAktionen} mitVerknuepften={mitVerknuepften} />
      <TeilVon typ={typ} details={details} />
      {details.nurImVerwaltungsmodus && <NurImModus mappeId={mappe.id} />}
      {typ.system === 'post' && <PostLeiste typ={typ} details={details} neuLaden={neuLaden} />}
      <AufgabenHinweis
        aufgaben={details.aufgaben ?? []}
        neuLaden={neuLaden}
        zuNotizen={() => setRegisterWunsch((w) => ({ key: NOTIZEN_REGISTER, n: (w?.n ?? 0) + 1 }))}
      />
      <Geplant liste={details.erinnerungen ?? []} vorlagen={details.ablaufvorlagen} neuLaden={neuLaden} />
      <MappeDialoge typ={typ} details={details} sicht={sicht} neuLaden={neuLaden} dl={dl} zumFeld={zumFeld} />
      {mappe.passt === false && (
        <div className="hinweis warn">
          <p>{t('ablage.mappeformular.diese-mappe-passt-nicht', { name: typ.name, wert: mappe.problem ? ` (${mappe.problem})` : '' })}</p>
        </div>
      )}
      <Formular
        typ={typ}
        mappe={mappe}
        start={rohAusWerten(typ, mappe.werte)}
        sicht={sicht}
        anhang={anhang}
        details={details}
        neuLaden={neuLaden}
        registerWunsch={registerWunsch}
        mitVerknuepften={mitVerknuepften}
        vorschlagStart={vorschlagStart}
      />
      {verwaist.length > 0 && (
        <section className="blatt">
          <h2 className="h3">{t('ablage.mappeformular.werte-ohne-felddefinition')}</h2>
          <p className="leise">{t('ablage.mappeformular.diese-werte-stammen-aus')}</p>
          <ul className="verwaist">
            {verwaist.map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Vorlagen der Mappe (#1044): „Aufgabe vergeben“ und „Erinnern“ als Kern, weitere dahinter. */
const vorlagenVon = (details: MappeDetails) => {
  const vorlagen = details.ablaufvorlagen;
  const kern = (k: string) => (vorlagen ? vorlagen.find((v) => v.kennung === k) : undefined);
  const weitere = (vorlagen ?? []).filter((v) => !istKernVorlage(v.kennung));
  return { vorlagen, kern, weitere };
};

/** „Aus Dokument ausfüllen“ (#1494): fest im Menü „Mappe“, öffnet die Prüfansicht – mit oder ohne Dokument in der Mappe. */
function ausDokumentPunkt(typ: Mappentyp, details: MappeDetails, sicht: string) {
  const titel = ausDokumentKnopf(typ);
  if (!titel) return undefined;
  const gesperrt = details.rechte?.U === false ? t('ablage.aktionen.aus-dokument-gesperrt') : undefined;
  return { titel, gesperrt, tu: () => geheZu(`/ablage/${sicht}/${details.mappe.id}/uebernehmen`) };
}

/** Kopf der Mappe: Typ, Titel mit Stern und Menü „Mappe ▾“ (#427), angelegt/geändert, Archivmodus (#212, #1051). */
function MappeKopf({
  typ,
  details,
  sicht,
  dl,
  paketAktionen,
  mitVerknuepften,
}: {
  typ: Mappentyp;
  details: MappeDetails;
  sicht: string;
  dl: Dialoge;
  paketAktionen: AktionenAnMappe | null;
  mitVerknuepften?: () => void;
}) {
  const { ich } = useKonto();
  const mappe = details.mappe;
  const [kopiert, setKopiert] = useState<{ link: string; ok: boolean } | null>(null);
  return (
    <div className="mappenkopf">
      <p className="ueber">{typName(typ)}</p>
      {/* Kopfzeile (#427): „Mappe ▾“ neben dem Stern – gehört sichtbar zur Mappe, nicht zum Aufgaben-Banner. */}
      <div className="titelzeile">
        <h1>
          <Ehemalig id={mappe.id}>{titelOder(mappe.titel)}</Ehemalig>
        </h1>
        <div className="mappenkopf-knoepfe">
          <Stern mappeId={mappe.id} an={!!details.favorit} anker="mappe.stern" />
          <Menue
            typ={typ}
            details={details}
            sicht={sicht}
            dl={dl}
            paketAktionen={paketAktionen}
            mitVerknuepften={mitVerknuepften}
            kopiert={setKopiert}
          />
        </div>
      </div>
      <Index details={details} />
      {typ.system === 'benutzer' && ich.rolle === 'admin' && (
        <p className="leise klein">
          <Link to={`/werkbank/benutzer/${mappe.id}`} className="verweis">
            {t('ablage.mappeformular.in-der-benutzerverwaltung-oeffnen')}
          </Link>
        </p>
      )}
      {/* Ohne Kennzeichen „Systemrolle“ (Nachtrag zu #1288, 18.11.): setzt Werkbank-Wissen voraus. Die Werkbank behält ihre Kennzeichen „System“. */}
      {systemrollenHinweis(mappe.systemKennung) && <p className="leise klein">{systemrollenHinweis(mappe.systemKennung)}</p>}
      {kopiert && <LinkKopiert {...kopiert} schliessen={() => setKopiert(null)} />}
    </div>
  );
}

/** Hinweis an der Mappe einer Systemrolle (Nachtrag zu #1288): je Rolle ein eigener Satz; ohne passenden keiner. */
function systemrollenHinweis(kennung: string | null | undefined): string | null {
  if (kennung === 'rolle:mitglied') return t('mappen.systemrolle.hinweis');
  if (kennung === 'rolle:systemkonto') return t('mappen.systemrolle.hinweis-systemkonto');
  if (kennung === 'rolle:paket') return t('mappen.systemrolle.hinweis-paket');
  return null;
}

/** Menü „Mappe ▾“: Paket-Aktionen, Aufgabe, Erinnern, Vorlagen, E-Mail, Drucken, Brief, Link, Auskunft, Löschwege. */
function Menue({
  typ,
  details,
  sicht,
  dl,
  paketAktionen,
  mitVerknuepften,
  kopiert,
}: {
  typ: Mappentyp;
  details: MappeDetails;
  sicht: string;
  dl: Dialoge;
  paketAktionen: AktionenAnMappe | null;
  mitVerknuepften?: () => void;
  kopiert(k: { link: string; ok: boolean }): void;
}) {
  const mappe = details.mappe;
  const { vorlagen, kern, weitere } = vorlagenVon(details);
  // Brief aus Vorlage (#1040): nur, wo Vorlagen sein können – an Mappen mit Verweisen (z. B. auf die Vertragsart) oder
  // einem Register „Vorlagen“. Ob es wirklich welche gibt, sagt erst der Dialog.
  const vorlagenMoeglich =
    !typ.system && (typ.felder.some((f) => f.typ === 'referenz') || !!typ.register?.some((r) => r.key === 'vorlagen'));
  // Sprechender Link (#98) über ein eindeutiges Feld oder die Titelfelder.
  const direktlink = linkZuMappe(typ, mappe);
  return (
    <Aktionsmenue
      ausDokument={ausDokumentPunkt(typ, details, sicht)}
      aus={paketAktionen?.eingebautAus}
      pakete={(paketAktionen?.aktionen ?? []).map((x) => ({
        key: `${x.paket.id}:${x.schluessel}`,
        name: x.name,
        paket: x.paket.name,
        titel: x.beschreibung,
        gesperrt: x.gesperrt,
        tu: () => {
          dl.setVorlagenAktion(null);
          dl.setPaketAktion(x);
        },
      }))}
      aufgabe={!vorlagen || kern('aufgabe_vergeben') ? () => dl.setAufgabeOffen(true) : undefined}
      erinnern={!vorlagen || kern('erinnern') ? () => dl.setErinnernOffen(true) : undefined}
      vorlagen={weitere.map((v) => ({
        key: v.kennung,
        name: v.name,
        titel: v.beschreibung || undefined,
        tu: () => dl.setVorlageOffen(v.kennung),
      }))}
      email={details.exportierbar === false ? undefined : () => dl.setEmailOffen(true)}
      drucken={details.exportierbar === false ? undefined : () => dl.setDrucken(true)}
      brief={vorlagenMoeglich ? () => dl.setBriefOffen(true) : undefined}
      link={
        direktlink
          ? () => {
              const l = location.origin + direktlink;
              void kopiere(l).then((ok) => kopiert({ link: l, ok }));
            }
          : undefined
      }
      auskunft={details.auskunft ? () => geheZu(`/werkbank/auskuenfte/neu?mappe=${encodeURIComponent(details.mappe.id)}`) : undefined}
      // „Mit verknüpften Mappen löschen …“ (#424): dieselbe Rückfrage wie unter „Stattdessen“ am gesperrten Löschknopf
      // (#1211, Wunsch Thomas). „Mappe löschen“ selbst steht in der Speicherleiste, auch am Handy.
      loeschwege={
        mitVerknuepften
          ? [
              {
                text: t('ablage.mappeformular.mit-verknuepften-mappen-loeschen'),
                titel: t('ablage.mappeformular.diese-mappe-samt-allen'),
                tu: mitVerknuepften,
                rueckfrage: mitVerknuepftenFrage(mappe.titel),
              },
            ]
          : []
      }
    />
  );
}

/** Angelegt, zuletzt geändert und Archivmodus (#212): aufbewahren bis bzw. Frist beginnt mit … (#1051). */
function Index({ details }: { details: MappeDetails }) {
  const mappe = details.mappe;
  return (
    <dl className="index">
      <div>
        <dt>{t('ablage.mappeformular.angelegt')}</dt>
        <dd>
          {t('ablage.mappeformular.von', { zeit: zeit(mappe.erstellt) })} <Person id={mappe.erstelltVon} />
        </dd>
      </div>
      <div>
        <dt>{t('ablage.mappeformular.zuletzt-geaendert')}</dt>
        <dd>
          {t('ablage.mappeformular.von', { zeit: zeit(mappe.geaendert) })} <Person id={mappe.geaendertVon} />
        </dd>
      </div>
      {/* Archivmodus (#212) */}
      {/* Die Frist läuft noch nicht (#1051): aufbewahren, ohne Datum. */}
      {details.fristBeginntMit !== undefined && (
        <div>
          <dt>
            <Etikett art="warn" title={t('ablage.mappeformular.archivmodus-vor-fristende-nicht')}>
              {t('ablage.mappeformular.archiv')}
            </Etikett>
          </dt>
          <dd>{t('ablage.mappeformular.aufbewahren-frist-beginnt-mit', { feld: details.fristBeginntMit })}</dd>
        </div>
      )}
      {details.aufbewahrenBis && (
        <div>
          <dt>
            <Etikett art="warn" title={t('ablage.mappeformular.archivmodus-vor-fristende-nicht')}>
              {t('ablage.mappeformular.archiv')}
            </Etikett>
          </dt>
          <dd>
            {inFrist(details.aufbewahrenBis) ? t('ablage.mappeformular.aufbewahren-bis') : t('ablage.mappeformular.frist-abgelaufen-am')}{' '}
            {datumText(details.aufbewahrenBis)}
          </dd>
        </div>
      )}
    </dl>
  );
}

/** Die Dialoge an der Mappe – je nachdem, was im Menü „Mappe ▾“ gewählt ist. */
function MappeDialoge({
  typ,
  details,
  sicht,
  neuLaden,
  dl,
  zumFeld,
}: {
  typ: Mappentyp;
  details: MappeDetails;
  sicht: string;
  neuLaden: () => Promise<void>;
  dl: Dialoge;
  zumFeld(key: string): void;
}) {
  const mappe = details.mappe;
  const { kern, weitere } = vorlagenVon(details);
  const { paketAktion, vorlagenAktion } = dl;
  return (
    <>
      {dl.aufgabeOffen && (
        <NeueAufgabe
          mappeId={mappe.id}
          vorlage={kern('aufgabe_vergeben')}
          neuLaden={neuLaden}
          schliessen={() => dl.setAufgabeOffen(false)}
        />
      )}
      {dl.erinnernOffen && (
        <ErinnerungFormular
          mappeId={mappe.id}
          vorlage={kern('erinnern')}
          neuLaden={neuLaden}
          schliessen={() => dl.setErinnernOffen(false)}
        />
      )}
      {dl.vorlageOffen && weitere.some((v) => v.kennung === dl.vorlageOffen) && (
        <AblaufFormular
          key={dl.vorlageOffen}
          mappeId={mappe.id}
          vorlage={weitere.find((v) => v.kennung === dl.vorlageOffen)!}
          neuLaden={neuLaden}
          schliessen={() => dl.setVorlageOffen(null)}
        />
      )}
      {dl.loeschBaum && (
        <LoeschBaum
          key={mappe.id}
          mappeId={mappe.id}
          titel={mappe.titel ?? ''}
          sicht={sicht}
          schliessen={() => dl.setLoeschBaum(false)}
          neuLaden={neuLaden}
        />
      )}
      {dl.emailOffen && (
        <EmailMaske key={mappe.id} typ={typ} details={details} neuLaden={neuLaden} schliessen={() => dl.setEmailOffen(false)} />
      )}
      {dl.briefOffen && (
        <BriefAusVorlage
          key={mappe.id}
          typ={typ}
          details={details}
          neuLaden={neuLaden}
          zumFeld={zumFeld}
          schliessen={() => dl.setBriefOffen(false)}
        />
      )}
      {paketAktion && (
        <PaketAktion
          key={`${mappe.id}:${paketAktion.paket.id}:${paketAktion.schluessel}`}
          aktion={paketAktion}
          details={details}
          neuLaden={neuLaden}
          kern={(k) => {
            dl.setVorlagenAktion({ lauf: k.lauf, paket: k.paket, name: k.name, herunterladen: k.rechte.includes('herausgeben') });
            dl.setPaketAktion(null);
          }}
          schliessen={() => dl.setPaketAktion(null)}
        />
      )}
      {vorlagenAktion && (
        <BriefAusVorlage
          key={`${mappe.id}:${vorlagenAktion.lauf}`}
          typ={typ}
          details={details}
          neuLaden={neuLaden}
          zumFeld={zumFeld}
          aktion={vorlagenAktion}
          schliessen={() => dl.setVorlagenAktion(null)}
        />
      )}
      {dl.drucken && <Druckansicht typ={typ} details={details} fertig={dl.druckEnde} />}
    </>
  );
}
