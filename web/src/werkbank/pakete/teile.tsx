import { useState } from 'react';
import { Knopf } from '../../bausteine';
import {
  ergaenzungenVon,
  rechtePunkte,
  rechteZeilen,
  herkunftText,
  KATALOG_LINK_REL,
  sammelSeiteMitVersion,
  type AblaufErgebnis,
  type InstalliertesPaket,
  type Katalog,
  type KatalogVersion,
} from '../../../../shared/src/pakete';
import { mitkommtAusKatalog } from '../../../../shared/src/mitkommt';
import { KEINE_LIZENZ, lizenzArtVon } from '../../../../shared/src/paketerstellung';
import type { VorgabeFrage } from '../../../../shared/src/vorgaben';
import { ApiFehler } from '../../api/anfrage';
import { paketeApi, type BeispielBehalten } from '../../api/pakete';
import { useDaten } from '../../daten';
import { Hilfe } from '../../Hilfe';
import { geheZu } from '../../ort';
import { rueckfrage } from '../../rueckfrage';
import { t as tx, t, tn } from '../../sprache';
import { Symbol } from '../../Symbol';
import { Kopf } from '../Kopf';
import { PaketAblauf } from '../PaketAblauf';
import { SammeldateiAnsicht, SammeldateiWahl } from '../PaketeDazuholen';
import type { PaketeZustand } from '../paketeZustand';
import { Kurzanleitung, MitkommtInhalt } from '../PaketMitkommt';
import { alsMeldung, Herausgeber, MeldungBox, VorschauBlock, type Meldung } from '../PaketVorschau';
import { NEU, UPLOAD } from './pfade';

/**
 * Teile der Seite „Pakete“ (#1279 aus Pakete.tsx gezogen): Entfernen mit Rückfragen, Sammeldatei und hochgeladenes
 * Paket, „Was mitkommt“, Ergänzungen und Lizenz.
 */

/** Beispiel-Mappen, die beim Entfernen blieben (#878), als Satz hinter der Meldung. */
export const behaltenText = (l?: BeispielBehalten[]) =>
  l?.length ? ` ${t('werkbank.pakete.beispiele-behalten', { anzahl: l.length, titel: l.map((b) => `„${b.titel}“`).join(', ') })}` : '';
/** Vorgaben (#1038), die nach dem Entfernen als gewöhnliche Mappen bleiben. */
export const vorgabenText = (l?: Array<{ titel: string }>) =>
  l?.length ? ` ${t('werkbank.pakete.vorgaben-behalten', { anzahl: l.length, titel: l.map((b) => `„${b.titel}“`).join(', ') })}` : '';

/**
 * Entfernen mit den Rückfragen des Servers (409): Sprachpaket in Gebrauch (#731) – nur auf ausdrücklichen Wunsch;
 * unbenutzte Vorgaben in Mappentypen anderer Pakete (#1038) – mit entfernen oder als gewöhnliche Mappen behalten.
 */
export async function entferneMitFragen(id: string, einstellungenBehalten: boolean) {
  let sprache = false;
  let vorgaben: 'entfernen' | 'behalten' | undefined;
  for (;;) {
    try {
      return await paketeApi.paketEntfernen(id, einstellungenBehalten, sprache, vorgaben);
    } catch (e) {
      const d =
        e instanceof ApiFehler && e.status === 409
          ? (e.details as { sprache?: unknown; vorgaben?: VorgabeFrage[] } | undefined)
          : undefined;
      if (d?.sprache && !sprache) {
        if (
          !(await rueckfrage({
            titel: (e as Error).message,
            text: (e as ApiFehler).gruende.join(' '),
            ja: t('werkbank.pakete.sprache.entfernen'),
            gefahr: true,
          }))
        )
          throw e;
        sprache = true;
      } else if (d?.vorgaben?.length && !vorgaben) {
        const ja = await rueckfrage({
          titel: (e as Error).message,
          text: (
            <>
              <p>{t('werkbank.pakete.vorgaben-frage.text')}</p>
              <ul>
                {d.vorgaben.map((v) => (
                  <li key={v.id}>
                    {v.titel}
                    {v.typ && <span className="leise"> · {v.typ}</span>}
                  </li>
                ))}
              </ul>
            </>
          ),
          ja: t('werkbank.pakete.vorgaben-frage.entfernen'),
          nein: t('werkbank.pakete.vorgaben-frage.behalten'),
          gefahr: true,
        });
        vorgaben = ja ? 'entfernen' : 'behalten';
      } else throw e;
    }
  }
}

/**
 * Pakete ohne Internet (#461): Sammeldatei aus der Katalog-Webseite hochladen, Inhalt ansehen und Paket für
 * Paket installieren.
 */
export function SammelDetail({ z }: { z: PaketeZustand }) {
  const d = useDaten();
  const dms = z.stand?.dms ?? '';
  const s = z.sammel;
  return (
    <div className="einspaltig">
      <Kopf
        titel={t('werkbank.pakete.sammeldatei-hochladen')}
        ueber={t('werkbank.pakete.pakete-ohne-internet')}
        hilfe="werkbank.pakete.sammeldatei">
        <p className="leise">
          {tn('werkbank.pakete.kommt-dein-ablago-nicht', {
            link: (
              <a className="verweis" href={sammelSeiteMitVersion(dms)} target="_blank" rel={KATALOG_LINK_REL}>
                {tn('werkbank.pakete.katalog-webseite', { symbol: <Symbol name="extern" /> })}
              </a>
            ),
          })}
        </p>
        <p className="leise klein">{tx('pakete.katalog.hinweis')}</p>
      </Kopf>
      {!s ? (
        <SammeldateiWahl
          geladen={(x, datei) => z.setSammel({ sammeldatei: x, datei })}
          einzeln={(r, datei) => {
            z.setUpload({ ...r, datei });
            geheZu(`/werkbank/pakete/${UPLOAD}`);
          }}
        />
      ) : (
        <SammeldateiAnsicht
          key={s.sammeldatei.datei.sha256}
          s={s.sammeldatei}
          datei={s.datei}
          dms={dms}
          installiert={z.stand?.installiert ?? []}
          geaendert={() => {
            void z.laden();
            void d.neuLaden();
          }}
          abbrechen={() => z.setSammel(null)}
          fertig={() => {
            z.setSammel(null);
            void z.laden();
            geheZu('/werkbank/pakete');
          }}
        />
      )}
    </div>
  );
}

export function UploadDetail({ z }: { z: PaketeZustand }) {
  const d = useDaten();
  const [meldung, setMeldung] = useState<Meldung>();
  const u = z.upload;
  if (!u)
    return (
      <div className="leer">
        <p>{t('werkbank.pakete.kein-hochgeladenes-paket-lade')}</p>
      </div>
    );
  const p = u.vorschau.paket;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.pakete.hochgeladenes-paket')}</p>
        <h1>
          {p.name} {p.version}
          <Herausgeber wer={p.herausgeber} geprueft={p.herausgeberGeprueft} />
        </h1>
        <p className="leise">{p.beschreibung}</p>
      </div>
      <MeldungBox m={meldung} />
      <section className="blatt">
        <dl className="eigenschaften">
          <dt>{t('werkbank.pakete.datei')}</dt>
          <dd>{u.datei}</dd>
          <dt>{t('werkbank.pakete.lizenz')}</dt>
          <dd>
            <LizenzAngabe lizenz={p.lizenz} />
          </dd>
          <dt>{t('werkbank.pakete.autor')}</dt>
          <dd>
            {p.autor.name}
            {p.autor.github ? ` (@${p.autor.github})` : ''}
          </dd>
          <dt>{t('werkbank.pakete.noetige-ablago-version')}</dt>
          <dd>{t('werkbank.pakete.dieser-installation', { dms: p.dms, dmsVersion: u.vorschau.dmsVersion })}</dd>
          {u.vorschau.installiert && (
            <>
              <dt>{t('werkbank.pakete.installiert')}</dt>
              <dd>
                {t('werkbank.pakete.version-3', {
                  installiert: u.vorschau.installiert,
                  wert: u.vorschau.herkunft ? ` · ${herkunftText(u.vorschau.herkunft)}` : '',
                })}
              </dd>
            </>
          )}
        </dl>
      </section>
      <VorschauBlock
        v={u.vorschau}
        warnung={t('werkbank.pakete.hochgeladen-aus-der-datei', { datei: u.datei })}
        abbrechen={() => {
          z.setUpload(null);
          geheZu('/werkbank/pakete');
        }}
        los={async (x) => {
          try {
            const r = await paketeApi.paketInstallieren({ upload: u.upload, bestaetigt: true, ...x });
            z.setUpload(null);
            await z.laden();
            await d.neuLaden();
            geheZu(`/werkbank/pakete/${r.id}?${NEU}`);
          } catch (e) {
            setMeldung(alsMeldung(e));
          }
        }}
      />
    </div>
  );
}

/**
 * „Was mitkommt“ auf der Paketseite (#1047): installiert, was diese Version mitbrachte, dazu die Rechte des Codes und die
 * Kurzanleitung; vor der Installation, was der Katalog verrät (alles Weitere zeigt die Vorschau). Installationen vor #1047
 * kennen es erst nach dem nächsten Update.
 */
export function PaketMitkommt({
  inst,
  v,
  installiert,
}: {
  inst: InstalliertesPaket | null;
  v: KatalogVersion | null | undefined;
  installiert: InstalliertesPaket[];
}) {
  const d = useDaten();
  const m = inst?.mitkommt ?? (v ? mitkommtAusKatalog(v) : null);
  if (!m) return null;
  // Mappentyp eines Verweises im Code (eigener Schlüssel oder paket:typ) – wie in der Vorschau.
  const typName = (vw: string) => {
    const [p, k] = vw.includes(':') ? vw.split(':') : [inst?.id ?? '', vw];
    return d.typ((p === inst?.id ? inst.typen : installiert.find((x) => x.id === p)?.typen)?.[k] ?? '')?.name ?? k;
  };
  const rechte = inst?.laeufer ? rechteZeilen(rechtePunkte(inst.laeufer, typName)) : undefined;
  return (
    <section className="blatt stapel" aria-label={t('werkbank.pakete.mitkommt.titel')} data-anker="pakete.mitkommt">
      <h2 className="h3">
        {t('werkbank.pakete.mitkommt.titel')} <Hilfe ort="werkbank.pakete.mitkommt" />
      </h2>
      {!inst?.mitkommt && <p className="leise klein">{inst ? t('werkbank.pakete.mitkommt.alt') : t('werkbank.pakete.mitkommt.katalog')}</p>}
      <MitkommtInhalt m={m} rechte={inst?.mitkommt ? rechte : undefined} />
      {inst && !anleitungLeer(inst) && <Kurzanleitung k={inst.kurzanleitung} />}
    </section>
  );
}
const anleitungLeer = (inst: InstalliertesPaket) => !inst.kurzanleitung || !Object.keys(inst.kurzanleitung).length;

/** Erfolgsmeldung oben (#659): „… ist installiert“, bei Pflicht-Einstellungen mit dem Hinweis darauf. */
export function fertigText(e: AblaufErgebnis) {
  const namen = e.installiert.map((x) => `${x.name} ${x.version}`).join(', ');
  const spaeter = e.installiert.filter((x) => x.einstellungen === 'spaeter' || x.einstellungen === 'fehler');
  return spaeter.length
    ? `${tx('pakete.ablauf.fertig', { namen })} ${tx('pakete.ablauf.fertig.einstellen', { namen: spaeter.map((x) => x.name).join(', ') })}`
    : tx('pakete.ablauf.fertig', { namen });
}

/**
 * Ergänzungen eines installierten Pakets nachträglich (#405), z. B. weitere Sprachen der Texterkennung: Häkchen, dann
 * derselbe Ablauf wie beim Installieren.
 */
export function ErgaenzungenBlock({
  z,
  inst,
  katalog,
  quelle,
}: {
  z: PaketeZustand;
  inst: InstalliertesPaket;
  katalog: Katalog;
  quelle?: string;
}) {
  const d = useDaten();
  const [offen, setOffen] = useState(false);
  const [meldung, setMeldung] = useState<Meldung>();
  const stand = z.stand!;
  const erg = ergaenzungenVon(katalog, inst.id, stand.dms, stand.installiert);
  if (!erg.length && !meldung && !offen) return null;
  const gruppen = [...new Set(erg.map((x) => x.gruppe ?? tx('pakete.ablauf.ergaenzungen')))];
  return (
    <section className="blatt stapel" aria-label={t('werkbank.pakete.dazu.passend')}>
      {/* „Dazu passend“ (#1048): Ergänzungen beim Hauptpaket, z. B. Zusatzsprachen der Texterkennung. */}
      <h2 className="h3">
        {t('werkbank.pakete.dazu.passend')} <Hilfe ort="werkbank.pakete.ablauf" />
      </h2>
      <p className="leise klein">{gruppen.join(', ')}</p>
      <MeldungBox m={meldung} />
      {!offen ? (
        <>
          {erg.length > 0 && (
            <p className="leise">
              {tx('pakete.ablauf.nachtraeglich', {
                anzahl: erg.length,
                namen: erg
                  .slice(0, 4)
                  .map((x) => (x.name.includes(' – ') ? x.name.slice(x.name.lastIndexOf(' – ') + 3) : x.name))
                  .join(', '),
              })}
            </p>
          )}
          {erg.length > 0 && (
            <div className="knoepfe">
              <Knopf
                onClick={() => {
                  setMeldung(undefined);
                  setOffen(true);
                }}>
                {tx('pakete.ablauf.nachtraeglich.knopf')}
              </Knopf>
            </div>
          )}
        </>
      ) : (
        <PaketAblauf
          quelle={{ art: 'katalog', katalog, quelle, dms: stand.dms, installiert: stand.installiert }}
          start={[]}
          nur={[inst.id]}
          aktionen={<Knopf onClick={() => setOffen(false)}>{t('werkbank.pakete.abbrechen')}</Knopf>}
          geaendert={() => {
            void z.laden();
            void d.neuLaden();
          }}
          fertig={(e) => {
            setOffen(false);
            if (e.installiert.length) setMeldung({ art: 'gut', text: fertigText(e) });
          }}
        />
      )}
    </section>
  );
}

/** Lizenz eines Pakets (#651): bei eigener oder fehlender Lizenz mit sachlichem Hinweis. */
export function LizenzAngabe({ lizenz }: { lizenz: string }) {
  const art = lizenzArtVon(lizenz);
  if (art === 'frei') return <>{lizenz}</>;
  return (
    <>
      {art === 'keine' || lizenz === KEINE_LIZENZ
        ? tx('pakete.erstellen.lizenz.keine')
        : lizenz.replace(/^LicenseRef-/, '').replace(/-/g, ' ')}
      <small className="leise" style={{ display: 'block' }}>
        {tx(art === 'keine' ? 'pakete.vorschau.lizenz.keine' : 'pakete.vorschau.lizenz.eigen')}
      </small>
    </>
  );
}
