import { useState } from 'react';
import { datumText } from '../../../shared/src/archiv';
import { istQrCode } from '../../../shared/src/codes';
import { feldLabel, typName } from '../../../shared/src/beschriftung';
import { merkmalsfelder } from '../../../shared/src/erkennung';
import {
  erkennbarStufe,
  SCHWELLE_STANDARD,
  SICHER_AB,
  type Klassbeleg,
  type Klassifizierung,
  type Typgrund,
} from '../../../shared/src/klassifizierung';
import type { Mappentyp } from '../../../shared/src/model';
import type { Bezuege } from '../api/mappen';
import { Aufklapper, Knopf } from '../bausteine';
import { useDaten } from '../daten';
import { titelOder } from '../seiten';
import { t } from '../sprache';

/** Darunter heißt eine ähnliche Mappe „nur entfernt ähnlich“ (#1672). */
const AEHNLICH_ENTFERNT = 0.65;
const prozent = (x: number) => Math.round(x * 100);

/** Ein Beleg für einen Typ (#939) als Satz: Überschrift, KI, Ähnlichkeit, wiedergefundene Mappe, Absender, „Woran man ihn erkennt“. */
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
    // Code auf dem Dokument (#1728): „Erkannt an QR-Code auf Seite 1 (passt zu „Digitaler Bericht“)“.
    case 'code':
      return codeBeleg(b);
    default:
      // Absender, „Woran man ihn erkennt“, Gelerntes, Auswahlliste.
      return belegNeu(b, bezuege);
  }
}

/** Absender (#1680), „Woran man ihn erkennt“ (#1673), Gelerntes (#1681) und Auswahllisten (#1689) als Satz. */
function belegNeu(b: Klassbeleg, bezuege: Bezuege): string {
  // Eintrag einer Auswahlliste im Text (#1689), z. B. Vertragsart „Versicherung“, erkannt an „Versicherungsschein“.
  if (b.weg === 'auswahl')
    return t('ablage.uebernehmen.beleg-auswahl', {
      feld: b.feld ?? '',
      titel: titelOder(b.mappeId ? bezuege[b.mappeId]?.titel : ''),
      wort: b.wort ?? '',
    });
  if (b.weg === 'erkennbar') return t('ablage.uebernehmen.beleg-erkennbar', { gefunden: b.gefunden ?? 0, von: b.von ?? 0 });
  // Gelernt (#1681): immer beschrieben – wann und aus welcher Mappe.
  if (b.weg === 'gelernt') {
    const datum = datumText((b.gelernt?.am ?? '').slice(0, 10));
    const titel = b.mappeId ? bezuege[b.mappeId]?.titel : '';
    return titel ? t('ablage.uebernehmen.beleg-gelernt', { datum, titel }) : t('ablage.uebernehmen.beleg-gelernt-ohne', { datum });
  }
  const titel = b.mappeId ? bezuege[b.mappeId]?.titel : '';
  return titel
    ? t('ablage.uebernehmen.beleg-absender', { absender: titel, anzahl: b.anzahl ?? 0 })
    : t('ablage.uebernehmen.beleg-absender-ohne', { anzahl: b.anzahl ?? 0 });
}

/** Beleg des Wegs `code` (#1728): Art des Codes (QR-Code oder ein anderer), Seite und das Feld mit dem Muster. */
function codeBeleg(b: Klassbeleg): string {
  const feld = b.feld ?? '';
  if (typeof b.seite !== 'number') return t('ablage.uebernehmen.beleg-code-ohne-seite', { feld });
  return t(istQrCode(b.wort ?? '') ? 'ablage.uebernehmen.beleg-code-qr' : 'ablage.uebernehmen.beleg-code', { seite: b.seite, feld });
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
      const stufe = erkennbarStufe(g.gefunden, g.von);
      if (!stufe) return null;
      const schluessel = {
        gut: 'ablage.uebernehmen.sicher.erkennbar-gut',
        teils: 'ablage.uebernehmen.sicher.erkennbar-teils',
        kaum: 'ablage.uebernehmen.sicher.erkennbar-kaum',
      } as const;
      return t(schluessel[stufe], { gefunden: g.gefunden, von: g.von });
    }
    case 'erkennbar-leer':
      return t('ablage.uebernehmen.sicher.erkennbar-leer');
    case 'aehnlich':
      // Die Nähe, nicht nur die Anzahl (#1672).
      if (g.sehr) return t('ablage.uebernehmen.sicher.aehnlich-sehr', { sehr: g.sehr, anzahl: g.anzahl, typ: typName(typ) });
      if (g.beste !== undefined && g.beste < AEHNLICH_ENTFERNT)
        return t('ablage.uebernehmen.sicher.aehnlich-entfernt', { anzahl: g.anzahl, typ: typName(typ) });
      return t('ablage.uebernehmen.sicher.aehnlich', { anzahl: g.anzahl, typ: typName(typ) });
    case 'ohne-beispiele':
      return t('ablage.uebernehmen.sicher.ohne-beispiele', { typ: typName(typ) });
    case 'gesenkt':
      return t('ablage.uebernehmen.sicher.gesenkt');
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
          <Knopf groesse="klein" aria-pressed={zahl} symbol={zahl ? 'haken' : undefined} onClick={() => setZahl(!zahl)}>
            {t('ablage.uebernehmen.sicher.als-zahl')}
          </Knopf>
          <ul>
            {eintraege.map(({ typ, e }) => {
              const s = e?.sicherheit ?? 0;
              // „Woran man ihn erkennt“ als Beleg (#1673): derselbe Satz nicht noch einmal als Grund.
              const alsBeleg = e?.belege.some((b) => b.weg === 'erkennbar');
              const gruende = (klass.gruende?.[typ.id] ?? [])
                .filter((g) => !(alsBeleg && g.art === 'erkennbar'))
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
