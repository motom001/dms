import { useState } from 'react';
import { gebietsschema } from '../../../shared/src/sprache';
import { kontoApi } from '../api/konto';
import { useNachladen } from '../nachladen-hook';
import { t } from '../sprache';

const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString(gebietsschema(), { hour: '2-digit', minute: '2-digit' });

/**
 * Oben in der Werkbank, nur im Verwaltungsmodus (#921): „Gerade auch im Verwaltungsmodus: Markus (seit 10:42)“ – wer
 * außer mir gerade verwaltet, damit man sich vor einer Änderung abspricht. Kein Schutz (das ist der Konfliktschutz beim
 * Speichern, #917), keine Aufforderung. Nachgeladen mit dem Baustein von #919 (alle 10–15 s, nur im sichtbaren Tab,
 * zählt nicht als Aktivität). Ruhig: keine Ansage für Screenreader bei jedem Wechsel (kein role="status").
 *
 * Abgrenzung: nicht „schaut gerade die Mappe an“ – Anwesenheit an Mappen ist ein eigenes Thema.
 */
export function GeradeImModus() {
  const [andere, setAndere] = useState<Array<{ name: string; seit: string }>>([]);
  // Liste statt Stand: sie ist kurz und genau das, was angezeigt wird; gemeldet wird nur bei Änderung.
  useNachladen(kontoApi.geradeImModus, setAndere, { nachlauf: false, erstesMelden: true });
  if (!andere.length) return null;
  const namen = andere.map((x) => t('konten.verwaltung.andere.person', { name: x.name, uhrzeit: uhrzeit(x.seit) })).join(', ');
  return <p className="gerade-im-modus klein" id="gerade-im-modus">{t('konten.verwaltung.andere.text', { namen })}</p>;
}
