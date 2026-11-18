/**
 * Reiter „Ausprobieren“ (#1004): Datei hochladen und sehen, was das Paket damit tun würde – ohne dass sich in der Ablage
 * etwas ändert. Gleich aufgebaut bei allen Paketen, die im Manifest `code.ausprobieren` nennen. Ausprobiert wird mit
 * den gerade eingetragenen, noch nicht gespeicherten Einstellungen; die Datei bleibt im Browser und im Arbeitsspeicher
 * des Servers und wird danach verworfen.
 */
import { useEffect, useMemo, useState } from 'react';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { dateiartPasst, type ProbeAntwort } from '../../../shared/src/paketreiter';
import { gebietsschema } from '../../../shared/src/sprache';
import { ApiFehler } from '../api/anfrage';
import { paketeApi } from '../api/pakete';
import { Etikett, Feld, Knopf } from '../bausteine';
import { useUngespeichert } from '../ort';
import { t } from '../sprache';
import { paketEntwurf } from './PaketEinstellungen';

/** Datei als Base64 (ohne „data:…,“ davor). */
const alsBase64 = (f: File) =>
  new Promise<string>((ok, nein) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => nein(r.error ?? new Error('Datei'));
    r.readAsDataURL(f);
  });
/** Erzeugte Datei als Adresse im Browser zum Ansehen und Herunterladen. */
const alsAdresse = (d: { typ: string; daten: string }) =>
  URL.createObjectURL(new Blob([Uint8Array.from(atob(d.daten), (c) => c.charCodeAt(0))], { type: d.typ }));

/** Was der Probelauf ergab: Zustand, Dauer und Speicher, Zeilen, Seitenhinweise, erzeugte Dateien. */
function Ergebnis({ e }: { e: ProbeAntwort }) {
  const adressen = useMemo(() => e.dateien.map(alsAdresse), [e]);
  useEffect(
    () => () => {
      for (const a of adressen) URL.revokeObjectURL(a);
    },
    [adressen],
  );
  const s = (Math.round(e.ms / 100) / 10).toLocaleString(gebietsschema());
  return (
    <section className="blatt stapel" aria-labelledby="probe-ergebnis" data-anker="pakete.ausprobieren.ergebnis">
      <h2 className="h3" id="probe-ergebnis">
        {t('pakete.probe.ergebnis')}
      </h2>
      <p>
        {e.ok ? <Etikett art="gut">{t('pakete.probe.ok')}</Etikett> : <Etikett art="schlecht">{t('pakete.probe.fehler')}</Etikett>}{' '}
        <span className="leise klein">{t('pakete.probe.messung', { sekunden: s, mb: e.speicherMB })}</span>
      </p>
      {e.fehler && (
        <p className="fehlertext" role="alert">
          {e.fehler}
        </p>
      )}
      {e.zeilen.length > 0 && (
        <ul className="klein">
          {e.zeilen.map((z, i) => (
            <li key={i}>{z}</li>
          ))}
        </ul>
      )}
      {e.seiten.length > 0 && (
        <ul className="klein" aria-label={t('pakete.probe.seiten')}>
          {e.seiten.map((x, i) => (
            <li key={i}>
              <strong>{t('pakete.probe.seite', { seite: x.seite })}</strong> {x.text}
            </li>
          ))}
        </ul>
      )}
      {e.ok && !e.zeilen.length && !e.seiten.length && !e.dateien.length && <p className="leise">{t('pakete.probe.nichts')}</p>}
      {e.dateien.length > 0 && (
        <ul className="klein">
          {e.dateien.map((d, i) => (
            <li key={i}>
              {d.name} ·{' '}
              <a className="verweis" href={adressen[i]} target="_blank" rel="noreferrer">
                {t('pakete.probe.ansehen')}
              </a>{' '}
              ·{' '}
              <a className="verweis" href={adressen[i]} download={d.name}>
                {t('pakete.probe.herunterladen')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PaketAusprobieren({ inst, zuEinstellungen }: { inst: InstalliertesPaket; zuEinstellungen: () => void }) {
  const pr = inst.laeufer?.reiter?.ausprobieren;
  const [datei, setDatei] = useState<File | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [e, setE] = useState<ProbeAntwort | null>(null);
  const entwurf = paketEntwurf(inst.id);
  // Ungespeicherte Einstellungen bleiben hier offen: Wer den Reiter verlässt (außer zu den Einstellungen), wird gefragt.
  useUngespeichert(!!entwurf);
  if (!pr) return null;
  const passt = !datei || dateiartPasst(pr.dateiarten, datei.type);
  async function los() {
    if (!datei) return;
    setLaeuft(true);
    setFehler('');
    setE(null);
    try {
      setE(
        await paketeApi.paketAusprobieren(inst.id, {
          name: datei.name,
          typ: datei.type,
          daten: await alsBase64(datei),
          werte: paketEntwurf(inst.id),
        }),
      );
    } catch (x) {
      const ff = x instanceof ApiFehler ? (x.details as { felderFehler?: Record<string, string> } | undefined)?.felderFehler : undefined;
      setFehler(ff ? `${(x as Error).message} ${Object.values(ff).join(' ')}` : (x as Error).message);
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <div className="stapel">
      <section className="blatt stapel" aria-labelledby="probe-titel" data-anker="pakete.ausprobieren">
        <h2 className="h3" id="probe-titel">
          {t('pakete.probe.titel')}
        </h2>
        <p className="leise klein">{pr.hilfe ?? t('pakete.probe.text')}</p>
        <p className="klein">
          {entwurf ? (
            <>
              {t('pakete.probe.mit-entwurf')} <Knopf onClick={zuEinstellungen}>{t('pakete.probe.zu-einstellungen')}</Knopf>
            </>
          ) : inst.einstellungen ? (
            t('pakete.probe.mit-gespeicherten')
          ) : null}
        </p>
        <Feld
          beschriftung={t('pakete.probe.datei')}
          hinweis={t('pakete.probe.datei.hinweis', { arten: pr.dateiarten.join(', ') })}
          fehler={passt ? undefined : t('pakete.probe.art-passt-nicht')}>
          {(v) => (
            <input
              {...v}
              type="file"
              accept={pr.dateiarten.join(',')}
              onChange={(x) => {
                setDatei(x.target.files?.[0] ?? null);
                setE(null);
                setFehler('');
              }}
            />
          )}
        </Feld>
        <div className="knoepfe">
          <Knopf art="haupt" gesperrt={!datei || !passt} laeuft={laeuft} onClick={() => void los()}>
            {t('pakete.probe.los')}
          </Knopf>
        </div>
        <p className="leise klein">{t('pakete.probe.verworfen')}</p>
        {fehler && (
          <div className="hinweis schlecht" role="alert">
            <p>{fehler}</p>
          </div>
        )}
      </section>
      {e && <Ergebnis e={e} />}
    </div>
  );
}
