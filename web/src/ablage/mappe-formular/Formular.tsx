import { useEffect, useRef, useState } from 'react';
import { registerName } from '../../../../shared/src/beschriftung';
import type { AnsichtsRegister } from '../../../../shared/src/mappenansicht';
import type { Wert } from '../../../../shared/src/model';
import { ersteId } from '../../../../shared/src/folgtaus';
import { ausRoh, werteAusRoh, zuRoh } from '../../werte';
import { Reiter, ReiterFlaeche, Speicherleiste, type Entwurf } from '../../bausteine';
import { geheZu, loeseWache } from '../../ort';
import { t } from '../../sprache';
import { AusDokumentErgebnisse, AusDokumentLeiste } from './AusDokumentTeile';
import { feldHinweise } from './hinweise';
import { verknuepfungsGruppen } from './hilfen';
import { useFormularKern, type FormularProps, type Kern } from './kern';
import { MappenWahlKern, type MappenWahlProps, type NeuesFormular } from './MappenWahl';
import { RegisterInhalt } from './RegisterInhalt';
import { loeschWege, speichernWege } from './speichern';
import { eingabeWege } from './vorbelegen';
import { ausDokumentWege } from './vorschlaege';
import { FensterKopf, KonfliktZeile, Konfliktfrage, PaketHinweisZeile, VorgabeZeile } from './Zeilen';

/**
 * Das Formular einer Mappe (neu, gespeichert, im Fenster „+ … anlegen“ oder auf der Seite „Dokument übernehmen“).
 * Zustand in kern.tsx, Eingaben mit „folgt aus“ und „beim Auswählen übernehmen“ in vorbelegen.ts, „Aus Dokument
 * ausfüllen“ in vorschlaege.ts, Speichern und Löschen in speichern.tsx, die Register in RegisterInhalt.tsx (#1279).
 */
export function Formular(p: FormularProps) {
  const z = useFormularKern(p);
  const { typ, mappe, kopf, vorschlagStart } = p;
  const ein = eingabeWege(z);
  const ad = ausDokumentWege(z, ein.setze);
  // Neue Mappe mit schon gewähltem Verweis (z. B. „+ Neu“ aus der Vertragsart): gleich vorschlagen, einmal beim Öffnen.
  useEffect(() => {
    if (mappe || vorschlagStart || z.nurLesen) return;
    for (const f of typ.felder)
      if (f.typ === 'referenz' && f.vorbelegen?.length && ersteId(ausRoh(f, p.start[f.key]))) void ein.vorbelege(f.key, p.start[f.key]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- nur beim Öffnen einer neuen Mappe
  const neueRunde = useVorschlagStart(z, ad.uebernimmVorschlaege);
  useBrueckeAnschluss(z, ein);
  const hinweisAm = feldHinweise(z, { ...ad, vorbelegungZuruecknehmen: ein.vorbelegungZuruecknehmen });
  const { speichern, konfliktEntscheiden } = speichernWege(z);
  const { loeschFrage, loeschen } = loeschWege(z);
  const ent = entwurf(z, neueRunde);

  return (
    <>
      {kopf?.(werteAusRoh(typ, z.roh), z.bekannt)}
      {/* Gespeicherte Mappe (#1494): „Aus Dokument ausfüllen“ steht im Menü „Mappe“, keine eigene Zeile darüber. */}
      {z.knopf && !mappe && <AusDokumentLeiste z={z} titel={z.knopf} fertig={ad.uebernimmVorschlaege} />}
      <AusDokumentErgebnisse
        z={z}
        neuAnlegen={ad.neuAnlegen}
        alternativeUebernehmen={ad.alternativeUebernehmen}
        vorschlagZuruecknehmen={ad.vorschlagZuruecknehmen}
      />
      <form
        className="blatt mitregistern"
        onSubmit={(e) => {
          e.preventDefault();
          void speichern();
        }}
        noValidate>
        <Kopfzeilen z={z} zeige={(k) => springeZu(z, k)} />
        {/* Register der Mappe: Baustein Reiter (#1210, #1211) – ein aktives Aussehen wie überall. */}
        <Reiter
          id={z.registerId}
          wert={z.reg?.key ?? ''}
          setze={z.setAktiv}
          beschriftung={t('ablage.mappeformular.register')}
          className="mappenreiter"
          anker="mappe.reiter"
          wahlen={z.register.map((r) => ({
            wert: r.key,
            text: registerName(r),
            anzahl: anzahl(z, r),
            fehler: r.art === 'felder' ? z.felderAuf(r).filter((f) => z.fehler?.felder[f.key]).length : 0,
            anker: `mappe.register:${r.key}`,
          }))}
        />
        {z.fehler?.allgemein.length ? (
          <div className="hinweis schlecht">
            <p>{z.fehler.allgemein.join(' ')}</p>
          </div>
        ) : null}
        {z.hinweise.map((h, i) => (
          <div key={i} className={`hinweis ${h.art}`}>
            <p>{h.text}</p>
          </div>
        ))}
        <ReiterFlaeche id={z.registerId} wert={z.reg?.key ?? ''} className="registerinhalt">
          <RegisterInhalt z={z} w={{ setze: ein.setze, hinweisAm, neuesFormular: fensterFormular }} />
        </ReiterFlaeche>
        {z.konflikt && (
          <Konfliktfrage
            konflikt={z.konflikt}
            ich={z.ich.id}
            sendet={z.sendet}
            waehle={(feld, w) => z.setKonflikt((k) => k && { ...k, wahl: { ...k.wahl, [feld]: w } })}
            speichern={konfliktEntscheiden}
            abbrechen={() => {
              z.setKonflikt(undefined);
              z.setMeldung(undefined);
            }}
          />
        )}
        {/* Gemeinsame Speicherleiste (#1210, #1211): „Mappe löschen“ links (Gefahr mit Rückfrage und Grund), „Verwerfen“
          mit Rand, „Mappe speichern“ blau – wie in der Werkbank. Ohne Recht zum Bearbeiten nur Löschen und der Status. */}
        <Speicherleiste
          ent={ent}
          gegenstand={t('ablage.mappeformular.mappe')}
          sendet={z.sendet}
          speicherbar={!!kopf}
          // Neue Post (#1217): „Mappe anlegen“ – passend zur Wahl „Neue Mappe“ unter „Wohin gehört das?“.
          haupttext={
            p.haupttext ?? (!mappe && p.zuordnen ? t('ablage.mappeformular.mappe-anlegen') : t('ablage.mappeformular.mappe-speichern'))
          }
          nurLesen={z.nurLesen}
          anker="mappe.speicherleiste"
          meldung={speicherMeldung(z)}
          loeschen={
            z.loeschenZeigen
              ? {
                  text: t('ablage.mappeformular.mappe-loeschen-2'),
                  rueckfrage: loeschFrage,
                  onClick: loeschen,
                  gesperrt: z.sperreErklaerung,
                }
              : undefined
          }
        />
      </form>
    </>
  );
}

/** Hinweiszeile (#887): ins Register des Felds, Abschnitt auf, hinrollen und den Fokus aufs Feld. */
function springeZu(z: Kern, k: string) {
  const r = z.register.find((x) => x.art === 'felder' && z.felderAuf(x).some((f) => f.key === k));
  if (r) z.setAktiv(r.key);
  z.oeffneAbschnitte([k]);
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`form.mitregistern [data-anker="mappe.feld:${k}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.querySelector<HTMLElement>('input, select, textarea, button, a')?.focus({ preventScroll: true });
  }, 40);
}

/** Hinweiszeilen über den Registern: unpassende Verweise (#887), Hinweise von Paketen (#1034), Vorgabe aus einem Paket (#1038). */
function Kopfzeilen({ z, zeige }: { z: Kern; zeige(k: string): void }) {
  const { typ, mappe, details } = z.p;
  return (
    <>
      {mappe && !z.nurLesen && (
        <KonfliktZeile
          konflikte={(details?.konflikte ?? []).filter(
            (k) => JSON.stringify(z.roh[k.feld] ?? null) === JSON.stringify(z.basisRoh[k.feld] ?? null),
          )}
          felder={typ.felder}
          zeige={zeige}
        />
      )}
      {mappe && <PaketHinweisZeile hinweise={details?.hinweise ?? []} />}
      {mappe && details?.vorgabe && <VorgabeZeile paketName={details.vorgabe.paketName} />}
    </>
  );
}

/** Meldung der Speicherleiste: Ergebnis des Speicherns, „nur lesen“ oder was mit der Post geschieht (#936). */
function speicherMeldung(z: Kern): { art: 'schlecht' | 'info'; text: string } | undefined {
  if (z.meldung) return { art: z.fehler ? 'schlecht' : 'info', text: z.meldung };
  if (z.nurLesen) return { art: 'info', text: t('ablage.mappeformular.nur-lesen-bearbeiten-darfst') };
  if (!z.p.mappe && z.aufloesenHinweis) return { art: 'info', text: z.aufloesenHinweis };
  return undefined;
}

/** Neue Mappe → „Entwurf verwerfen“ zurück zur Liste (im Fenster: schließen); sonst zurück auf den gespeicherten Stand. */
function entwurf(z: Kern, runde: ReturnType<typeof useVorschlagStart>): Entwurf {
  const { mappe, kopf, imFenster, sicht } = z.p;
  return {
    neu: !mappe && (!kopf || !!imFenster),
    geaendert: z.werteGeaendert || z.dokumenteGeaendert || z.danachOffen,
    async verwerfen() {
      if (imFenster) imFenster.abbrechen();
      else if (!mappe && !kopf) {
        loeseWache();
        geheZu(`/ablage/${sicht}`);
      } else verwerfen(z, runde);
    },
    tasten() {},
  };
}

/**
 * Speicherleiste (#1211): „Änderungen verwerfen“ auf den gespeicherten Stand bzw. die Vorschläge aus dem Dokument
 * (Seite „Dokument übernehmen“).
 */
function verwerfen(z: Kern, runde: ReturnType<typeof useVorschlagStart>) {
  z.setKonflikt(undefined);
  z.setRoh(JSON.parse(z.p.vorschlagStart && !z.p.mappe ? z.startJson : z.basis));
  z.setNeueDateien([]);
  z.setEntfernt([]);
  z.setFehler(null);
  z.setMeldung(undefined);
  z.setHinweise([]);
  z.setVorschlaege({});
  z.setAdNeu({});
  z.setAdMeldung(undefined);
  z.setGefolgt({});
  z.setVorbelegt({});
  // Seite „Dokument übernehmen“ (#934): zurück auf die Vorschläge aus dem Dokument.
  if (z.p.vorschlagStart) runde((n) => n + 1);
}

/** Zahl am Register: Notizen, Dokumente (mit neuen, ohne entfernte, ohne Anlagen – #1487) und verknüpfte Mappen. */
function anzahl(z: Kern, r: AnsichtsRegister): number | undefined {
  const { mappe, details, typ } = z.p;
  if (r.art === 'notizen') return mappe ? (details?.notizen?.length ?? 0) : undefined;
  if (r.art === 'dokumente')
    return (
      (details?.dokumente ?? []).filter((x) => x.registerKey === r.key && !x.anlageZu).filter((x) => !z.entfernt.includes(x.id)).length +
      z.neueDateien.filter((n) => n.register === r.key).length
    );
  if (r.art === 'verknuepfungen') return verknuepfungsGruppen(z.d, mappe, typ.id, r, details).reduce((a, g) => a + g.treffer.length, 0);
  return undefined;
}

/**
 * Seite „Dokument übernehmen“ (#934): Vorschläge aus dem Dokument eintragen, sobald sie da sind (und nach „Verwerfen“
 * wieder). Gibt zurück, womit „Verwerfen“ eine neue Runde anstößt.
 */
function useVorschlagStart(z: Kern, uebernimmVorschlaege: ReturnType<typeof ausDokumentWege>['uebernimmVorschlaege']) {
  const [vorschlagRunde, setVorschlagRunde] = useState(0);
  const { vorschlagStart, mappe } = z.p;
  useEffect(() => {
    if (!vorschlagStart) return;
    const werte = uebernimmVorschlaege({ r: vorschlagStart, dateien: [], ablegen: null });
    // Neue Mappe: Die Vorschläge sind der Ausgangsstand – erst eigene Eingaben sind „ungespeichert“ (Blättern ohne Rückfrage).
    if (!mappe) z.setBasis(JSON.stringify({ ...z.roh, ...werte }));
  }, [vorschlagStart, vorschlagRunde]); // eslint-disable-line react-hooks/exhaustive-deps -- Vorschläge nur in einer neuen Runde übernehmen, nicht bei jeder Eingabe
  return setVorschlagRunde;
}

/** Die Brücke setzt Werte vom Dokument und zeigt Felder; über Refs immer mit dem aktuellen Stand. */
function useBrueckeAnschluss(z: Kern, ein: ReturnType<typeof eingabeWege>) {
  const { typ } = z.p;
  const { roh, register, felderAuf, oeffneAbschnitte, geschuetzt, nurLesen, merke, setFehler, bruecke, vorschlaege } = z;
  const { folge, vorbelege } = ein;
  const stand = { roh, register, felderAuf, oeffneAbschnitte, geschuetzt, nurLesen, merke, setFehler, folge, vorbelege, vorschlaege };
  const anschluss = useRef(stand);
  anschluss.current = stand;
  /* eslint-disable react-hooks/exhaustive-deps -- die Brücke liest über anschluss.current immer den aktuellen Stand */
  useEffect(
    () =>
      bruecke?.anschliessen({
        setze(k, wert, bezug) {
          const a = anschluss.current;
          const f = typ.felder.find((x) => x.key === k);
          if (!f || a.nurLesen || a.geschuetzt[k] !== undefined) return;
          if (bezug) a.merke(bezug.id, { titel: bezug.titel, typId: bezug.typId });
          const neu = zuRoh(f, wert);
          const alt = a.roh[k];
          // Mehrfachfelder: dazunehmen statt ersetzen.
          const roh =
            f.mehrfach && Array.isArray(alt) && Array.isArray(neu) ? [...new Set([...(alt as string[]), ...(neu as string[])])] : neu;
          z.setRoh((r) => ({ ...r, [k]: roh }));
          a.setFehler((x) =>
            x && x.felder[k] ? { ...x, felder: Object.fromEntries(Object.entries(x.felder).filter(([y]) => y !== k)) } : x,
          );
          // Folgt aus (#886) und beim Auswählen übernehmen (#1037): wie bei einer Eingabe von Hand.
          void a.folge(k, roh);
          void a.vorbelege(k, roh);
        },
        vorschlagen: (werte, fundstelle) => vorschlagenIn(z, anschluss.current, werte, fundstelle),
        zeige(k) {
          const a = anschluss.current;
          const r = a.register.find((x) => x.art === 'felder' && a.felderAuf(x).some((f) => f.key === k));
          if (r) z.setAktiv(r.key);
          a.oeffneAbschnitte([k]);
          window.setTimeout(
            () =>
              document
                .querySelector(`.spalte.mappe [data-anker="mappe.feld:${k}"]`)
                ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
            30,
          );
        },
      }),
    [bruecke?.anschliessen, typ],
  );
  /* eslint-enable react-hooks/exhaustive-deps */
}

/**
 * Bereich markieren (#1597): Werte als „Vorschlag“ eintragen wie die Erkennung (Etikett am Feld, „Zurücknehmen“), das
 * Register des ersten Felds öffnen. „Rückgängig“ stellt Werte und Vorschläge wie vorher wieder her.
 */
function vorschlagenIn(
  z: Kern,
  a: { roh: Kern['roh']; geschuetzt: Kern['geschuetzt']; nurLesen: boolean; vorschlaege: Kern['vorschlaege'] },
  werte: Array<{ key: string; wert: Wert }>,
  fundstelle: string,
): (() => void) | null {
  const felder = werte.flatMap(({ key, wert }) => {
    const f = z.p.typ.felder.find((x) => x.key === key);
    return f && !a.nurLesen && a.geschuetzt[key] === undefined ? [{ f, wert }] : [];
  });
  if (!felder.length) return null;
  const keys = felder.map((x) => x.f.key);
  const vorherRoh = Object.fromEntries(keys.map((k) => [k, a.roh[k]]));
  const vorherV = Object.fromEntries(keys.map((k) => [k, a.vorschlaege[k]]));
  z.setRoh((r) => ({ ...r, ...Object.fromEntries(felder.map(({ f, wert }) => [f.key, zuRoh(f, wert)])) }));
  z.setVorschlaege((v) => ({
    ...v,
    ...Object.fromEntries(
      felder.map(({ f, wert }) => [
        f.key,
        { wert, sicherheit: 'mittel' as const, fundstelle, art: 'eingetragen' as const, vorher: a.roh[f.key] },
      ]),
    ),
  }));
  const r = z.register.find((x) => x.art === 'felder' && z.felderAuf(x).some((f) => f.key === keys[0]));
  if (r) z.setAktiv(r.key);
  z.oeffneAbschnitte(keys);
  return () => {
    z.setRoh((x) => ({ ...x, ...vorherRoh }));
    z.setVorschlaege((v) => {
      const n = { ...v };
      for (const k of keys) {
        if (vorherV[k]) n[k] = vorherV[k];
        else delete n[k];
      }
      return n;
    });
  };
}

/** Formular einer neuen Mappe im Fenster „+ … anlegen“ (#935) und „+ Neu“ unter einer Tabelle (#1030). */
const fensterFormular: NeuesFormular = (ziel, start, fertig) => (
  <Formular typ={ziel} start={start} sicht={ziel.id} kopf={(w, b) => <FensterKopf typ={ziel} werte={w} bekannt={b} />} imFenster={fertig} />
);

/* ---------- Auswahl verwiesener Mappen (mit Suche statt langer Klappliste) ---------- */

/** Auswahl verwiesener Mappen für andere Seiten (Werkbank, Suche, „Wohin gehört das?“): mit „+ … anlegen“ im Fenster. */
export function MappenWahl(p: Omit<MappenWahlProps, 'neuesFormular'>) {
  return <MappenWahlKern {...p} neuesFormular={fensterFormular} />;
}
