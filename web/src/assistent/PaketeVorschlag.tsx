import { useContext, useEffect, useState } from 'react';
import type { AblaufPlan, Katalog, KatalogStufe } from '../../../shared/src/pakete';
import type { PaketeGrenze } from '../../../shared/src/darf';
import { Knopf } from '../bausteine';
import type { PaketVorschau } from '../api/pakete';
import { einrichtungApi } from '../api/einrichtung';
import { t } from '../sprache';
import { Fragen, PaketApiKontext, type PaketApi, type PaketWahl } from '../werkbank/PaketAblauf';
import { ersterSatz, vorschlag, zielName, type NichtDabei } from './paketwahl';
import type { Sammlung } from './stand';

/**
 * „Diese Pakete richtet Ablago für euch ein“ (#1566) statt der Paketliste: Ablago wählt nach „Was darf Ablago?“, der
 * Nutzung und der Empfehlung im Katalog. Je Paket ein Satz, Ziele im Internet ausdrücklich genannt, ohne Haken. Was die
 * Antwort nicht erlaubt, steht darunter mit einem Satz Grund (#1591). „Weiter“ führt zu den Fragen des Ablaufs (Rechte,
 * Einstellungen, Automatisierungen); „Selbst auswählen“ zeigt den Katalog.
 */

type Plan = AblaufPlan<PaketVorschau>;
interface Lage {
  katalog: Katalog;
  stufen: KatalogStufe[];
  signiert: boolean;
  plan: Plan | null;
  nicht: NichtDabei[];
}

/** Katalog, Einordnung und Plan laden; ein Paket, das im Plan über die Grenze kommt, fällt mit Grund weg (#1591). */
async function ladeVorschlag(pa: PaketApi, s: Sammlung, darf: PaketeGrenze): Promise<Lage> {
  const st = await pa.stand();
  const k = (await pa.katalog()).kataloge.find((x) => x.offiziell);
  if (!k?.katalog) throw new Error(k?.fehler ?? t('werkbank.paketedazuholen.der-katalog-laesst-sich'));
  const einordnung = await einrichtungApi.einrichtungPaketStufen(darf);
  const v = vorschlag(k.katalog, einordnung.pakete, {
    nutzung: s.nutzung,
    organisation: !!s.organisation,
    dms: st.dms,
    installiert: st.installiert,
  });
  const lage: Lage = { katalog: k.katalog, stufen: einordnung.pakete, signiert: einordnung.signiert, plan: null, nicht: [...v.nicht] };
  // Nur aus dem offiziellen, signierten Katalog wählt Ablago selbst.
  if (!einordnung.signiert || !v.ids.length) return lage;
  return { ...lage, ...(await planeOhneZuviel(pa, v.ids, lage)) };
}

/** Plan der Auswahl; kommt eine Abhängigkeit über die Grenze, fallen sie und was sie braucht weg – einmal neu planen. */
async function planeOhneZuviel(pa: PaketApi, ids: string[], lage: Lage): Promise<Pick<Lage, 'plan' | 'nicht'>> {
  const plan = await pa.plan({ pakete: ids });
  const zuviel = plan.pakete.filter((p) => p.vorschau.fehlercodes?.includes('darf'));
  if (!zuviel.length) return { plan, nicht: lage.nicht };
  const weg = new Set(zuviel.flatMap((p) => [p.id, ...p.fuer]));
  const grund = (id: string) => lage.stufen.find((x) => x.id === id)?.grund ?? zuviel.find((x) => x.id === id)?.vorschau.probleme[0] ?? '';
  const nicht = [...lage.nicht, ...plan.pakete.filter((p) => p.gewaehlt && weg.has(p.id)).map((p) => ({ id: p.id, grund: grund(p.id) }))];
  const rest = ids.filter((id) => !weg.has(id));
  return { plan: rest.length ? await pa.plan({ pakete: rest }) : null, nicht };
}

function useVorschlag(s: Sammlung, darf: PaketeGrenze, versuch: number) {
  const pa = useContext(PaketApiKontext);
  const [lage, setLage] = useState<Lage | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => {
    let aktuell = true;
    setFehler(undefined);
    setLage(null);
    ladeVorschlag(pa, s, darf).then(
      (x) => aktuell && setLage(x),
      (e: Error) => aktuell && setFehler(e.message),
    );
    return () => {
      aktuell = false;
    };
  }, [versuch, darf]); // eslint-disable-line react-hooks/exhaustive-deps -- Nutzung und Organisation ändern sich nicht, solange der Schritt offen ist
  return { lage, fehler };
}

/** Ein Paket der Auswahl: Name, ein Satz, Ziele im Internet bzw. wofür es mitkommt. */
function Eintrag({ p, lage, plan }: { p: Plan['pakete'][number]; lage: Lage; plan: Plan }) {
  const kp = lage.katalog.pakete.find((x) => x.id === p.id);
  const st = lage.stufen.find((x) => x.id === p.id);
  const ziele = [...new Set((st?.netz ?? []).map(zielName))];
  return (
    <li>
      <strong>{p.name}</strong>
      {kp?.beschreibung && <span> – {ersterSatz(kp.beschreibung)}</span>}
      {ziele.length > 0 && <span className="klein"> {t('einrichtung.pakete.vorschlag.netz', { ziele: ziele.join(', ') })}</span>}
      {!!st?.adressen.length && <span className="klein"> {t('einrichtung.pakete.vorschlag.adresse')}</span>}
      {!p.gewaehlt && p.fuer.length > 0 && (
        <span className="leise klein">
          {' '}
          {t('einrichtung.pakete.vorschlag.mit', {
            namen: p.fuer.map((id) => plan.pakete.find((x) => x.id === id)?.name ?? id).join(', '),
          })}
        </span>
      )}
    </li>
  );
}

export function PaketeVorschlag({
  s,
  darf,
  selbst,
  sammeln,
  zurueck,
  ueberspringen,
}: {
  s: Sammlung;
  darf: PaketeGrenze;
  selbst(): void;
  sammeln(w: PaketWahl): void;
  zurueck(): void;
  ueberspringen(): void;
}) {
  const [versuch, setVersuch] = useState(0);
  const [fragen, setFragen] = useState<Plan | null>(null);
  const { lage, fehler } = useVorschlag(s, darf, versuch);
  if (fragen)
    return (
      <Fragen
        plan={fragen}
        eingabe={() => ({ pakete: fragen.pakete.filter((p) => p.gewaehlt).map((p) => p.id) })}
        zurueck={() => setFragen(null)}
        neuerPlan={setFragen}
        fertig={() => {}}
        sammeln={sammeln}
        vorgabe={{ beispiele: [], automatisierungenAus: [] }}
        ohneBeispielfrage
      />
    );
  if (fehler)
    return (
      <>
        <div className="hinweis warn" role="status">
          <p>
            <strong>{t('werkbank.paketedazuholen.der-paketkatalog-ist-gerade')}</strong>
          </p>
          <p className="leise klein">{fehler}</p>
        </div>
        <p className="leise">{t('einrichtung.pakete.offline')}</p>
        <div className="knoepfe">
          <Knopf symbol="pfeil-links" onClick={zurueck}>
            {t('einrichtung.zurueck')}
          </Knopf>
          <Knopf onClick={ueberspringen}>{t('werkbank.paketedazuholen.ueberspringen')}</Knopf>
          <Knopf onClick={() => setVersuch((n) => n + 1)}>{t('werkbank.paketedazuholen.nochmal-versuchen')}</Knopf>
        </div>
      </>
    );
  if (!lage) return <p className="leise">{t('einrichtung.pakete.vorschlag.laedt')}</p>;
  const plan = lage.plan;
  return (
    <div className="stapel">
      {!lage.signiert ? (
        <div className="hinweis warn" role="status">
          <p>{t('einrichtung.pakete.vorschlag.unsigniert')}</p>
        </div>
      ) : plan?.pakete.length ? (
        <ul className="liste-einfach" aria-label={t('einrichtung.pakete.vorschlag.titel')}>
          {plan.pakete.map((p) => (
            <Eintrag key={p.schluessel} p={p} lage={lage} plan={plan} />
          ))}
        </ul>
      ) : (
        <p>{t('einrichtung.pakete.vorschlag.keine')}</p>
      )}
      {lage.nicht.length > 0 && (
        <section className="blatt stapel" aria-label={t('einrichtung.pakete.vorschlag.nicht')}>
          <h2 className="h3">{t('einrichtung.pakete.vorschlag.nicht')}</h2>
          <ul className="klein">
            {lage.nicht.map((n) => (
              <li key={n.id}>{n.grund}</li>
            ))}
          </ul>
          <p className="leise klein">{t('einrichtung.pakete.vorschlag.erlauben')}</p>
        </section>
      )}
      <div className="knoepfe">
        <Knopf symbol="pfeil-links" onClick={zurueck}>
          {t('einrichtung.zurueck')}
        </Knopf>
        <Knopf art="haupt" onClick={() => (plan?.pakete.length ? setFragen(plan) : ueberspringen())}>
          {t('einrichtung.weiter')}
        </Knopf>
        <Knopf onClick={selbst}>{t('einrichtung.pakete.selbst')}</Knopf>
        <Knopf onClick={ueberspringen}>{t('werkbank.paketedazuholen.ueberspringen')}</Knopf>
      </div>
    </div>
  );
}
