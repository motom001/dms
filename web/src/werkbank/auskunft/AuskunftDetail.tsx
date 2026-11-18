import { useEffect, useState } from 'react';
import { istOffen, type AuskunftEintrag } from '../../../../shared/src/auskunft';
import { LinkZeile, Zustellen } from '../Zustellen';
import { datumText } from '../../../../shared/src/archiv';
import { datenschutzApi } from '../../api/datenschutz';
import { mappenApi } from '../../api/mappen';
import { useDaten } from '../../daten';
import { Hilfe } from '../../Hilfe';
import { Link } from '../../ort';
import { t } from '../../sprache';
import { titelOder } from '../../seiten';
import { Bereich, Knopf, KnopfLink, useBereiche, type BereichListe } from '../../bausteine';
import { FristText } from './AuskuenfteListe';
import { groesse, zeit, ZUSTAND_CHIP } from './hilfen';
import type { DatenschutzZustand } from './zustand';

type Daten = ReturnType<typeof useDaten>;
type Bereiche = ReturnType<typeof useBereiche<AuskunftBereich>>;

/** Bereiche einer Auskunft (#1000): Zustellen nur, solange die Datei bereitliegt; Links und Verlauf nur, wenn es sie gibt. */
type AuskunftBereich = 'angaben' | 'zustellen' | 'links' | 'verlauf';
function auskunftBereiche(e: AuskunftEintrag, links: number): BereichListe<AuskunftBereich> {
  return [
    ['angaben', t('werkbank.auskunft.detail.angaben')],
    ...(e.bereit ? [['zustellen', t('werkbank.auskunft.bereich.zustellen')] as const] : []),
    ...(links ? [['links', t('werkbank.auskunft.detail.links')] as const] : []),
    ...(e.art === 'auskunft' ? [['verlauf', t('werkbank.auskunft.detail.verlauf')] as const] : []),
  ];
}

export function AuskunftDetail({ e, z }: { e: AuskunftEintrag; z: DatenschutzZustand }) {
  const s = z.stand!;
  const d = useDaten();
  const [zustellen, setZustellen] = useState(() => new URLSearchParams(location.search).get('zustellen') === '1');
  const [fehler, setFehler] = useState<string>();
  const links = s.links.filter((l) => l.auskunftId === e.id);
  const b = e.bereit;
  // Sprungleiste und Bereiche (#1000) wie beim Mappentyp; gemerkt je Auskunft. Aus „Erzeugen → Zustellen“ steht Zustellen offen.
  const bereiche = useBereiche(auskunftBereiche(e, links.length), 'auskunft', e.id, { offen: true });
  useEffect(() => {
    if (zustellen && b) bereiche.oeffne(['zustellen']);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- nur beim ersten Anzeigen
  return (
    <div className="editorform">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.auskunft.detail.ueber')}</p>
        <h1>{titelOder(e.titel)}</h1>
        <p>
          <span className={`chip ${ZUSTAND_CHIP[e.zustand]}`}>{t(`werkbank.auskunft.zustand.${e.zustand}`)}</span>
          {e.frist && istOffen(e.zustand) && (
            <>
              {' '}
              · <FristText frist={e.frist} />
            </>
          )}
        </p>
      </div>
      {bereiche.leiste(undefined, t('werkbank.auskunft.bereiche'))}
      {angaben(e, d, bereiche)}
      {b && zustellenBereich({ b, z, bereiche, fehler, setFehler, zustellen, setZustellen })}
      {links.length > 0 && (
        <Bereich
          id="links"
          titel={t('werkbank.auskunft.detail.links')}
          hilfe={<Hilfe ort="werkbank.auskunft.zustellen" />}
          klappe={bereiche.klappe('links')}
          kurz={t('werkbank.auskunft.bereich.links.kurz', { anzahl: links.length })}>
          <ul className="auskunft-links">
            {links.map((l) => (
              <LinkZeile key={l.id} l={l} nachher={z.laden} />
            ))}
          </ul>
        </Bereich>
      )}
      {e.art === 'auskunft' && verlauf(e, bereiche)}
    </div>
  );
}

/** Angaben: Person, Zeit, Frist, Inhalt; bei einer Anfrage der Weg zum Erzeugen. */
function angaben(e: AuskunftEintrag, d: Daten, bereiche: Bereiche) {
  const b = e.bereit;
  return (
    <Bereich
      id="angaben"
      titel={t('werkbank.auskunft.detail.angaben')}
      klappe={bereiche.klappe('angaben')}
      kurz={
        e.mappen !== undefined
          ? t('werkbank.auskunft.detail.inhaltText', {
              mappen: t('werkbank.auskunft.liste.mappen', { anzahl: e.mappen }),
              dokumente: t('werkbank.auskunft.detail.dokumente', { anzahl: e.dokumente ?? 0 }),
            })
          : zeit(e.zeit)
      }>
      <dl className="eigenschaften">
        {e.mappeId && (
          <>
            <dt>{t('werkbank.auskunft.detail.person')}</dt>
            <dd>
              <PersonVerweis id={e.mappeId} titel={e.titel} />
            </dd>
          </>
        )}
        <dt>{e.art === 'anfrage' ? t('werkbank.auskunft.detail.angefragt') : t('werkbank.auskunft.detail.erstellt')}</dt>
        <dd>{zeit(e.zeit)}</dd>
        {e.frist && (
          <>
            <dt>{t('werkbank.auskunft.detail.frist')}</dt>
            <dd>
              {datumText(e.frist)}
              {istOffen(e.zustand) && (
                <>
                  {' '}
                  (<FristText frist={e.frist} />)
                </>
              )}
            </dd>
          </>
        )}
        {e.mappen !== undefined && (
          <>
            <dt>{t('werkbank.auskunft.detail.inhalt')}</dt>
            <dd>
              {t('werkbank.auskunft.detail.inhaltText', {
                mappen: t('werkbank.auskunft.liste.mappen', { anzahl: e.mappen }),
                dokumente: t('werkbank.auskunft.detail.dokumente', { anzahl: e.dokumente ?? 0 }),
              })}
              {b ? `, ${groesse(b.bytes)}` : ''}
              {e.verschluesselt ? ` · ${t('werkbank.auskunft.detail.passwort')}` : ''}
            </dd>
          </>
        )}
      </dl>
      {e.art === 'anfrage' && (
        <>
          <p>{t('werkbank.auskunft.detail.anfrage')}</p>
          <p className="knoepfe">
            <KnopfLink to={`/werkbank/auskuenfte/neu?mappe=${encodeURIComponent(e.mappeId ?? '')}`} art="haupt">
              {t('werkbank.auskunft.detail.erzeugen')}
            </KnopfLink>
          </p>
        </>
      )}
      {e.art === 'auftrag' && <p className="leise">{t('werkbank.auskunft.detail.auftrag')}</p>}
      {e.art === 'auskunft' && !b && <p className="leise klein">{t('werkbank.auskunft.detail.weg')}</p>}
      {e.fristAufgabe && e.mappeId && d.typen.length > 0 && (
        <p className="klein">
          <Link to={`/ablage/eingang/${e.fristAufgabe}`} className="verweis">
            {t('werkbank.auskunft.detail.aufgabe')}
          </Link>
        </p>
      )}
    </Bereich>
  );
}

/** Zustellen, Herunterladen und Löschen – solange die Datei bereitliegt. */
function zustellenBereich({
  b,
  z,
  bereiche,
  fehler,
  setFehler,
  zustellen,
  setZustellen,
}: {
  b: NonNullable<AuskunftEintrag['bereit']>;
  z: DatenschutzZustand;
  bereiche: Bereiche;
  fehler: string | undefined;
  setFehler: (f: string) => void;
  zustellen: boolean;
  setZustellen: (an: boolean) => void;
}) {
  const s = z.stand!;
  return (
    <Bereich
      id="zustellen"
      titel={t('werkbank.auskunft.bereich.zustellen')}
      hilfe={<Hilfe ort="werkbank.auskunft.zustellen" />}
      klappe={bereiche.klappe('zustellen', !!fehler)}
      kurz={t('werkbank.auskunft.detail.bis', { zeit: zeit(b.bis) })}>
      <p className="leise klein">{t('werkbank.auskunft.detail.bis', { zeit: zeit(b.bis) })}</p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      <p className="knoepfe">
        <Knopf art={zustellen ? 'neben' : 'haupt'} aria-expanded={zustellen} onClick={() => setZustellen(!zustellen)}>
          {zustellen ? t('werkbank.auskunft.detail.zustellenZu') : t('werkbank.auskunft.detail.zustellen')}
        </Knopf>
        <KnopfLink href={`/api/werkbank/auskunft/${b.id}/zip`} onClick={() => window.setTimeout(() => void z.laden(), 3000)}>
          {t('werkbank.auskunft.detail.herunterladen')}
        </KnopfLink>
        <Knopf
          art="gefahr"
          symbol="geloescht"
          rueckfrage={{
            titel: t('werkbank.auskunft.detail.loeschenFrage'),
            text: t('werkbank.auskunft.detail.loeschenText', { titel: titelOder(b.titel), zeit: zeit(b.erstellt) }),
            ja: t('werkbank.auskunft.detail.loeschen'),
          }}
          onClick={async () => {
            try {
              await datenschutzApi.auskunftLoeschen(b.id);
              await z.laden();
            } catch (x) {
              setFehler((x as Error).message);
            }
          }}>
          {t('werkbank.auskunft.detail.loeschen')}
        </Knopf>
      </p>
      {zustellen && <Zustellen a={b} s={s} nachher={z.laden} />}
    </Bereich>
  );
}

/** Verlauf einer erzeugten Auskunft. */
function verlauf(e: AuskunftEintrag, bereiche: Bereiche) {
  return (
    <Bereich
      id="verlauf"
      titel={t('werkbank.auskunft.detail.verlauf')}
      klappe={bereiche.klappe('verlauf')}
      kurz={
        e.verlauf.length
          ? t('werkbank.auskunft.bereich.verlauf.kurz', { anzahl: e.verlauf.length })
          : t('werkbank.auskunft.detail.verlaufLeer')
      }>
      {!e.verlauf.length ? (
        <p className="leise">{t('werkbank.auskunft.detail.verlaufLeer')}</p>
      ) : (
        <ul className="stapel auskunft-verlauf">
          {e.verlauf.map((v, i) => (
            <li key={i} className={v.erfolg === false ? 'fehlertext' : undefined}>
              <span className="leise klein">
                {zeit(v.zeit)}
                {v.von ? ` · ${v.von}` : ''}
              </span>
              <br />
              {v.text}
            </li>
          ))}
        </ul>
      )}
    </Bereich>
  );
}

/** Verweis auf die Mappe der Person – der Typ kommt aus den geladenen Daten, sonst nur der Titel. */
function PersonVerweis({ id, titel }: { id: string; titel: string }) {
  const [typId, setTypId] = useState<string>();
  useEffect(() => {
    mappenApi.mappe(id).then(
      (x) => setTypId(x.mappe.typId),
      () => {},
    );
  }, [id]);
  return typId ? (
    <Link to={`/ablage/${typId}/${id}`} className="verweis">
      {titelOder(titel)}
    </Link>
  ) : (
    <span>{titelOder(titel)}</span>
  );
}
