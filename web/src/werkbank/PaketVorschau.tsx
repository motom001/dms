import { HerkunftZeile } from './Herkunft';
import { FEIN_ZIEL } from './uebersicht/Feinabstimmung';
import type { PaketVorschau } from '../api/pakete';
import { ApiFehler } from '../api/anfrage';
import { hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { t as tx, t } from '../sprache';
import { KnopfLink } from '../bausteine';
import { AktionenVorschau } from './PaketAktionen';
import { automatisierungHinweis, AutomatisierungenSchalter, GeaenderteAutomatisierungen } from './PaketAutomatisierungen';
import { MitkommtAufklappen } from './PaketMitkommt';
import { NamenskonfliktHinweis } from './Namenskonflikt';
import { UmbauVorschau } from './PaketUmbau';
import { FremdeMappenVorschau, Herausgeber, SprachVorschau, VorgabenVorschau } from './paket-vorschau/abschnitte';
import {
  Abhaengigkeiten,
  Ablaufvorlagen,
  BeispieleHaken,
  Einleitung,
  EinstellungenHinweis,
  HerausgeberHaken,
  HerkunftBestaetigen,
  HinweisListe,
  LaeuferHinweis,
  SichtenListe,
  TypenListe,
  VorschauKnoepfe,
} from './paket-vorschau/teile';
import { useVorschau, type VorschauAntwort } from './paket-vorschau/zustand';

/** Teile der Vorschau stehen seit #1279 unter paket-vorschau/; diese Datei bleibt die Tür. */
export { Herausgeber, SprachHerkunft } from './paket-vorschau/abschnitte';
export { sicherungVorher, type VorschauAntwort } from './paket-vorschau/zustand';

/**
 * Vorschau eines Pakets vor dem Installieren bzw. Aktualisieren (aus Pakete.tsx, #1168): mit eigenen Knöpfen oder – für
 * „Alle aktualisieren“ – ohne, dann meldet sie ihre Antworten. Dazu Meldungen und der Herausgeber neben dem Namen.
 */

/** Ergebnis einer Aktion mit ggf. Gründen. */
export type Meldung = { art: 'gut' | 'schlecht'; text: string; gruende?: string[] };
export const alsMeldung = (e: unknown): Meldung => ({
  art: 'schlecht',
  text: (e as Error).message,
  gruende: e instanceof ApiFehler ? e.gruende : [],
});

export function MeldungBox({ m }: { m?: Meldung }) {
  return m ? (
    <div className={`hinweis ${m.art}`} role="status">
      <p>{m.text}</p>
      {!!m.gruende?.length && (
        <ul>
          {m.gruende.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
    </div>
  ) : null;
}

/**
 * Vorschau mit Namen, Abhängigkeiten und Beispielen. Bei Paketen außerhalb des offiziellen
 * Katalogs (#189) eine deutliche Warnung, die man ausdrücklich bestätigen muss.
 * Auch im Einrichtungsassistenten und für Sammeldateien (#460, #461): je Paket ein Block, eigene Überschrift
 * und „Auslassen“ statt „Abbrechen“.
 */
export function VorschauBlock({
  v,
  warnung,
  los,
  abbrechen,
  melde,
  ohne = [],
  titel,
  abbrechenText = t('werkbank.pakete.abbrechen'),
  herkunftBestaetigt = false,
}: {
  v: PaketVorschau;
  warnung: string | null;
  titel?: string;
  abbrechenText?: string;
  /** Herkunft schon vorher bestätigt (Sammeldatei): kein zweiter Haken. */
  herkunftBestaetigt?: boolean;
  /** Mit eigenen Knöpfen: Installieren bzw. Aktualisieren und Abbrechen. */
  los?(x: VorschauAntwort): Promise<void>;
  abbrechen?(): void;
  /**
   * Ohne eigene Knöpfe (#1168, „Alle aktualisieren“): meldet die Antworten bei jeder Änderung – null, solange etwas fehlt
   * (Bestätigung, Name, Problem). Die Funktion muss gleich bleiben (useCallback), sonst meldet der Block bei jedem Zeichnen.
   */
  melde?(x: VorschauAntwort | null): void;
  /** Einträge aus `probleme`, die hier nicht zählen (#1168: Abhängigkeit, die dieselbe Runde vorher aktualisiert). */
  ohne?: string[];
}) {
  const z = useVorschau({ v, warnung, herkunftBestaetigt, ohne, melde });
  return (
    <section
      className="blatt"
      aria-label={melde ? t('werkbank.pakete.vorschau-von', { name: v.paket.name }) : t('werkbank.pakete.vorschau')}>
      <h2 className="h3">
        {titel ??
          (v.update
            ? t('werkbank.pakete.update-auf', { version: v.paket.version })
            : t('werkbank.pakete.vorschau-2', { name: v.paket.name, version: v.paket.version }))}
        <Herausgeber wer={v.paket.herausgeber} geprueft={v.paket.herausgeberGeprueft} />
      </h2>
      <HerkunftZeile p={v.pruefung} />
      {/* Was mitkommt (#1047): alles, was das Paket mitbringt; beim Update mit „neu in dieser Version“. */}
      <MitkommtAufklappen m={v.mitkommt} />
      <HerkunftBestaetigen z={z} />
      <LaeuferHinweis v={v} z={z} />
      <FremdeMappenVorschau v={v} />
      <AktionenVorschau aktionen={v.aktionen} update={v.update} />
      <HinweisListe art="schlecht" liste={z.probleme} />
      {/* Über der Grenze von „Was Ablago darf“ (#1562): der Weg dorthin, Erlauben braucht eine frische Anmeldung. */}
      {v.fehlercodes?.includes('darf') && (
        <div className="knoepfe">
          <KnopfLink to="/werkbank#was-ablago-darf" groesse="klein">
            {t('werkbank.darf.erlauben')}
          </KnopfLink>
        </div>
      )}
      <HinweisListe art="info" liste={v.hinweise ?? []} />
      {/* Dienste im Netz (#1635): wer was bekommt – der Moment der Entscheidung –, mit dem Weg zur Feinabstimmung. */}
      <DiensteImNetz d={v.dienste} />
      {v.sprache && <SprachVorschau s={v.sprache} />}
      <EinstellungenHinweis v={v} />
      <Einleitung v={v} umbau={z.umbau.length > 0} />
      <TypenListe v={v} z={z} />
      <SichtenListe v={v} z={z} />
      <VorgabenVorschau v={v} />
      <UmbauVorschau plaene={z.umbau} stand={z.umbauStand} setze={z.setUmbauStand} gesamt={hatGesamt(z.ich)} />
      {z.sicherungFehler && (
        <div className="hinweis schlecht" role="alert">
          <p>{z.sicherungFehler}</p>
        </div>
      )}
      <Abhaengigkeiten v={v} z={z} />
      <BeispieleHaken v={v} z={z} />
      {/* Mitgelieferte Automatisierungen (#1174): Schalter statt Haken – angelegt werden alle, gewählt wird, welche gleich laufen. */}
      {z.neueAutos.length > 0 && (
        <section className="stapel" aria-label={tx('pakete.ablauf.automatisierungen')}>
          <h3>{tx('pakete.ablauf.automatisierungen')}</h3>
          <AutomatisierungenSchalter
            aus={z.ohneAuto}
            setAus={z.setOhneAuto}
            liste={z.neueAutos.map((a) => ({ schluessel: a.schluessel, name: a.name, hinweis: automatisierungHinweis(a, v.mitkommt) }))}
          />
        </section>
      )}
      {v.update && <GeaenderteAutomatisierungen liste={v.automatisierungen ?? []} />}
      <Ablaufvorlagen v={v} />
      <HerausgeberHaken v={v} z={z} />
      {z.konflikt && !!v.namenskonflikte?.length && <NamenskonfliktHinweis liste={v.namenskonflikte} />}
      {los && <VorschauKnoepfe v={v} z={z} los={los} abbrechen={abbrechen} abbrechenText={abbrechenText} />}
    </section>
  );
}

/** Dienste im Netz (#1635): wer was bekommt (Paket mit Netz) und der eine Hinweis beim Paket Gesundheit. */
function DiensteImNetz({ d }: { d: PaketVorschau['dienste'] }) {
  if (!d) return null;
  return (
    <div className="hinweis info">
      {d.satz && <p>{d.satz}</p>}
      {d.gesundheit && <p>{d.gesundheit}</p>}
      <div className="knoepfe">
        <KnopfLink to={FEIN_ZIEL} groesse="klein">
          {t('pakete.ki.zur-feinabstimmung')}
        </KnopfLink>
      </div>
    </div>
  );
}
