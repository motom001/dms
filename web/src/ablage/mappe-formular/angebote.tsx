import { useState } from 'react';
import { angebotTexte, type AngebotBeimAusfuellen } from '../../../../shared/src/angebote';
import { istLeer } from '../../../../shared/src/model';
import { ApiFehler } from '../../api/anfrage';
import { werkbankApi, type AngebotsAntwort } from '../../api/werkbank';
import { Knopf, fehlerText } from '../../bausteine';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import { ausRoh, zuRoh, type RohWerte } from '../../werte';
import { Dialog as PaketDialog } from '../PaketAktion';
import type { Kern } from './kern';
import type { FeldVorschlag } from './werte';

/**
 * Angebote von Paketen beim Ausfüllen (#1724): eine Zeile im vorhandenen Hinweis („3 Felder als Vorschlag eingetragen –
 * bitte prüfen“) mit der Frage des Pakets, seinem Namen und einem Knopf. Erst der Klick ruft das Paket; der Knopftext sagt,
 * dass Daten hinausgehen. Schickt das Paket einen Dialog, zeigt Ablago ihn wie bei den Aktionen im Menü „Mappe“ – mit dem
 * Paketnamen im Kopf. Die Werte kommen als Vorschläge mit „zurücknehmen“; von Hand Geändertes gewinnt.
 */
export function AngebotZeile({ z, a }: { z: Kern; a: AngebotBeimAusfuellen }) {
  const { typ, mappe } = z.p;
  const { text, knopf } = angebotTexte(a);
  const [ergebnis, setErgebnis] = useState<{ text: string; fehler?: boolean }>();
  const [dialog, setDialog] = useState<Extract<AngebotsAntwort, { dialog: unknown }>>();
  const abrufen = (e: { lauf?: string; antworten?: Record<string, unknown> } = {}) =>
    werkbankApi.angebotAbrufen(typ.id, a, { ...(mappe ? { mappe: mappe.id } : {}), ...e });
  const verarbeite = (r: AngebotsAntwort) => {
    if ('dialog' in r) return setDialog(r);
    setDialog(undefined);
    const n = uebernimmAngebot(z, r);
    setErgebnis({
      text: n
        ? t('ablage.mappeformular.angebot-eingetragen', { anzahl: n, paket: a.paket.name })
        : (r.hinweis ?? t('ablage.mappeformular.angebot-nichts', { paket: a.paket.name })),
    });
  };
  const fehler = (x: unknown) => {
    setDialog(undefined);
    setErgebnis({ text: fehlerText(x), fehler: true });
  };
  if (ergebnis && !ergebnis.fehler) return <p>{ergebnis.text}</p>;
  return (
    <>
      <p>
        {text}{' '}
        <Knopf groesse="klein" symbol="paket" onClick={() => abrufen().then(verarbeite, fehler)}>
          {knopf}
        </Knopf>{' '}
        <span className="leise">{t('ablage.mappeformular.angebot-von', { paket: a.paket.name })}</span>
      </p>
      {ergebnis?.fehler && <p role="alert">{ergebnis.text}</p>}
      {dialog && (
        <section className="blatt paketdialog" aria-label={t('ablage.paketaktion.von', { paket: a.paket.name })}>
          <p className="paketdialog-kopf">
            <Symbol name="paket" /> {t('ablage.paketaktion.von', { paket: a.paket.name })}
          </p>
          <h2 className="h3">{dialog.dialog.titel || knopf}</h2>
          <PaketDialog
            key={`${dialog.lauf}-${dialog.schritt}`}
            dialog={dialog.dialog}
            absenden={async (antworten) => {
              try {
                verarbeite(await abrufen({ lauf: dialog.lauf, antworten }));
              } catch (x) {
                // Fehlende Pflichtangaben zeigt der Dialog selbst an seinen Feldern.
                if (x instanceof ApiFehler && x.status === 422) throw x;
                fehler(x);
              }
            }}
          />
        </section>
      )}
    </>
  );
}

/**
 * Abgerufene Werte eintragen – je Feld vor den Werten der Erkennung, aber nie über das, was die Person selbst geändert hat:
 * Ein Feld bekommt den Wert, wenn es leer ist oder noch genau den eingetragenen Vorschlag trägt (dann bleibt „zurücknehmen“
 * beim Stand vor allen Vorschlägen). Sonst erscheint der Wert als Alternative. Nicht gelieferte Felder bleiben, wie sie sind.
 */
function uebernimmAngebot(z: Kern, r: Extract<AngebotsAntwort, { vorschlaege: unknown }>): number {
  const { typ } = z.p;
  const neu: Record<string, FeldVorschlag> = {};
  const werte: RohWerte = {};
  for (const [k, v] of Object.entries(r.vorschlaege)) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || z.geschuetzt[k] !== undefined || z.ausgeblendet.has(k)) continue;
    const alt = z.vorschlaege[k];
    const vorschlag = zuRoh(f, v.wert);
    const unberuehrt =
      istLeer(ausRoh(f, z.roh[k])) || (alt?.art === 'eingetragen' && JSON.stringify(z.roh[k]) === JSON.stringify(zuRoh(f, alt.wert)));
    if (unberuehrt) {
      werte[k] = vorschlag;
      neu[k] = { ...v, art: 'eingetragen', vorher: alt?.art === 'eingetragen' ? alt.vorher : z.roh[k] };
    } else if (JSON.stringify(z.roh[k]) !== JSON.stringify(vorschlag)) neu[k] = { ...v, art: 'alternative' };
  }
  for (const [id, b] of Object.entries(r.bezuege)) z.merke(id, b);
  z.setRoh((x) => ({ ...x, ...werte }));
  z.setVorschlaege((x) => ({ ...x, ...neu }));
  // Verweis ohne passende Mappe: der vorhandene Vorschlag „mit diesen Angaben anlegen“ – nur für leere Felder.
  const anlegen = Object.entries(r.neu).filter(([k]) => {
    const f = typ.felder.find((x) => x.key === k);
    return f && !werte[k] && istLeer(ausRoh(f, z.roh[k]));
  });
  if (anlegen.length) z.setAdNeu((x) => ({ ...x, ...Object.fromEntries(anlegen) }));
  z.oeffneAbschnitte(Object.keys(neu));
  return Object.values(neu).filter((x) => x.art === 'eingetragen').length;
}
