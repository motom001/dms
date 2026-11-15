import { Knopf } from '../bausteine';
import { useEffect, useState } from 'react';
import { Symbol } from '../Symbol';
import { betriebApi, type EntfernteSicherung, type EntferntStand, type SicherungEintrag, type SicherungStand } from '../api/betrieb';
import { heikelLaden } from '../verwaltungsmodus';
import { t } from '../sprache';
import { useHandbuch } from '../Hilfe';
import { bytes, zeit } from './sicherungFormat';

/**
 * Entfernte Sicherungen (#976): Sicherungen, die es nur noch außer Haus gibt, stehen mit in der Liste – mit Ort und
 * „Herunterladen“ an derselben Stelle wie lokale. Ablago holt sie dafür über das Paket zurück (Fortschritt oben im
 * Lauf), prüft Größe und Prüfsumme und legt sie lokal ab; danach lädt der Browser sie. Kann das Paket das nicht,
 * steht statt eines Knopfs, wo die Datei liegt, mit Link zur Anleitung.
 */

/** Ort einer entfernten Sicherung: „nur außer Haus (Sicherungsziel WebDAV)“, Adresse im Titel. */
export function EntferntOrt({ e }: { e: EntfernteSicherung }) {
  return <span className="ort-zelle" title={[e.paketName, e.ziel].filter(Boolean).join(' – ')}>{t('werkbank.sicherung.entfernt.nur', { ziel: e.paketName })} <Symbol name="haken" /></span>;
}

/** Zeile einer entfernten Sicherung in derselben Tabelle wie die lokalen. */
export function EntfernteZeile({ e, ortSpalte, gesperrt, holt, hole }: {
  e: EntfernteSicherung; ortSpalte: boolean; gesperrt: boolean; holt: boolean; hole(danach: 'laden' | 'pruefen'): void;
}) {
  const handbuch = useHandbuch();
  const wann = e.beginn ? zeit(e.beginn) : e.name;
  return (
    <tr className="entfernt">
      <td className="sicherung-wahl" />
      <td className="kurz" title={e.name}>{wann}</td>
      <td><span className="leise">{t('werkbank.sicherung.entfernt.art')}</span></td>
      <td className="rechts kurz">{e.groesse !== null ? bytes(e.groesse) : '–'}</td>
      <td>–</td>
      {ortSpalte && <td><EntferntOrt e={e} /></td>}
      <td><span className="leise">–</span></td>
      <td><span className="leise">–</span></td>
      <td className="kurz"><span className="sicherung-aktionen">
        {e.holbar ? <>
          <Knopf art="link" gesperrt={gesperrt && !holt} laeuft={holt} laeuftText={t('werkbank.sicherung.entfernt.holt')} onClick={() => hole('laden')}>{t('werkbank.sicherung.herunterladen')}</Knopf>
          <Knopf art="link" gesperrt={gesperrt} onClick={() => hole('pruefen')}>{t('werkbank.sicherung.pruefen')}</Knopf>
        </> : <>
          <span className="leise klein" title={t(`werkbank.sicherung.entfernt.grund.${e.grund ?? 'kann-nicht'}`)}>{t('werkbank.sicherung.entfernt.selbst', { datei: e.datei })}</span>
          <a href={`${handbuch('admin', 'wiederherstellen/')}#aus-einer-kopie-ausser-haus`} target="_blank" rel="noreferrer" className="verweis">{t('werkbank.sicherung.entfernt.anleitung')}</a>
        </>}
      </span></td>
    </tr>
  );
}

/** Über der Liste: Ziele, deren Liste nicht kam, und „Ziele neu abfragen“. */
export function EntferntKopf({ stand, laden }: { stand: EntferntStand; laden(): Promise<void> }) {
  return (
    <div className="stapel">
      {stand.fehler.map((f) => <p key={f.paket} className="hinweis warn">{t('werkbank.sicherung.entfernt.fehler', { ziel: f.paketName, grund: f.grund })}</p>)}
      <div className="knoepfe">
        <Knopf art="link" symbol="neu-laden" onClick={async () => { await betriebApi.sicherung(true); await laden(); }}>{t('werkbank.sicherung.entfernt.neu')}</Knopf>
      </div>
    </div>
  );
}

/** Lokale und entfernte Sicherungen in einer Liste, nach Zeitpunkt; Spalte „Wo“, sobald es ein Ziel oder einen Stand gibt. */
export function mitEntfernten(s: SicherungStand) {
  const nurEntfernt = s.entfernt?.nur ?? [];
  const lokal = s.liste.map((x) => ({ x, e: null, wann: x.meta?.beginn ?? x.schlank?.beginn ?? x.name }));
  const zeilen: Array<{ x: SicherungEintrag | null; e: EntfernteSicherung | null; wann: string }> = [...lokal, ...nurEntfernt.map((e) => ({ x: null, e, wann: e.beginn ?? e.name }))]
    .sort((a, b) => b.wann.localeCompare(a.wann));
  const ortSpalte = !!s.zustand.extern?.ziele.length || s.liste.some((x) => x.extern) || nurEntfernt.length > 0;
  return { zeilen, nurEntfernt, ortSpalte };
}

/**
 * Zurückholen (#976): Lauf starten (heikel – die Anfrage fragt selbst nach der frischen Anmeldung), am Ende herunterladen
 * bzw. nur prüfen (das Zurückholen prüft Größe und Prüfsumme). `holt`: Name der Sicherung, die gerade kommt.
 */
export function useHolen(s: SicherungStand, laden: () => Promise<void>, fehler: (text: string) => void, geladen: (name: string) => void) {
  const [holt, setHolt] = useState<{ name: string; danach: 'laden' | 'pruefen'; gestartet: string } | null>(null);
  useEffect(() => {
    if (!holt || s.lauf?.gestartet !== holt.gestartet || s.lauf.status === 'laeuft') return;
    setHolt(null);
    if (s.lauf.status === 'fertig' && holt.danach === 'laden' && s.liste.some((x) => x.name === holt.name)) {
      void heikelLaden(betriebApi.sicherungDateiUrl(holt.name)).then((ok) => { if (ok) geladen(holt.name); });
    }
  }, [holt, s.lauf, s.liste, geladen]);
  async function hole(e: { name: string; paket: string }, danach: 'laden' | 'pruefen') {
    try { const l = await betriebApi.sicherungHolen(e.name, e.paket); setHolt({ name: e.name, danach, gestartet: l.gestartet }); await laden(); } catch (x) { fehler((x as Error).message); }
  }
  return { holt: holt?.name ?? null, hole };
}
