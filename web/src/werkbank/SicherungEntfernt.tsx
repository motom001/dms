import { Aufklapper, Knopf, Wahlhaken } from '../bausteine';
import { useEffect, useState } from 'react';
import { Symbol } from '../Symbol';
import { betriebApi, type EntfernteSicherung, type EntferntStand, type SicherungEintrag, type SicherungStand } from '../api/betrieb';
import { heikelLaden } from '../verwaltungsmodus';
import { rueckfrage } from '../rueckfrage';
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
  return (
    <span className="ort-zelle" title={[e.paketName, e.ziel].filter(Boolean).join(' – ')}>
      {t('werkbank.sicherung.entfernt.nur', { ziel: e.paketName })} <Symbol name="haken" />
    </span>
  );
}

/** Zeile einer entfernten Sicherung in derselben Tabelle wie die lokalen. */
export function EntfernteZeile({
  e,
  ortSpalte,
  gesperrt,
  holt,
  hole,
  an,
  waehle,
  ausblenden,
}: {
  e: EntfernteSicherung;
  ortSpalte: boolean;
  gesperrt: boolean;
  holt: boolean;
  hole(danach: 'laden' | 'pruefen'): void;
  /** Mehrfachauswahl (#1320) wie bei den lokalen. */
  an: boolean;
  waehle(an: boolean): void;
  /** „Aus der Liste nehmen“ (#1320) für diese eine. */
  ausblenden(): void;
}) {
  const handbuch = useHandbuch();
  const wann = e.beginn ? zeit(e.beginn) : e.name;
  return (
    <tr className={an ? 'entfernt an' : 'entfernt'}>
      <td className="sicherung-wahl">
        <Wahlhaken an={an} setze={waehle} beschriftung={t('werkbank.sicherung.liste.waehlen', { zeit: wann })} />
      </td>
      <td className="kurz" title={e.name}>
        {wann}
      </td>
      <td>
        <span className="leise">{t('werkbank.sicherung.entfernt.art')}</span>
      </td>
      <td className="rechts kurz">{e.groesse !== null ? bytes(e.groesse) : '–'}</td>
      <td>–</td>
      {ortSpalte && (
        <td>
          <EntferntOrt e={e} />
        </td>
      )}
      <td>
        <span className="leise">–</span>
      </td>
      <td>
        <span className="leise">–</span>
      </td>
      <td className="kurz">
        <span className="sicherung-aktionen">
          {e.holbar ? (
            <>
              <Knopf
                gesperrt={gesperrt && !holt}
                laeuft={holt}
                laeuftText={t('werkbank.sicherung.entfernt.holt')}
                onClick={() => hole('laden')}>
                {t('werkbank.sicherung.herunterladen')}
              </Knopf>
              <Knopf gesperrt={gesperrt} onClick={() => hole('pruefen')}>
                {t('werkbank.sicherung.pruefen')}
              </Knopf>
            </>
          ) : (
            <>
              <span className="leise klein" title={t(`werkbank.sicherung.entfernt.grund.${e.grund ?? 'kann-nicht'}`)}>
                {t('werkbank.sicherung.entfernt.selbst', { datei: e.datei })}
              </span>
              <a
                href={`${handbuch('admin', 'wiederherstellen/')}#aus-einer-kopie-ausser-haus`}
                target="_blank"
                rel="noreferrer"
                className="verweis">
                {t('werkbank.sicherung.entfernt.anleitung')}
              </a>
            </>
          )}
          <Knopf gesperrt={gesperrt} onClick={ausblenden}>
            {t('werkbank.sicherung.ausblenden')}
          </Knopf>
        </span>
      </td>
    </tr>
  );
}

/** Über der Liste: Ziele, deren Liste nicht kam, und „Ziele neu abfragen“. */
export function EntferntKopf({ stand, laden }: { stand: EntferntStand; laden(): Promise<void> }) {
  return (
    <div className="stapel">
      {stand.fehler.map((f) => (
        <p key={f.paket} className="hinweis warn">
          {t('werkbank.sicherung.entfernt.fehler', { ziel: f.paketName, grund: f.grund })}
        </p>
      ))}
      <div className="knoepfe">
        <Knopf
          symbol="neu-laden"
          onClick={async () => {
            await betriebApi.sicherung(true);
            await laden();
          }}>
          {t('werkbank.sicherung.entfernt.neu')}
        </Knopf>
      </div>
    </div>
  );
}

/** Lokale und entfernte Sicherungen in einer Liste, nach Zeitpunkt; Spalte „Wo“, sobald es ein Ziel oder einen Stand gibt. */
export function mitEntfernten(s: SicherungStand) {
  const nurEntfernt = s.entfernt?.nur ?? [];
  const lokal = s.liste.map((x) => ({ x, e: null, wann: x.meta?.beginn ?? x.schlank?.beginn ?? x.name }));
  const zeilen: Array<{ x: SicherungEintrag | null; e: EntfernteSicherung | null; wann: string }> = [
    ...lokal,
    ...nurEntfernt.map((e) => ({ x: null, e, wann: e.beginn ?? e.name })),
  ].sort((a, b) => b.wann.localeCompare(a.wann));
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
      void heikelLaden(betriebApi.sicherungDateiUrl(holt.name)).then((ok) => {
        if (ok) geladen(holt.name);
      });
    }
  }, [holt, s.lauf, s.liste, geladen]);
  async function hole(e: { name: string; paket: string }, danach: 'laden' | 'pruefen') {
    try {
      const l = await betriebApi.sicherungHolen(e.name, e.paket);
      setHolt({ name: e.name, danach, gestartet: l.gestartet });
      await laden();
    } catch (x) {
      fehler((x as Error).message);
    }
  }
  return { holt: holt?.name ?? null, hole };
}

/**
 * „Aus der Liste nehmen“ (#1320): Rückfrage im Aufbau wie beim Löschen (Anzahl, Zeitraum), aber nicht rot – am Ziel
 * wird nichts gelöscht. Liefert true, wenn ausgeblendet.
 */
export async function ausListeNehmen(auswahl: EntfernteSicherung[]): Promise<boolean> {
  const zeiten = auswahl
    .map((e) => e.beginn)
    .filter((x): x is string => !!x)
    .sort();
  const zeitraum = !zeiten.length
    ? ''
    : zeiten.length === 1 || zeiten[0] === zeiten.at(-1)
      ? t('werkbank.sicherung.liste.frage.zeitpunkt', { zeit: zeit(zeiten[0]) })
      : t('werkbank.sicherung.liste.frage.zeitraum', { von: zeit(zeiten[0]), bis: zeit(zeiten.at(-1)!) });
  const ziele = [...new Set(auswahl.map((e) => (e.ziel ? `${e.paketName} (${e.ziel})` : e.paketName)))].join(', ');
  const ok = await rueckfrage({
    titel: t('werkbank.sicherung.ausblenden.titel', { anzahl: auswahl.length }),
    text: `${zeitraum}${t('werkbank.sicherung.ausblenden.text', { ziel: ziele })}`,
    ja: t('werkbank.sicherung.ausblenden'),
  });
  if (!ok) return false;
  await betriebApi.sicherungAusblenden([...new Set(auswahl.map((e) => e.name))]);
  return true;
}

/** „Ausgeblendete (n)“ (#1320): eingeklappt unter der Liste, je Zeile wer, wann und „Wieder zeigen“. */
export function Ausgeblendete({ stand, laden }: { stand: EntferntStand; laden(): Promise<void> }) {
  const [auf, setAuf] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const liste = stand.ausgeblendet ?? [];
  if (!liste.length) return null;
  return (
    <section className="aufklappbereich">
      <Aufklapper offen={auf} steuert="sicherung-ausgeblendet" umschalten={() => setAuf(!auf)}>
        <span>{t('werkbank.sicherung.ausgeblendet.titel', { anzahl: liste.length })}</span>
        <span className="leise klein">{t('werkbank.sicherung.ausgeblendet.unter')}</span>
      </Aufklapper>
      {auf && (
        <ul id="sicherung-ausgeblendet" className="aufklappinhalt akzeptiertliste">
          {liste.map((e) => (
            <li key={`${e.paket}:${e.name}`} className="stapel">
              <p>
                <strong>{e.beginn ? zeit(e.beginn) : e.name}</strong> · <EntferntOrt e={e} />
              </p>
              <p className="leise klein">{t('werkbank.sicherung.ausgeblendet.von', { von: e.von, am: zeit(e.am) })}</p>
              <div className="knoepfe">
                <Knopf
                  onClick={() =>
                    betriebApi
                      .sicherungEinblenden(e.name)
                      .then(laden)
                      .catch((x: Error) => setFehler(x.message))
                  }>
                  {t('werkbank.sicherung.ausgeblendet.zeigen')}
                </Knopf>
              </div>
            </li>
          ))}
          {fehler && (
            <li className="fehlertext klein" role="alert">
              {fehler}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
