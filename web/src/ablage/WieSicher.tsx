import { useState } from 'react';
import { feldLabel, typName } from '../../../shared/src/beschriftung';
import { merkmalsfelder } from '../../../shared/src/erkennung';
import { SCHWELLE_STANDARD, type Klassbeleg, type Klassifizierung, type Typgrund } from '../../../shared/src/klassifizierung';
import type { Mappentyp } from '../../../shared/src/model';
import type { Bezuege } from '../api/mappen';
import { Aufklapper, HakenFeld } from '../bausteine';
import { useDaten } from '../daten';
import { titelOder } from '../seiten';
import { t } from '../sprache';

/** Ab dieser Sicherheit heißt es „sicher“ (darunter bis zur Schwelle „wahrscheinlich“, darunter „unsicher“). */
const SICHER_AB = 0.75;
const prozent = (x: number) => Math.round(x * 100);

/** Ein Beleg für einen Typ (#939) als Satz: Überschrift, KI, Ähnlichkeit oder wiedergefundene Mappe. */
export function belegText(b: Klassbeleg, bezuege: Bezuege): string {
  switch (b.weg) {
    case 'kern':
      return t('ablage.uebernehmen.weil', { wort: b.wort ?? '', fundstelle: b.fundstelle ?? '' });
    case 'ki':
      return t('ablage.uebernehmen.beleg-ki', {
        paket: b.paket?.name ?? '',
        begruendung: b.begruendung || t('ablage.uebernehmen.ohne-begruendung'),
      });
    case 'aehnlichkeit':
      return t('ablage.uebernehmen.beleg-aehnlich', {
        paket: b.paket?.name ?? '',
        begruendung: b.begruendung || t('ablage.uebernehmen.ohne-begruendung'),
      });
    case 'abgleich':
      return t('ablage.uebernehmen.beleg-abgleich', {
        feld: b.feld ?? '',
        titel: titelOder(b.mappeId ? bezuege[b.mappeId]?.titel : ''),
        merkmal: b.merkmal ?? '',
      });
  }
}

/** Was fehlte bzw. dafür sprach (#1645) als Satz – ohne Fachbegriffe. */
function grundText(g: Typgrund, typ: Mappentyp, typVon: (id: string) => Mappentyp | undefined): string | null {
  switch (g.art) {
    case 'ueberschrift-fehlt':
      return t('ablage.uebernehmen.sicher.ueberschrift-fehlt', { typ: typName(typ) });
    case 'merkmal-fehlt': {
      const ziel = typVon(g.typId);
      if (!ziel) return null;
      const merkmale = merkmalsfelder(ziel)
        .map((x) => feldLabel(x.feld))
        .join(', ');
      return t('ablage.uebernehmen.sicher.merkmal-fehlt', { ziel: typName(ziel), merkmale });
    }
    case 'erkennbar': {
      if (!g.von) return null;
      const anteil = g.gefunden / g.von;
      const schluessel =
        anteil >= 0.5
          ? 'ablage.uebernehmen.sicher.erkennbar-gut'
          : anteil >= 0.25
            ? 'ablage.uebernehmen.sicher.erkennbar-teils'
            : 'ablage.uebernehmen.sicher.erkennbar-kaum';
      return t(schluessel, { gefunden: g.gefunden, von: g.von });
    }
    case 'erkennbar-leer':
      return t('ablage.uebernehmen.sicher.erkennbar-leer');
    case 'aehnlich':
      return t('ablage.uebernehmen.sicher.aehnlich', { anzahl: g.anzahl, typ: typName(typ) });
  }
}

/**
 * „Wie sicher ist Ablago?“ (#1645) unter den Vorschlägen, zugeklappt: die drei besten Mappentypen – und der gewählte,
 * wenn er nicht dabei ist – mit Sicherheit in Worten, auf Wunsch als Zahl mit der Schwelle, dazu je Typ, was dafür
 * sprach und was fehlte. Alles nur an dieser Post; nichts davon steht in einem Protokoll.
 */
export function WieSicher({
  klass,
  zielTyp,
  ziele,
}: {
  klass: Klassifizierung & { bezuege: Bezuege };
  zielTyp?: Mappentyp;
  ziele: Mappentyp[];
}) {
  const d = useDaten();
  const [offen, setOffen] = useState(false);
  const [zahl, setZahl] = useState(false);
  const schwelle = klass.schwelle ?? SCHWELLE_STANDARD;
  const liste = klass.typen.filter((x) => ziele.some((z) => z.id === x.typId));
  const eintraege = [
    ...liste.map((e) => ({ typ: ziele.find((z) => z.id === e.typId)!, e })),
    ...(zielTyp && !liste.some((x) => x.typId === zielTyp.id) ? [{ typ: zielTyp, e: undefined }] : []),
  ];
  if (!eintraege.length) return null;
  const wort = (s: number) =>
    s >= Math.max(SICHER_AB, schwelle)
      ? t('ablage.uebernehmen.sicher.sicher')
      : s >= schwelle
        ? t('ablage.uebernehmen.sicher.wahrscheinlich')
        : t('ablage.uebernehmen.sicher.unsicher');
  return (
    <div className="ue-typbelege leise klein">
      <Aufklapper form="zeile" offen={offen} steuert="ue-wie-sicher" umschalten={() => setOffen(!offen)}>
        {t('ablage.uebernehmen.sicher.titel')}
      </Aufklapper>
      {offen && (
        <div id="ue-wie-sicher">
          <HakenFeld beschriftung={t('ablage.uebernehmen.sicher.als-zahl')}>
            <input type="checkbox" checked={zahl} onChange={(ev) => setZahl(ev.target.checked)} />
          </HakenFeld>
          <ul>
            {eintraege.map(({ typ, e }) => {
              const s = e?.sicherheit ?? 0;
              const gruende = (klass.gruende?.[typ.id] ?? [])
                .map((g) => grundText(g, typ, (id) => d.typ(id)))
                .filter((x): x is string => !!x);
              return (
                <li key={typ.id}>
                  <strong>{typName(typ)}</strong> – {e ? wort(s) : t('ablage.uebernehmen.sicher.kein-hinweis')}
                  {zahl &&
                    ` · ${t(s >= schwelle ? 'ablage.uebernehmen.sicher.zahl-ueber' : 'ablage.uebernehmen.sicher.zahl-unter', {
                      prozent: prozent(s),
                      schwelle: prozent(schwelle),
                    })}`}
                  <ul>
                    {(e?.belege ?? []).map((b, i) => (
                      <li key={`b${i}`}>{belegText(b, klass.bezuege)}</li>
                    ))}
                    {gruende.map((g, i) => (
                      <li key={`g${i}`}>{g}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
