import { useRef, useState } from 'react';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import type { TypenExport, TypenImportVorschau } from '../../../shared/src/typendatei';
import { werkbankApi } from '../api/werkbank';
import { ApiFehler } from '../api/anfrage';
import { Etikett, FeldGruppe, Knopf, type KnopfErgebnis } from '../bausteine';
import { useDaten } from '../daten';
import { useHandbuch } from '../Hilfe';
import { t } from '../sprache';
import { paketVonTyp } from './listensuche';

/**
 * Mappentypen als Datei (#1315), Werkbank → Mappentypen → „Als Datei“: eigene Typen exportieren (mit Vorschau, was die
 * Datei enthält) und eine Datei einspielen (Vorschau: neu, vorhanden, was sich ändern würde; Abschwächungen rot, nicht
 * übernommen). Typen aus Paketen bleiben beim Paket und stehen nicht zur Wahl.
 */
export function TypenDatei({ pakete }: { pakete: InstalliertesPaket[] }) {
  const handbuch = useHandbuch();
  return (
    <div className="blatt">
      <h2 className="h3">{t('werkbank.typendatei.titel')}</h2>
      <p className="leise">
        {t('werkbank.typendatei.text')}{' '}
        <a href={`${handbuch('admin', 'mappentypen/')}#als-datei`} target="_blank" rel="noreferrer" className="verweis">
          {t('werkbank.typendatei.handbuch')}
        </a>
      </p>
      <TypenExportieren pakete={pakete} />
      <TypenEinspielen />
    </div>
  );
}

const INHALT = {
  werte: (feld: string) => t('werkbank.typendatei.inhalt.werte', { feld }),
  vorgabe: (feld: string) => t('werkbank.typendatei.inhalt.vorgabe', { feld }),
  vorlage: (feld: string) => (feld ? t('werkbank.typendatei.inhalt.vorlage', { feld }) : t('werkbank.typendatei.inhalt.titel')),
};
const STAND = {
  neu: () => t('werkbank.typendatei.stand.neu'),
  vorhanden: () => t('werkbank.typendatei.stand.vorhanden'),
  gleich: () => t('werkbank.typendatei.stand.gleich'),
};

/** Gründe aus einer Ablehnung des Servers (422 mit `gruende`), sonst die Meldung. */
const gruendeVon = (x: unknown): string[] => {
  const g = x instanceof ApiFehler ? (x.details as { gruende?: unknown } | undefined)?.gruende : undefined;
  return Array.isArray(g) ? g.map(String) : [(x as Error).message];
};

function Liste({ titel, eintraege, art }: { titel: string; eintraege: string[]; art?: 'fehler' }) {
  if (!eintraege.length) return null;
  return (
    <>
      <p className={art === 'fehler' ? 'fehlertext' : 'leise klein'}>{titel}</p>
      <ul className={art === 'fehler' ? 'fehlertext klein' : 'leise klein'}>
        {eintraege.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </>
  );
}

function TypenExportieren({ pakete }: { pakete: InstalliertesPaket[] }) {
  const d = useDaten();
  const eigene = d.typen.filter((x) => !x.system && !paketVonTyp(x, pakete)).sort((a, b) => a.name.localeCompare(b.name));
  const [wahl, setWahl] = useState<string[]>([]);
  const [ergebnis, setErgebnis] = useState<TypenExport | null>(null);
  const umschalten = (id: string, an: boolean) => {
    setErgebnis(null);
    setWahl((w) => (an ? [...w, id] : w.filter((x) => x !== id)));
  };
  const herunterladen = (datei: { name: string; inhalt: string }) => {
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([datei.inhalt], { type: 'application/json' })),
      download: datei.name,
    });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  };
  const v = ergebnis?.vorschau;
  return (
    <section aria-label={t('werkbank.typendatei.export')}>
      <h3 className="h4">{t('werkbank.typendatei.export')}</h3>
      {!eigene.length ? (
        <p className="leise">{t('werkbank.typendatei.keine-eigenen')}</p>
      ) : (
        <FeldGruppe beschriftung={t('werkbank.typendatei.waehlen')}>
          <ul className="stapel">
            {eigene.map((x) => (
              <li key={x.id}>
                <label className="haken">
                  <input type="checkbox" checked={wahl.includes(x.id)} onChange={(e) => umschalten(x.id, e.target.checked)} />
                  <span>{x.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </FeldGruppe>
      )}
      <span className="knoepfe">
        <Knopf
          groesse="klein"
          gesperrt={wahl.length ? undefined : t('werkbank.typendatei.erst-waehlen')}
          onClick={async () => setErgebnis(await werkbankApi.typenExport(wahl))}>
          {t('werkbank.typendatei.vorschau')}
        </Knopf>
        {ergebnis?.datei && (
          <Knopf groesse="klein" art="haupt" symbol="herunterladen" onClick={() => herunterladen(ergebnis.datei!)}>
            {t('werkbank.typendatei.herunterladen')}
          </Knopf>
        )}
      </span>
      {v && (
        <div aria-live="polite">
          <p className="leise klein">{t('werkbank.typendatei.enthaelt')}</p>
          <ul className="klein">
            {v.typen.map((x) => (
              <li key={x.id}>
                <strong>{x.name}</strong> <span className="mono leise">{x.kennung}</span> ·{' '}
                {t('werkbank.typendatei.umfang', { felder: x.felder, register: x.register })}
                {x.inhalte.length > 0 && (
                  <ul>
                    {x.inhalte.map((i) => (
                      <li key={`${i.art}-${i.feld}-${i.text}`}>
                        {INHALT[i.art](i.feld)} <span className="mono">{i.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {v.abhaengigkeiten.length > 0 && (
            <p className="klein">
              {t('werkbank.typendatei.abhaengig', { namen: v.abhaengigkeiten.map((x) => `„${x.name}“`).join(', ') })}{' '}
              <Knopf groesse="klein" onClick={() => v.abhaengigkeiten.forEach((x) => umschalten(x.id, true))}>
                {t('werkbank.typendatei.mitnehmen')}
              </Knopf>
            </p>
          )}
          <Liste titel={t('werkbank.typendatei.hinweise')} eintraege={v.hinweise} />
          <Liste titel={t('werkbank.typendatei.probleme')} eintraege={v.probleme} art="fehler" />
        </div>
      )}
    </section>
  );
}

function TypenEinspielen() {
  const d = useDaten();
  const feld = useRef<HTMLInputElement>(null);
  const [datei, setDatei] = useState<{ name: string; inhalt: string } | null>(null);
  const [vorschau, setVorschau] = useState<TypenImportVorschau | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const lies = async (f: File | undefined) => {
    if (!f) return;
    const inhalt = await f.text();
    setDatei({ name: f.name, inhalt });
    setVorschau(null);
    setFehler([]);
    try {
      setVorschau(await werkbankApi.typenVorschau(inhalt));
    } catch (x) {
      setFehler(gruendeVon(x));
    }
  };
  const einspielen = async (): Promise<KnopfErgebnis> => {
    const r = await werkbankApi.typenEinspielen(datei!.inhalt, vorschau!.sha256);
    setVorschau(null);
    setDatei(null);
    await d.neuLaden();
    return { art: 'gut', text: t('werkbank.typendatei.eingespielt', { neu: r.neu.length, geaendert: r.geaendert.length }) };
  };
  const zuTun = !!vorschau && !vorschau.probleme.length && vorschau.typen.some((x) => x.stand !== 'gleich');
  return (
    <section aria-label={t('werkbank.typendatei.import')}>
      <h3 className="h4">{t('werkbank.typendatei.import')}</h3>
      <input
        ref={feld}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void lies(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <span className="knoepfe">
        <Knopf groesse="klein" symbol="dokument" onClick={() => feld.current?.click()}>
          {t('werkbank.typendatei.datei-waehlen')}
        </Knopf>
        {datei && <span className="leise klein">{datei.name}</span>}
      </span>
      <Liste titel={t('werkbank.typendatei.abgelehnt')} eintraege={fehler} art="fehler" />
      {vorschau && <EinspielVorschau v={vorschau} />}
      {zuTun && (
        <Knopf groesse="klein" art="haupt" onClick={einspielen}>
          {t('werkbank.typendatei.einspielen')}
        </Knopf>
      )}
    </section>
  );
}

function EinspielVorschau({ v }: { v: TypenImportVorschau }) {
  return (
    <div aria-live="polite">
      <ul className="stapel klein">
        {v.typen.map((x) => (
          <li key={x.kennung}>
            <strong>{x.name}</strong> <span className="mono leise">{x.kennung}</span>{' '}
            <Etikett art={x.stand === 'neu' ? 'gut' : x.stand === 'vorhanden' ? 'warn' : 'leise'}>{STAND[x.stand]()}</Etikett>
            {x.aenderungen.length > 0 && (
              <ul>
                {x.aenderungen.map((a) => (
                  <li key={a.text} className={a.abgelehnt ? 'fehlertext' : undefined}>
                    {a.text}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {v.abhaengigkeiten.length > 0 && (
        <p className="leise klein">{t('werkbank.typendatei.braucht', { namen: v.abhaengigkeiten.map((x) => `„${x.name}“`).join(', ') })}</p>
      )}
      <Liste titel={t('werkbank.typendatei.probleme')} eintraege={v.probleme} art="fehler" />
      {!v.probleme.length && <p className="leise klein">{t('werkbank.typendatei.bestaetigen')}</p>}
    </div>
  );
}
