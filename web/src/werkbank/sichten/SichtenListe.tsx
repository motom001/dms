import { Ansage, Ziehgriff } from '../../ziehen';
import type { Mappentyp } from '../../../../shared/src/model';
import {
  bedingungsProblem,
  kinderVon,
  trefferlistenProblem,
  wirksameTypen,
  typenDerSicht,
  zeigtAlleTypen,
  type Sicht,
} from '../../../../shared/src/sichten';
import { useDaten } from '../../daten';
import { Link } from '../../ort';
import { Listenkopf } from '../../Listenkopf';
import { t } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import {
  GeloeschteEintraege,
  Fundstellen,
  Hervorgehoben,
  KeineTreffer,
  Knopf,
  KnopfLink,
  ListenSuche,
  PaketChip,
  PaketFilter,
  useListenSuche,
} from '../../bausteine';
import { paketHerkunft, paketVonSicht, paketWahl, quellenSicht } from '../listensuche';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { baumzeilen, type Zeile } from './baum';
import { useSichtenOrdnen } from './sichten-ordnen';

type Daten = ReturnType<typeof useDaten>;
type Fund = ReturnType<typeof useListenSuche<Zeile>>['treffer'][number];

/**
 * Ansichten in der Mitte: Baum zum Ordnen (#73). Mit Suche oder Paketfilter (#978) stehen nur die passenden Ansichten
 * da, mit Fundstellen und ohne Griffe – geordnet wird im ganzen Baum.
 */
export function SichtenListe({ offen, pakete = [] }: { offen?: string; pakete?: InstalliertesPaket[] }) {
  const d = useDaten();
  const alleZeilen = baumzeilen(d.sichten);
  const such = useListenSuche(alleZeilen, {
    quellen: ({ s }) => quellenSicht(s, { pakete, typen: d.typen }),
    herkunft: ({ s }) => paketVonSicht(s, pakete),
  });
  const zeilen = such.treffer.map((x) => x.eintrag);
  const fund = new Map(such.treffer.map((x) => [x.eintrag.s.id, x]));
  const o = useSichtenOrdnen();
  return (
    <>
      <Listenkopf
        titel={t('werkbank.sichten.ansichten')}
        hilfe="werkbank.sichten"
        beschreibung={t('werkbank.sichten.was-die-ablage-links')}>
        <KnopfLink to="/werkbank/sichten/neu" art="anlegen" groesse="klein">
          {t('werkbank.sichten.neu')}
        </KnopfLink>
      </Listenkopf>
      {o.fehler && (
        <div className="hinweis schlecht">
          <p>{o.fehler}</p>
        </div>
      )}
      {o.hinweis && (
        <div className="hinweis info">
          <p>{o.hinweis}</p>
          <Knopf groesse="klein" onClick={() => o.setHinweis(undefined)}>
            {t('werkbank.sichten.ausblenden')}
          </Knopf>
        </div>
      )}
      <Ansage text={o.ansage} />
      {alleZeilen.length > 0 && (
        <ListenSuche
          wert={such.eingabe}
          setze={such.setEingabe}
          beschriftung={t('werkbank.listensuche.sichten.beschriftung')}
          platzhalter={t('werkbank.listensuche.sichten.platzhalter')}
          anker="werkbank.sichten.suche"
          treffer={such.treffer.length}
          aktiv={such.aktiv}
          anzahl={t('werkbank.listensuche.sichten.anzahl', { anzahl: alleZeilen.length })}
          filter={<PaketFilter wert={such.paket} setze={such.setPaket} pakete={paketWahl(such.paketeDa, pakete)} eigene={such.eigeneDa} />}
        />
      )}
      {!such.aktiv && zeilen.length > 1 && <p className="leise klein">{t('werkbank.sichten.zum-ordnen-am-griff')}</p>}
      {!alleZeilen.length && offen !== 'neu' ? (
        <p className="leise leerliste">{t('werkbank.sichten.noch-keine-ansichten-ohne')}</p>
      ) : !zeilen.length && offen !== 'neu' ? (
        <KeineTreffer zuruecksetzen={such.zuruecksetzen} />
      ) : (
        <ul className="mappenliste">
          {offen === 'neu' && (
            <li>
              <span className="eintrag an werk">
                <span className="titel">{t('werkbank.sichten.neue-ansicht')}</span>
                <span className="unter">{t('werkbank.sichten.noch-nicht-gespeichert')}</span>
              </span>
            </li>
          )}
          {zeilen.map((zeile) => listenZeile({ zeile, d, aktiv: such.aktiv, f: fund.get(zeile.s.id), o, offen, pakete }))}
        </ul>
      )}
      <GeloeschteEintraege art="sicht" />
    </>
  );
}

/** Eine Zeile des Baums – als Funktion aufgerufen, damit der Baum genau so entsteht wie vorher. */
function listenZeile({
  zeile: { s, tiefe },
  d,
  aktiv,
  f,
  o,
  offen,
  pakete,
}: {
  zeile: Zeile;
  d: Daten;
  aktiv: boolean;
  f: Fund | undefined;
  o: ReturnType<typeof useSichtenOrdnen>;
  offen?: string;
  pakete: InstalliertesPaket[];
}) {
  const e = o.z.eintrag(s.id);
  const eintrag2 = typenDerSicht(
    s,
    d.typen.map((mappentyp) => mappentyp.id),
  )
    .map((text) => d.typ(text))
    .filter((eintrag): eintrag is Mappentyp => !!eintrag);
  const probleme = s.bedingungen.filter((b) => bedingungsProblem(b, eintrag2)).length;
  const listenProblem = trefferlistenProblem(
    s.trefferliste,
    wirksameTypen(
      d.sichten,
      s.id,
      d.typen.map((x) => x.id),
    )
      .map((x) => d.typ(x))
      .filter((x): x is Mappentyp => !!x),
  );
  const kinder = kinderVon(d.sichten, s.id).length;
  const inhalt = (
    <Link to={`/werkbank/sichten/${s.id}`} className={`eintrag werk ${offen === s.id ? 'an' : ''}`}>
      <span className="titel">
        {tiefe > 0 && !aktiv && (
          <span className="leise" aria-hidden="true">
            └{' '}
          </span>
        )}
        <Hervorgehoben teile={f?.titel} text={s.name} />
        <PaketChip paket={paketHerkunft(paketVonSicht(s, pakete), pakete)} inLink />
      </span>
      <span className="unter">{unterzeile(s, eintrag2, kinder, d)}</span>
      {probleme > 0 && <span className="problem">{t('werkbank.sichten.bedingungen-ohne-wirkung-bitte', { anzahl: probleme })}</span>}
      {listenProblem && <span className="problem">{t('werkbank.sichten.trefferliste-fehlt-zeigt-die')}</span>}
      {f && <Fundstellen funde={f.funde} />}
    </Link>
  );
  // Gefiltert (#978): ohne Griff und Einrückung – Ordnen geht nur im ganzen Baum.
  if (aktiv) return <li key={s.id}>{inhalt}</li>;
  return (
    <li key={s.id} {...e} className={`ziehbar ${e.className}`} style={{ paddingLeft: tiefe * 16 }}>
      <Ziehgriff griff={o.z.griff(s.id, s.name)} tasten={o.tasten(s)} />
      {inhalt}
    </li>
  );
}

/** Unter dem Namen: Mappentypen, Bedingungen, Unteransichten, Zahl der Mappen und Regeln. */
function unterzeile(s: Sicht, typen: Mappentyp[], kinder: number, d: Daten) {
  return (
    <>
      {zeigtAlleTypen(s)
        ? t('werkbank.sichten.alle-mappentypen')
        : typen.length
          ? typen.map((x) => x.name).join(', ')
          : t('werkbank.sichten.nur-zum-gruppieren')}
      {s.bedingungen.length > 0 && t('werkbank.sichten.bedingungen', { anzahl: s.bedingungen.length })}
      {kinder > 0 && t('werkbank.sichten.unteransichten', { anzahl: kinder })}
      {d.zahlenDa && t('werkbank.sichten.mappen', { wert: (d.zaehler.sichten?.[s.id] ?? 0).toLocaleString(gebietsschema()) })}
      {s.berechtigungen?.regeln.length ? t('werkbank.sichten.regeln-2', { anzahl: s.berechtigungen.regeln.length }) : ''}
    </>
  );
}
