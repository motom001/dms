/** Mitte der Ablage (#1279 eigene Datei): Suche, Link, Start, Zuletzt, Papierkorb, Zu erledigen, Favoriten, Ansicht oder Typ. */
import { sichtBeschreibung, sichtName, typBeschreibung, typName } from '../../../../shared/src/beschriftung';
import type { Linkergebnis } from '../../../../shared/src/direktlink';
import { darfErstellen, darfPostAnlegen, type Mappentyp } from '../../../../shared/src/model';
import type { Sicht } from '../../../../shared/src/sichten';
import { istTeiltyp } from '../../../../shared/src/teile';
import { darfBereich } from '../../../../shared/src/verwaltungsrecht';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { Listenkopf } from '../../Listenkopf';
import { t } from '../../sprache';
import { PapierkorbListe, type usePapierkorb } from '../Papierkorb';
import { Startseite } from '../Startseite';
import { ErledigenUmschalter, MeineAufgabenWeitergeben, TermineSicht, type useErledigenAnsicht } from '../Termine';
import { ZuletztListe } from '../Zuletzt';
import { exportOhneSicht } from '../liste/hilfen';
import { Liste } from '../liste/Liste';
import { LinkListe, SuchListe, TeilListe } from '../liste/Listen';

export interface MitteProps {
  sicht: string;
  dritt: string | undefined;
  suche: URLSearchParams;
  istSuche: boolean;
  formular: boolean;
  setFormular(an: boolean): void;
  link: Linkergebnis | null;
  kalender: boolean;
  ansicht: ReturnType<typeof useErledigenAnsicht>;
  papierkorb: ReturnType<typeof usePapierkorb>;
  verwaltet: Sicht | undefined;
  typ: Mappentyp | undefined;
  typListe: string | undefined;
  sichtTypen: Mappentyp[];
  wahl: { key: string | null; spalten: string[] };
}

/** Sprechender Link (#98): Trefferliste – oder warum er sich nicht lesen lässt. */
function linkMitte(link: Linkergebnis, suche: URLSearchParams, dritt: string | undefined) {
  return link.ok ? (
    <LinkListe key={`${link.link.typ.id}:${JSON.stringify(link.link.bedingungen)}`} link={link.link} suche={suche} offen={dritt} />
  ) : (
    <>
      <Listenkopf titel={t('ablage.ablage.link')} />
      <div className="hinweis schlecht stapel" role="alert">
        <p>{t('ablage.ablage.dieser-link-laesst-sich')}</p>
        <ul>
          {link.fehler.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** Feste Einträge (#507, #725): Start, Zuletzt, Papierkorb, Zu erledigen (Liste oder Kalender), Favoriten; sonst undefined. */
function festeMitte({ sicht, dritt, papierkorb, kalender, ansicht }: MitteProps) {
  if (sicht === 'start') return <Startseite offen={dritt} breit={!dritt} />;
  if (sicht === 'zuletzt') return <ZuletztListe offen={dritt} />;
  if (sicht === 'papierkorb') return <PapierkorbListe z={papierkorb} werkbank={false} offen={dritt} />;
  if (sicht === 'eingang' && kalender) return <TermineSicht offen={dritt} a={ansicht} />;
  if (sicht === 'eingang')
    return (
      <Liste
        key="eingang"
        sicht="eingang"
        titel={t('ablage.ablage.zu-erledigen')}
        offen={dritt}
        hilfe="ablage.eingang"
        beschreibung={t('ablage.ablage.mappen-an-denen-du')}
        kopf={
          <div className="ka-leiste ka-liste">
            <ErledigenUmschalter a={ansicht} />
            <MeineAufgabenWeitergeben />
          </div>
        }
        leerText={t('ablage.ablage.nichts-zu-tun')}
      />
    );
  if (sicht === 'favoriten')
    return (
      <Liste
        key="favoriten"
        sicht="favoriten"
        titel={t('ablage.ablage.favoriten')}
        offen={dritt}
        hilfe="ablage.favoriten"
        beschreibung={t('ablage.ablage.mappen-die-du-mit')}
        leerText={t('ablage.ablage.noch-keine-favoriten-markiere')}
      />
    );
  return undefined;
}

const beschreibungVon = (verwaltet: Sicht | undefined, typ: Mappentyp | undefined) =>
  verwaltet ? sichtBeschreibung(verwaltet) : typ ? typBeschreibung(typ) || t('ablage.ablage.alle-mappen-dieses-mappentyps') : undefined;

const leerTextVon = (verwaltet: Sicht | undefined, typ: Mappentyp | undefined) =>
  typ?.system === 'post'
    ? t('ablage.ablage.keine-post-mit-post')
    : verwaltet?.bedingungen.some((x) => x.art === 'favorit')
      ? t('ablage.ablage.noch-keine-favoriten-markiere')
      : t('ablage.ablage.noch-keine-mappen-in');

/** Liste einer verwalteten Ansicht (#38) oder aller Mappen eines Typs (#888). */
function typMitte({ sicht, dritt, verwaltet, typ, typListe, sichtTypen, wahl }: MitteProps, exportOhne: boolean, bearbeiten?: string) {
  return (
    <Liste
      key={sicht}
      sicht={sicht}
      typ={typ}
      spaltenTyp={typ ?? sichtTypen[0]}
      spalten={wahl.spalten}
      listenSpalten={wahl.key ? wahl.spalten : []}
      titel={verwaltet ? sichtName(verwaltet) : typListe!}
      bereich={verwaltet ? sichtName(verwaltet) : typ ? typName(typ) : undefined}
      beschreibung={beschreibungVon(verwaltet, typ)}
      offen={dritt}
      neu={!!typ && darfErstellen(typ) && verwaltet?.rechte?.C !== false}
      post={!!typ && darfPostAnlegen(typ) && verwaltet?.rechte?.C !== false}
      leerText={leerTextVon(verwaltet, typ)}
      hilfe={typ?.system === 'post' ? 'ablage.post' : 'ablage.sicht'}
      auswahl
      export={verwaltet ? verwaltet.rechte?.E !== false : exportOhne}
      bearbeiten={bearbeiten}
    />
  );
}

export function Mitte(p: MitteProps) {
  const d = useDaten();
  const { ich } = useKonto();
  const { sicht, dritt, verwaltet, typ } = p;
  if (p.istSuche) return <SuchListe suche={p.suche} offen={dritt} formular={p.formular} setFormular={p.setFormular} />;
  if (p.link) return linkMitte(p.link, p.suche, dritt);
  const fest = festeMitte(p);
  if (fest !== undefined) return fest;
  if (!verwaltet && typ && istTeiltyp(typ)) return <TeilListe typ={typ} />;
  // „Ansicht bearbeiten“ (#1285): nur an einer Ansicht und für alle, die in der Werkbank Ansichten bearbeiten dürfen.
  const bearbeiten = verwaltet && (ich.rolle === 'admin' || darfBereich(ich, 'sichten')) ? `/werkbank/sichten/${verwaltet.id}` : undefined;
  if (verwaltet || typ) return typMitte(p, exportOhneSicht(ich.rolle === 'admin', d.sichten), bearbeiten);
  return sicht ? (
    <div className="leer">
      <p>{t('ablage.ablage.diese-ansicht-gibt-es')}</p>
    </div>
  ) : null;
}
