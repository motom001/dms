import { useEffect, useState } from 'react';
import { mappenApi } from '../../api/mappen';
import { t } from '../../sprache';
import { titelOder } from '../../seiten';
import { Mehrfachauswahl } from '../../ablage/Mehrfachauswahl';
import { formatiere, type Mappe, type Mappentyp } from '../../../../shared/src/model';
import { falte } from '../../../../shared/src/suche';
import { gebietsschema } from '../../../../shared/src/sprache';

/** Steht ein Suchwort nicht im Titel, das erste Feld, in dem es vorkommt („Firma: Muster GmbH“, #667). */
function grundVon(typ: Mappentyp | undefined, m: Mappe, eingabe: string): string | null {
  const woerter = falte(eingabe).split(/\s+/).filter(Boolean);
  if (!typ || !woerter.length || woerter.every((w) => falte(m.titel ?? '').includes(w))) return null;
  for (const f of typ.felder) {
    if (f.typ === 'passwort' || f.typ === 'referenz') continue;
    const text = formatiere(f, m.werte[f.key]);
    if (text && woerter.some((w) => falte(text).includes(w))) return `${f.label}: ${text}`;
  }
  return null;
}

/**
 * Person wählen wie in einem Verweisfeld (#667): gemeinsame Auswahl aus #602, Suche beim Tippen über alle
 * Mappentypen, die eine Person betreffen; je Treffer der Mappentyp und – wenn nicht der Name trifft – das Feld.
 */
export function PersonWahl({ typen, waehle }: { typen: Mappentyp[]; waehle(m: { id: string; typId: string; titel: string }): void }) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const [treffer, setTreffer] = useState<Mappe[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  const ids = typen.map((mappentyp) => mappentyp.id).join(',');
  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    const timer = setTimeout(() => {
      Promise.all(ids.split(',').map((id) => mappenApi.seite(`typ:${id}`, 0, 20, eingabe.trim())))
        .then((r) => {
          if (!aktuell) return;
          setTreffer(r.flatMap((x) => x.mappen).slice(0, 20));
          setGesamt(r.reduce((n, x) => n + x.gesamt, 0));
        })
        .catch(() => aktuell && setTreffer([]));
    }, 200);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [offen, eingabe, ids]);
  const typ = (id: string) => typen.find((mappentyp) => mappentyp.id === id);
  return (
    <Mehrfachauswahl
      id="auskunft-person"
      name={t('werkbank.datenschutz.person')}
      platzhalter={t('werkbank.datenschutz.suchen', { map: typen.map((mappentyp) => mappentyp.name).join(', ') })}
      eingabe={eingabe}
      setEingabe={setEingabe}
      offen={offen}
      setOffen={setOffen}
      vorschlaege={
        treffer === null
          ? null
          : treffer.map((m) => {
              const grund = grundVon(typ(m.typId), m, eingabe);
              return {
                id: m.id,
                text: (
                  <span>
                    {titelOder(m.titel)}{' '}
                    <span className="leise klein">
                      {typ(m.typId)?.name}
                      {grund ? ` · ${grund}` : ''}
                    </span>
                  </span>
                ),
              };
            })
      }
      leerText={eingabe ? t('werkbank.datenschutz.nichts-gefunden') : t('werkbank.datenschutz.noch-keine-mappe-dieser')}
      fuss={
        gesamt > (treffer?.length ?? 0) && (
          <p className="leise klein">
            {t('werkbank.datenschutz.insgesamt-tippe-um-einzugrenzen', { gesamt: gesamt.toLocaleString(gebietsschema()) })}
          </p>
        )
      }
      waehle={(id) => {
        const m = treffer?.find((x) => x.id === id);
        if (m) waehle({ id: m.id, typId: m.typId, titel: m.titel ?? '' });
      }}
      gewaehlt={[]}
      entferne={() => {}}
    />
  );
}
