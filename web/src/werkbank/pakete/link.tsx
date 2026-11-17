import { useEffect, useState } from 'react';
import { Knopf, KnopfLink } from '../../bausteine';
import type { Katalog } from '../../../../shared/src/pakete';
import { PAKET_ID } from '../../../../shared/src/kennungen';
import { paketeApi, type PaketVorschau } from '../../api/pakete';
import { useDaten } from '../../daten';
import { geheZu } from '../../ort';
import { t, tn } from '../../sprache';
import { PaketAblauf } from '../PaketAblauf';
import type { PaketeZustand } from '../paketeZustand';
import { alsMeldung, MeldungBox, VorschauBlock, type Meldung } from '../PaketVorschau';
import { NEU } from './pfade';
import { LizenzAngabe } from './teile';

/**
 * Installieren per Link (#191; #1279 aus Pakete.tsx gezogen): /werkbank/pakete?installieren=<id>@<version> zeigt die
 * Vorschau genau dieses Pakets – immer aus dem offiziellen Katalog; andere Parameter zählen nicht. Installiert wird
 * erst nach Klick auf „Installieren“.
 */

/** Vorschau des Pakets und – zum Installieren (#405) – der offizielle Katalog (Abhängigkeiten, Ergänzungen). */
function useLinkVorschau(id: string, version: string | undefined, gueltig: boolean) {
  const [vorschau, setVorschau] = useState<PaketVorschau | null>(null);
  const [meldung, setMeldung] = useState<Meldung>();
  // Neu installieren (#405): im gemeinsamen Ablauf – dafür der offizielle Katalog (Abhängigkeiten, Ergänzungen).
  const [katalog, setKatalog] = useState<Katalog | null>(null);
  useEffect(() => {
    if (!gueltig) return;
    let aktuell = true;
    paketeApi.paketVorschau({ id, version: version || undefined }).then(
      (v) => aktuell && setVorschau(v),
      (e) => aktuell && setMeldung(alsMeldung(e)),
    );
    return () => {
      aktuell = false;
    };
  }, [id, version, gueltig]);
  useEffect(() => {
    if (!vorschau || vorschau.installiert) return;
    let aktuell = true;
    paketeApi.paketKatalog(false).then(
      (k) => {
        const o = k.kataloge.find((x) => x.offiziell);
        if (aktuell && o?.katalog) setKatalog(o.katalog);
        else if (aktuell) setMeldung({ art: 'schlecht', text: o?.fehler ?? t('werkbank.pakete.der-katalog-laesst-sich') });
      },
      (e) => aktuell && setMeldung(alsMeldung(e)),
    );
    return () => {
      aktuell = false;
    };
  }, [vorschau]);
  return { vorschau, meldung, setMeldung, katalog };
}

/** Angaben zum Paket: Lizenz, Autor, nötige Ablago-Version, installierte Version, README. */
function LinkEigenschaften({ vorschau }: { vorschau: PaketVorschau }) {
  return (
    <section className="blatt">
      <dl className="eigenschaften">
        <dt>{t('werkbank.pakete.lizenz')}</dt>
        <dd>
          <LizenzAngabe lizenz={vorschau.paket.lizenz} />
        </dd>
        <dt>{t('werkbank.pakete.autor')}</dt>
        <dd>
          {vorschau.paket.autor.name}
          {vorschau.paket.autor.github ? ` (@${vorschau.paket.autor.github})` : ''}
        </dd>
        <dt>{t('werkbank.pakete.noetige-ablago-version')}</dt>
        <dd>{t('werkbank.pakete.dieser-installation', { dms: vorschau.paket.dms, dmsVersion: vorschau.dmsVersion })}</dd>
        {vorschau.installiert && (
          <>
            <dt>{t('werkbank.pakete.installiert')}</dt>
            <dd>{t('werkbank.pakete.version-2', { installiert: vorschau.installiert })}</dd>
          </>
        )}
        {vorschau.paket.readme && (
          <>
            <dt>{t('werkbank.pakete.mehr')}</dt>
            <dd>
              <a className="verweis" href={vorschau.paket.readme} target="_blank" rel="noreferrer">
                {t('werkbank.pakete.readme')}
              </a>
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

/** „Schon installiert“ (fester Fehlercode, #729) mit dem Weg zur Paketseite. */
function SchonInstalliert({ z, id, vorschau }: { z: PaketeZustand; id: string; vorschau: PaketVorschau }) {
  return (
    <div className="hinweis info">
      <p>
        {tn('werkbank.pakete.ist-schon-installiert-version', { name: vorschau.paket.name, installiert: vorschau.installiert })}{' '}
        <Knopf
          onClick={() => {
            void z.abrufen(false);
            geheZu(`/werkbank/pakete/${id}`);
          }}>
          {t('werkbank.pakete.zum-paket')}
        </Knopf>{' '}
        {t('werkbank.pakete.dort-gibt-es-ggf')}
      </p>
    </div>
  );
}

/** Update über den Link: Vorschau mit Knöpfen; danach neu laden und zur Paketseite. */
function LinkUpdate({
  z,
  id,
  vorschau,
  setMeldung,
}: {
  z: PaketeZustand;
  id: string;
  vorschau: PaketVorschau;
  setMeldung(m: Meldung): void;
}) {
  const d = useDaten();
  return (
    <VorschauBlock
      v={vorschau}
      warnung={null}
      abbrechen={() => geheZu('/werkbank/pakete')}
      los={async (x) => {
        try {
          const r = vorschau.update
            ? await paketeApi.paketAktualisieren(id, vorschau.paket.version, x.bestaetigt, x.rechteBestaetigt, {
                automatisierungen: x.automatisierungen,
                herausgeberBestaetigt: x.herausgeberBestaetigt,
                umbauBestaetigt: x.umbauBestaetigt,
                umbauEntscheidungen: x.umbauEntscheidungen,
                sichtenErsetzen: x.sichtenErsetzen,
              })
            : await paketeApi.paketInstallieren({ id, version: vorschau.paket.version, ...x });
          await z.laden();
          await d.neuLaden();
          await z.abrufen(false);
          geheZu(`/werkbank/pakete/${r.id}`);
        } catch (e) {
          setMeldung(alsMeldung(e));
        }
      }}
    />
  );
}

/** Kopf: „Paket aus dem offiziellen Katalog“, Name mit Version, Beschreibung. */
function LinkKopf({ id, version, vorschau }: { id: string; version?: string; vorschau: PaketVorschau | null }) {
  return (
    <div className="mappenkopf">
      <p className="ueber">{t('werkbank.pakete.paket-aus-dem-offiziellen')}</p>
      <h1>
        {vorschau?.paket.name ?? id}
        {vorschau ? ` ${vorschau.paket.version}` : version ? ` ${version}` : ''}
      </h1>
      {vorschau && <p className="leise">{vorschau.paket.beschreibung}</p>}
    </div>
  );
}

/** Neu installieren (#405) im gemeinsamen Ablauf; danach zur Paketseite mit Kurzanleitung (#1047). */
function LinkAblauf({ z, id, version, katalog }: { z: PaketeZustand; id: string; version?: string; katalog: Katalog }) {
  const d = useDaten();
  const stand = z.stand!;
  return (
    <PaketAblauf
      quelle={{ art: 'katalog', katalog, dms: stand.dms, installiert: stand.installiert }}
      start={[id]}
      nur={[id]}
      versionen={version ? { [id]: version } : {}}
      aktionen={<KnopfLink to="/werkbank/pakete">{t('werkbank.pakete.abbrechen')}</KnopfLink>}
      geaendert={() => {
        void z.laden();
        void d.neuLaden();
      }}
      fertig={(e) => {
        void z.abrufen(false);
        geheZu(e.installiert.some((x) => x.id === id) ? `/werkbank/pakete/${id}?${NEU}` : '/werkbank/pakete');
      }}
    />
  );
}

export function PaketLink({ z, wert }: { z: PaketeZustand; wert: string }) {
  const [id, version] = wert.split('@');
  const gueltig = PAKET_ID.test(id ?? '') && (!version || /^\d+\.\d+\.\d+$/.test(version));
  const { vorschau, meldung, setMeldung, katalog } = useLinkVorschau(id, version, gueltig);
  if (!gueltig)
    return (
      <div className="leer">
        <p>{tn('werkbank.pakete.dieser-link-ist-ungueltig', { code: <code>{'?installieren=paket@1.0.0'}</code> })}</p>
      </div>
    );
  // Fester Fehlercode statt Text des Servers (#729): gilt in jeder Sprache.
  const schon = !!vorschau?.installiert && !!vorschau.fehlercodes?.includes('schon-installiert');
  return (
    <div className="einspaltig">
      <LinkKopf id={id} version={version} vorschau={vorschau} />
      <MeldungBox m={meldung} />
      {!vorschau && !meldung && <p className="leise">{t('werkbank.pakete.frage-den-offiziellen-katalog')}</p>}
      {vorschau && <LinkEigenschaften vorschau={vorschau} />}
      {schon && <SchonInstalliert z={z} id={id} vorschau={vorschau!} />}
      {vorschau && !schon && !vorschau.update && katalog && z.stand && <LinkAblauf z={z} id={id} version={version} katalog={katalog} />}
      {vorschau && !schon && vorschau.update && <LinkUpdate z={z} id={id} vorschau={vorschau} setMeldung={setMeldung} />}
    </div>
  );
}
