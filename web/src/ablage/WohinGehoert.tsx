import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { feldLabel, registerName, typBeschreibung, typName } from '../../../shared/src/beschriftung';
import type { Einschaetzung, Klassbeleg, Klassifizierung } from '../../../shared/src/klassifizierung';
import { formatiere, istLeer, type Feld, type Mappentyp } from '../../../shared/src/model';
import { mappenApi, type Bezuege, type MappeDetails } from '../api/mappen';
import { Knopf, Mehrfachauswahl, Umschalter } from '../bausteine';
import { useDaten } from '../daten';
import { titelOder } from '../seiten';
import { t } from '../sprache';
import { MappenWahl } from './MappeFormular';

/**
 * „Wohin gehört das?“ auf der Seite „Dokument übernehmen“ (#1217): Zuerst die Wahl im Umschalter – Neue Mappe ·
 * Vorhandene Mappe · Nur erledigen –, darunter nur, was zu dieser Wahl gehört, unten ein Hauptknopf passend zur Wahl.
 * So hebelt nichts unten aus, was oben gewählt ist. Vorschläge stehen als Knöpfe (Chips) ohne Prozent da.
 */

export type Ziel = 'neu' | 'vorhanden' | 'erledigen';

/** Eine vorgeschlagene vorhandene Mappe (aus dem Abgleich, den auch das automatische Zuordnen nutzt). */
export interface MappenVorschlag { id: string; typId: string; titel: string }

/** Höchstens so viele Vorschläge als Chips (Vorgabe Thomas: immer die besten drei). */
const CHIPS = 3;
/** Kurzansicht einer vorhandenen Mappe: so viele gefüllte Felder. */
const KURZ_FELDER = 4;
/** Felder, die sich in einer Zeile nicht sinnvoll zeigen lassen. */
const OHNE_KURZ = new Set(['referenz', 'passwort', 'tabelle', 'zusammengesetzt']);

const kurz = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()} …` : s);
const kurzText = (x: Mappentyp) => kurz(typBeschreibung(x).split(/(?<=[.!?])\s/)[0] ?? '');

/** Kopf mit Umschalter; darunter der Teil zur Wahl. */
export function WohinGehoert({ ziel, setZiel, children }: { ziel: Ziel; setZiel(z: Ziel): void; children: ReactNode }) {
  return (
    <section className="ue-wohin" aria-labelledby="ue-wohin-titel" data-anker="uebernehmen.wohin">
      <div className="ue-wohin-kopf">
        <h2 className="ue-wohin-titel" id="ue-wohin-titel">{t('ablage.uebernehmen.wohin')}</h2>
        <Umschalter wert={ziel} setze={setZiel} beschriftung={t('ablage.uebernehmen.wohin')} anker="uebernehmen.ziel" schmalUntereinander
          wahlen={[
            { wert: 'neu', text: t('ablage.uebernehmen.ziel.neu') },
            { wert: 'vorhanden', text: t('ablage.uebernehmen.ziel.vorhanden') },
            { wert: 'erledigen', text: t('ablage.uebernehmen.ziel.erledigen') },
          ]} />
      </div>
      {children}
    </section>
  );
}

/** Vorschläge als Knöpfe: gewählt mit Haken und `aria-pressed`, ein zweiter Klick wählt ab. */
function Chips({ liste, gewaehlt, waehle }: { liste: Array<{ id: string; text: string }>; gewaehlt?: string; waehle(id: string | null): void }) {
  return (
    <div className="ue-chips" role="group" aria-labelledby="ue-vorschlaege">
      <p className="ue-chips-titel" id="ue-vorschlaege">{t('ablage.uebernehmen.vorschlaege')}</p>
      <div className="ue-chips-liste">
        {liste.map((x) => {
          const an = x.id === gewaehlt;
          return <Knopf key={x.id} className="ue-chip" aria-pressed={an} symbol={an ? 'haken' : undefined} onClick={() => waehle(an ? null : x.id)}>{x.text}</Knopf>;
        })}
      </div>
    </div>
  );
}

/**
 * Neue Mappe: „Mappentyp suchen …“ und die besten drei Typen der Erkennung als Chips – auch bei geringer Sicherheit,
 * ohne Prozent. Ein Typ, der über die Suche gewählt ist, steht gewählt dazu. Darunter, woran Ablago ihn erkennt.
 */
export function NeueMappeWahl({ ziele, zielTyp, klass, waehle }: {
  ziele: Mappentyp[]; zielTyp?: Mappentyp; klass: (Klassifizierung & { bezuege: Bezuege }) | null | undefined; waehle(id: string | null): void;
}) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const such = eingabe.trim().toLocaleLowerCase();
  const liste = ziele.filter((x) => !such || typName(x).toLocaleLowerCase().includes(such) || typBeschreibung(x).toLocaleLowerCase().includes(such));
  const beste = [...(klass?.typen ?? [])].filter((x) => ziele.some((z) => z.id === x.typId)).sort((a, b) => b.sicherheit - a.sicherheit).slice(0, CHIPS).map((x) => x.typId);
  if (zielTyp && !beste.includes(zielTyp.id)) beste.push(zielTyp.id);
  const chips = beste.map((id) => ziele.find((z) => z.id === id)).filter((x): x is Mappentyp => !!x).map((x) => ({ id: x.id, text: typName(x) }));
  const einschaetzung = klass?.typen.find((x) => x.typId === zielTyp?.id);
  const vorgeschlagen = !!klass?.vorschlag && klass.vorschlag.typId === zielTyp?.id;
  return (
    <div className="ue-wahl">
      <Mehrfachauswahl name={t('ablage.uebernehmen.typ-suchen')} eingabeLabel={t('ablage.uebernehmen.typ-suchen')} platzhalter={t('ablage.uebernehmen.typ-suchen')}
        eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen}
        vorschlaege={liste.map((x) => ({ id: x.id, text: <span className="ue-typ"><strong>{typName(x)}</strong>{kurzText(x) && <span className="leise klein"> {kurzText(x)}</span>}</span> }))}
        leerText={ziele.length ? t('ablage.uebernehmen.kein-typ-passt') : t('ablage.uebernehmen.keine-typen')}
        waehle={(id) => { waehle(id); setEingabe(''); setOffen(false); }} gewaehlt={[]} entferne={() => waehle(null)} />
      {klass === undefined && !chips.length
        ? <p className="leise klein">{t('ablage.uebernehmen.erkenne')}</p>
        : chips.length
          ? <Chips liste={chips} gewaehlt={zielTyp?.id} waehle={waehle} />
          : <p className="leise klein">{t('ablage.uebernehmen.kein-typ-vorschlag')}</p>}
      {einschaetzung && <TypBelege e={einschaetzung} vorgeschlagen={vorgeschlagen} bezuege={klass!.bezuege} />}
      {(klass?.wege ?? []).filter((w) => w.hinweis).map((w, i) => <p key={`h${i}`} className="leise klein ue-weg-hinweis">{w.hinweis}</p>)}
    </div>
  );
}

/** Woran Ablago den Typ erkennt (#939): je Weg ein Beleg – Paket mit Begründung und Zitat, Überschrift, wiedergefundene Mappe. */
function TypBelege({ e, vorgeschlagen, bezuege }: { e: Einschaetzung; vorgeschlagen: boolean; bezuege: Bezuege }) {
  const text = (b: Klassbeleg) => {
    switch (b.weg) {
      case 'kern': return t('ablage.uebernehmen.weil', { wort: b.wort ?? '', fundstelle: b.fundstelle ?? '' });
      case 'ki': return t('ablage.uebernehmen.beleg-ki', { paket: b.paket?.name ?? '', begruendung: b.begruendung || t('ablage.uebernehmen.ohne-begruendung') });
      case 'aehnlichkeit': return t('ablage.uebernehmen.beleg-aehnlich', { paket: b.paket?.name ?? '', begruendung: b.begruendung || t('ablage.uebernehmen.ohne-begruendung') });
      case 'abgleich': return t('ablage.uebernehmen.beleg-abgleich', { feld: b.feld ?? '', titel: titelOder(b.mappeId ? bezuege[b.mappeId]?.titel : ''), merkmal: b.merkmal ?? '' });
    }
  };
  return (
    <div className="ue-typbelege leise klein" aria-label={t('ablage.uebernehmen.woran-typ')}>
      <p>{vorgeschlagen ? t('ablage.uebernehmen.vorschlag-sicherheit') : t('ablage.uebernehmen.woran-typ')}</p>
      <ul>{e.belege.map((b, i) => <li key={`${b.weg}:${i}`}>{text(b)}{b.zitat && <> {t('ablage.uebernehmen.beleg-zitat', { zitat: b.zitat })}</>}</li>)}</ul>
    </div>
  );
}

/**
 * Vorhandene Mappe: „Mappe suchen …“ über alle Mappentypen, in die Dokumente passen – ohne vorherige Typwahl; als
 * Chips die Mappen, die die Erkennung im Brief wiedergefunden hat (Absender, Vertrags- oder Kundennummer). Nach der
 * Wahl eine Kurzansicht der Mappe.
 */
export function VorhandeneMappeWahl({ ziele, vorschlaege, wahl, setze, bekannt, merke }: {
  ziele: Mappentyp[]; vorschlaege: MappenVorschlag[] | null; wahl: string; setze(id: string): void;
  bekannt: Bezuege; merke(id: string, b: { titel: string; typId: string }): void;
}) {
  const zieleKey = ziele.map((x) => x.id).join(',');
  // Eine Anfrage über alle Typen (erweiterte Suche ohne Bedingungen); nur Typen, in die Dokumente passen.
  const quelle = useCallback(async (suche: string) => {
    const r = await mappenApi.seite('suche', 0, 30, suche, { link: '' });
    const erlaubt = new Set(zieleKey.split(','));
    return { mappen: r.mappen.filter((m) => erlaubt.has(m.typId)), gesamt: r.gesamt };
  }, [zieleKey]);
  if (!ziele.length) return <p className="leise klein">{t('ablage.uebernehmen.keine-typen')}</p>;
  const chips = (vorschlaege ?? []).map((x) => ({ id: x.id, text: [titelOder(x.titel), typName(ziele.find((z) => z.id === x.typId)!)].join(' · ') }));
  const waehleChip = (id: string | null) => {
    const v = vorschlaege?.find((x) => x.id === id);
    if (v) merke(v.id, { titel: v.titel, typId: v.typId });
    setze(id ?? '');
  };
  return (
    <div className="ue-wahl">
      <MappenWahl id="ue-vorhanden" ziel={ziele[0]} ziele={ziele} mehrfach={false} wert={wahl || undefined} bekannt={bekannt} merke={merke}
        setze={(v) => setze(typeof v === 'string' ? v : '')} ohneAnlegen quelle={quelle}
        platzhalter={t('ablage.uebernehmen.mappe-suchen')} eingabeLabel={t('ablage.uebernehmen.mappe-suchen')} />
      {vorschlaege === null
        ? <p className="leise klein">{t('ablage.uebernehmen.erkenne')}</p>
        : chips.length
          ? <Chips liste={chips} gewaehlt={wahl} waehle={waehleChip} />
          : <p className="leise klein">{t('ablage.uebernehmen.keine-mappe-vorschlag')}</p>}
      {wahl ? <Kurzansicht id={wahl} /> : <p className="leise klein ue-leer">{t('ablage.uebernehmen.erst-mappe-waehlen')}</p>}
    </div>
  );
}

/** Kurzansicht der gewählten Mappe: Typ, Titel, ein paar gefüllte Felder und wohin die Dokumente kommen. */
function Kurzansicht({ id }: { id: string }) {
  const d = useDaten();
  const [x, setX] = useState<MappeDetails | 'fehlt' | null>(null);
  useEffect(() => {
    let aktuell = true;
    setX(null);
    mappenApi.mappe(id).then((r) => aktuell && setX(r), () => aktuell && setX('fehlt'));
    return () => { aktuell = false; };
  }, [id]);
  const typ = x && x !== 'fehlt' ? d.typ(x.mappe.typId) : undefined;
  if (!x || x === 'fehlt' || !typ) return <p className="leise klein">{x === 'fehlt' ? t('ablage.uebernehmen.gibt-es-nicht') : t('ablage.uebernehmen.lade')}</p>;
  const felder = typ.felder.filter((f: Feld) => !OHNE_KURZ.has(f.typ) && !istLeer(x.mappe.werte[f.key])).slice(0, KURZ_FELDER);
  const reg = typ.register.find((r) => r.art === 'dokumente');
  return (
    <div className="ue-kurz" aria-label={titelOder(x.mappe.titel)}>
      <p className="ueber">{typName(typ)}</p>
      <p className="ue-kurz-titel">{titelOder(x.mappe.titel)}</p>
      {felder.length > 0 && <dl className="ue-kurz-felder">{felder.map((f) => (
        <div key={f.key}><dt>{feldLabel(f)}</dt><dd>{formatiere(f, x.mappe.werte[f.key])}</dd></div>
      ))}</dl>}
      {reg && <p className="leise klein">{t('ablage.uebernehmen.kurz-register', { register: registerName(reg), anzahl: x.dokumente.filter((y) => y.registerKey === reg.key).length })}</p>}
      <p className="leise klein">{t('ablage.uebernehmen.vorhanden-aufloesen')}</p>
    </div>
  );
}

/** Nur erledigen: ein Satz, was geschieht. */
export function NurErledigen() {
  return <p className="ue-erledigen">{t('ablage.uebernehmen.nur-erledigen')}</p>;
}

/**
 * Ein Hauptknopf unten (Leitsatz 1), passend zur Wahl: „Zu „…“ legen“ bzw. „Erledigt“; bei „Neue Mappe“ ohne Typ ein
 * blasses „Mappe anlegen“ (Leitsatz 6) – mit Typ übernimmt die Speicherleiste der Mappe.
 */
export function ZielLeiste({ text, tu }: { text: string; tu?: () => Promise<void> }) {
  return (
    <div className="speicherleiste ue-leiste">
      <span className="status" />
      <div className="knoepfe">
        <Knopf art="haupt" gesperrt={!tu} onClick={tu}>{text}</Knopf>
      </div>
    </div>
  );
}
