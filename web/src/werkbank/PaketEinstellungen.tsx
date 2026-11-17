import { useEffect, useState } from 'react';
import {
  abschnittsfelder,
  EINTRAG_ID,
  istKernFeld,
  listen,
  type EinstellungFeld,
  type Einstellungsbeschreibung,
  type GeheimStand,
} from '../../../shared/src/paketeinstellungen';
import { Fassungen, Knopf, type KnopfErgebnis } from '../bausteine';
import { ApiFehler } from '../api/anfrage';
import { paketeApi, type PaketEinstellungenStand } from '../api/pakete';
import { rueckfrage } from '../rueckfrage';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { kernBestaetigen, kernWerte, ladeKern, speichereKern, type KernDaten } from './PaketKernfelder';
import { Block, type Werte } from './paket-einstellungen/block';

/** Ein Feld der Einstellungen – auch für den Ablauf beim Installieren (#1279: in paket-einstellungen/eingabe.tsx). */
export { Eingabe } from './paket-einstellungen/eingabe';

/**
 * Werkbank → Pakete → Paket → Einstellungen (#197): Formular aus der Beschreibung im Manifest.
 * Höchstens zwei Ebenen (Abschnitte, Listen). Geheimnisse sieht man nach dem Speichern nie wieder.
 * Dazu die Feldarten des Kerns (#996) – alles, was man an einem Paket einstellen kann, mit einem Speichern.
 */

export const zeit = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–';
/** Die Seite hat keine Sprungleiste: Bereiche stehen fest offen. */
const FEST = { offen: true, umschalten: () => {}, fest: true };

/** Gespeicherte Werte → Formular: Geheimnisse als „behalten“, wenn gesetzt. */
function zumFormular(s: PaketEinstellungenStand): Werte {
  const g = (f: EinstellungFeld, v: unknown) => (f.typ === 'geheim' ? ((v as GeheimStand)?.gesetzt ? { behalten: true } : null) : v);
  const w: Werte = {};
  for (const f of abschnittsfelder(s.beschreibung)) w[f.schluessel] = g(f, s.werte[f.schluessel]);
  for (const l of listen(s.beschreibung)) {
    w[l.schluessel] = ((s.werte[l.schluessel] as Werte[]) ?? []).map((e) =>
      Object.fromEntries([[EINTRAG_ID, e[EINTRAG_ID]], ...l.felder.map((f) => [f.schluessel, g(f, e[f.schluessel])])]),
    );
  }
  return w;
}

/** Feldarten des Kerns in der Beschreibung: Art und Schlüssel des Felds. */
const kernArten = (s: PaketEinstellungenStand) =>
  abschnittsfelder(s.beschreibung)
    .filter(istKernFeld)
    .map((f) => ({ art: f.typ, schluessel: f.schluessel }));
/** Werte der Feldarten unter dem Schlüssel ihres Felds. */
const kernFormular = (s: PaketEinstellungenStand, id: string, d: KernDaten): Werte => {
  const a = kernArten(s);
  const w = kernWerte(
    id,
    d,
    a.map((x) => x.art),
  );
  return Object.fromEntries(a.map((x) => [x.schluessel, w[x.art]]));
};

/**
 * Ungespeicherte Werte je Paket (#1004): „Ausprobieren“ nimmt sie („So würde es mit diesen Einstellungen aussehen“),
 * und zurück im Reiter „Einstellungen“ sind sie noch da. Weg nach Speichern, Verwerfen oder Verlassen der beiden Reiter.
 */
const entwuerfe = new Map<string, Werte>();
export const paketEntwurf = (id: string): Werte | null => entwuerfe.get(id) ?? null;
export const vergissPaketEntwurf = (id: string) => {
  entwuerfe.delete(id);
};

/** Formular: Felder des Manifests und Feldarten des Kerns. */
const formularVon = (s: PaketEinstellungenStand, id: string, d: KernDaten): Werte => ({ ...zumFormular(s), ...kernFormular(s, id, d) });

export function PaketEinstellungen({
  paket,
  gespeichert,
}: {
  paket: Pick<InstalliertesPaket, 'id' | 'name' | 'mappenaktionen'>;
  gespeichert?: () => void;
}) {
  const id = paket.id;
  const [stand, setStand] = useState<PaketEinstellungenStand | null>(null);
  const [kern, setKern] = useState<KernDaten | null>(null);
  const [werte, setWerte] = useState<Werte>({});
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<Meldung>();
  const [laeuft, setLaeuft] = useState(false);
  // Neu aufbauen beim Verwerfen: Geheimnis-Felder merken sich „neu eingeben“ selbst.
  const [runde, setRunde] = useState(0);
  const formular = (s: PaketEinstellungenStand, d: KernDaten) => formularVon(s, id, d);
  const gespeichertWerte = stand && kern ? formular(stand, kern) : null;
  const ent = useEntwurf(gespeichertWerte, werte, {
    aus: !stand || !kern,
    zuruecksetzen: () => {
      if (stand && kern) setWerte(formular(stand, kern));
      setFehler({});
      setMeldung(undefined);
      setRunde((r) => r + 1);
    },
  });
  useEffect(() => {
    let aktuell = true;
    paketeApi
      .paketEinstellungen(id)
      .then(async (s) => {
        const d = await ladeKern(kernArten(s).map((x) => x.art));
        if (aktuell) {
          setStand(s);
          setKern(d);
          setWerte(entwuerfe.get(id) ?? formularVon(s, id, d));
        }
      })
      .catch((e) => aktuell && setMeldung({ art: 'schlecht', text: (e as Error).message }));
    return () => {
      aktuell = false;
    };
  }, [id]);
  // Entwurf merken (#1004), solange etwas ungespeichert ist.
  useEffect(() => {
    if (!stand || !kern) return;
    if (ent.geaendert) entwuerfe.set(id, werte);
    else entwuerfe.delete(id);
  }, [id, werte, ent.geaendert, stand, kern]);
  if (!stand || !kern)
    return meldung ? (
      <div className="hinweis schlecht">
        <p>{meldung.text}</p>
      </div>
    ) : (
      <p className="leise">{t('werkbank.paketeinstellungen.lade')}</p>
    );

  const c = { id, paket, stand, kern, werte, formular, gespeichert, setLaeuft, setMeldung, setFehler, setStand, setKern, setWerte };
  const b = stand.beschreibung;
  return (
    <div className="stapel paketeinstellungen" onKeyDown={ent.tasten}>
      <Fehlend fehlend={stand.fehlend} />
      {meldung && (
        <div className={`hinweis ${meldung.art}`} role="status">
          <p>{meldung.text}</p>
        </div>
      )}
      {b.bloecke.map((blk, i) => (
        <Block
          key={`${runde}-${i}`}
          blk={blk}
          werte={werte}
          setze={setWerte}
          fehler={fehler}
          auswahl={stand.auswahl}
          kern={{ paket, d: kern }}
        />
      ))}
      <Speicherleiste
        ent={ent}
        gegenstand={t('werkbank.paketeinstellungen.einstellungen')}
        sendet={laeuft}
        speicherbar={stand.fehlend.length > 0}
        speichern={() => void speichern(c)}
      />
      <Aktionen id={id} b={b} laeuft={laeuft} laeufer={stand.laeufer} />
      {/* Fassungen (#1006): wer wann welche Einstellung geändert hat; Geheimnisse nur als „geändert“. */}
      <Fassungen
        art="paketeinstellungen"
        eintrag={id}
        stand={JSON.stringify(stand.werte)}
        klappe={FEST}
        nachher={async () => {
          const s = await paketeApi.paketEinstellungen(id);
          setStand(s);
          if (!ent.geaendert) setWerte(formular(s, kern));
        }}
      />
    </div>
  );
}

type Meldung = { art: 'gut' | 'schlecht' | 'info'; text: string };
/** Was Speichern braucht: Stand, Werte und die Setter der Seite. */
type SpeicherKontext = {
  id: string;
  paket: Pick<InstalliertesPaket, 'id' | 'name' | 'mappenaktionen'>;
  stand: PaketEinstellungenStand;
  kern: KernDaten;
  werte: Werte;
  formular(s: PaketEinstellungenStand, d: KernDaten): Werte;
  gespeichert?: () => void;
  setLaeuft(l: boolean): void;
  setMeldung(m?: Meldung): void;
  setFehler(f: Record<string, string>): void;
  setStand(s: PaketEinstellungenStand): void;
  setKern(k: KernDaten): void;
  setWerte(w: Werte): void;
};

/** Speichern (#197, #996): Feldarten des Kerns bestätigen und mit speichern; Dienst-Adressen (#444) erst bestätigen. */
async function speichern(c: SpeicherKontext, adresseBestaetigt = false) {
  const { id, paket, stand, kern, werte, formular, gespeichert, setLaeuft, setMeldung, setFehler, setStand, setKern, setWerte } = c;
  if (!stand || !kern) return;
  // Feldarten des Kerns (#996): ihre Werte unter der Art statt unter dem Schlüssel des Felds.
  const arten = kernArten(stand);
  const nachArt = (w: Werte) => Object.fromEntries(arten.map((x) => [x.art, w[x.schluessel]]));
  const alt = nachArt(formular(stand, kern)),
    neu = nachArt(werte);
  if (!adresseBestaetigt && !(await kernBestaetigen(paket, kern, alt, neu))) return;
  setLaeuft(true);
  setMeldung(undefined);
  setFehler({});
  try {
    const s = await paketeApi.paketEinstellungenSpeichern(id, werte, adresseBestaetigt);
    const k = await speichereKern(paket, arten, kern, alt, neu);
    setStand(s);
    setKern(k.daten);
    if (Object.keys(k.fehler).length) {
      // Was gespeichert ist, übernehmen; die Werte mit Fehler bleiben im Formular.
      setWerte({
        ...formular(s, k.daten),
        ...Object.fromEntries(arten.filter((x) => k.fehler[x.schluessel]).map((x) => [x.schluessel, werte[x.schluessel]])),
      });
      setFehler(k.fehler);
      setMeldung({ art: 'schlecht', text: t('werkbank.paketeinstellungen.nicht-alles-gespeichert') });
      return;
    }
    setWerte(formular(s, k.daten));
    setMeldung({ art: 'gut', text: t('werkbank.paketeinstellungen.gespeichert') });
    gespeichert?.();
  } catch (e) {
    // Dienst-Adresse (#444): erst bestätigen – dorthin schickt das Paket Daten.
    const adresse =
      e instanceof ApiFehler && e.status === 409
        ? (e.details as { adresse?: Array<{ feld: string; wert: string }> } | undefined)?.adresse
        : undefined;
    if (adresse?.length && !adresseBestaetigt) {
      setLaeuft(false);
      if (
        await rueckfrage({
          titel: t('fragen.adresse.titel'),
          text: t('fragen.adresse.text', { adresse: adresse.map((a) => a.wert).join(', ') }),
          ja: t('fragen.adresse.ja'),
        })
      )
        await speichern(c, true);
      return;
    }
    const ff = e instanceof ApiFehler ? (e.details as { felderFehler?: Record<string, string> } | undefined)?.felderFehler : undefined;
    if (ff) setFehler(ff);
    setMeldung({ art: 'schlecht', text: (e as Error).message });
  } finally {
    setLaeuft(false);
  }
}

/** Aktionen des Pakets, z. B. „Verbindung testen“ (#986): Ergebnis und Fehler stehen unter den Knöpfen, nicht oben. */
function Aktionen({ id, b, laeuft, laeufer }: { id: string; b: Einstellungsbeschreibung; laeuft: boolean; laeufer: boolean }) {
  async function aktion(a: { schluessel: string; name: string; bestaetigen?: boolean }): Promise<KnopfErgebnis | undefined> {
    if (
      a.bestaetigen &&
      !(await rueckfrage({
        titel: t('werkbank.paketeinstellungen.jetzt-ausfuehren', { name: a.name }),
        ja: t('werkbank.paketeinstellungen.ausfuehren'),
      }))
    )
      return;
    const r = await paketeApi.paketAktion(id, a.schluessel);
    return { art: r.ok ? 'gut' : 'schlecht', text: r.text };
  }
  if (!b.aktionen.length) return null;
  return (
    <section className="blatt">
      <h2 className="h3">{t('werkbank.paketeinstellungen.aktionen')}</h2>
      {!laeufer && <p className="leise klein">{t('werkbank.paketeinstellungen.pakete-mit-code-laufen')}</p>}
      <div className="knoepfe">
        {b.aktionen.map((a) => (
          <Knopf key={a.schluessel} gesperrt={laeuft} title={a.hilfe} onClick={() => aktion(a)}>
            {a.name}
          </Knopf>
        ))}
      </div>
    </section>
  );
}

/** Pflichtfelder ohne Wert: „Einstellungen nötig“ – erst danach läuft das Paket. */
function Fehlend({ fehlend }: { fehlend: string[] }) {
  if (!fehlend.length) return null;
  return (
    <div className="hinweis warn" role="status">
      <p>
        {tn('werkbank.paketeinstellungen.es-fehlen-erst-danach', {
          b: <strong>{t('werkbank.paketeinstellungen.einstellungen-noetig')}</strong>,
          fehlend: fehlend.join(', '),
        })}
      </p>
    </div>
  );
}
