/**
 * Prüfstand (#1679): Bericht aus einem oder mehreren Läufen – JSON (alles, auch je Dokument) und Markdown (Kennzahlen
 * je Lauf, nach Seltenheit, Form und Absender, je Weg, Ungleichgewicht) mit Vergleich zum letzten Bericht. Verglichen
 * wird je Lauf nur über die Dokument-Ids, die beide Berichte haben; schlechtere Zahlen stehen als Hinweis da.
 */
import { anteil, auswerten, bewerte, WEGE } from './wertung.mjs';

const NAMEN = {
  typ1: 'Mappentyp Platz 1',
  typ3: 'Mappentyp unter den ersten 3',
  vorschlag: 'Vorschlag (über der Schwelle) richtig',
  sicherFalsch: '„sicher“, aber falscher Typ',
  fuellVorn: 'aufgefüllter Typ fälschlich vorn',
  absender: 'Absender Platz 1',
  ziel1: 'Zielmappe Platz 1',
  ziel3: 'Zielmappe unter den ersten 3',
  felder: 'Felder richtig',
};
/** Kennzahlen, bei denen weniger besser ist. */
const WENIGER_BESSER = new Set(['sicherFalsch', 'fuellVorn']);
/** Ab so vielen Prozentpunkten gilt eine Änderung als Hinweis. */
const SPIELRAUM = 0.5;

const zelle = (k) => (k?.von ? `${anteil(k).toFixed(1)} % (${k.ja}/${k.von})` : '–');

/** Kennzahlen eines Laufs, wahlweise nur über bestimmte Ids. */
function kennzahlen(lauf, ids) {
  const erg = ids ? lauf.ergebnisse.filter((e) => ids.has(e.id)) : lauf.ergebnisse;
  return auswerten(erg);
}

/** Vergleich je Lauf (gleicher Name) über gemeinsame Ids; liefert Zeilen und Hinweise auf Verschlechterungen. */
export function vergleiche(neu, alt) {
  const zeilen = [];
  const hinweise = [];
  const dokumente = [];
  for (const [name, lauf] of Object.entries(neu.laeufe)) {
    const vorher = alt?.laeufe?.[name];
    if (!vorher) continue;
    const ids = new Set(lauf.ergebnisse.map((e) => e.id).filter((id) => vorher.ergebnisse.some((x) => x.id === id)));
    const a = kennzahlen(vorher, ids).gesamt;
    const b = kennzahlen(lauf, ids).gesamt;
    for (const k of Object.keys(NAMEN)) {
      if (!a[k]?.von && !b[k]?.von) continue;
      const d = (anteil(b[k]) ?? 0) - (anteil(a[k]) ?? 0);
      const schlechter = WENIGER_BESSER.has(k) ? d > SPIELRAUM : d < -SPIELRAUM;
      zeilen.push({ lauf: name, kennzahl: k, vorher: anteil(a[k]), jetzt: anteil(b[k]), schlechter, ids: ids.size });
      if (schlechter)
        hinweise.push(`${name}: ${NAMEN[k]} schlechter (${anteil(a[k])} % → ${anteil(b[k])} %, ${ids.size} gleiche Dokumente)`);
    }
    const altNach = new Map(vorher.ergebnisse.map((e) => [e.id, bewerte(e)]));
    for (const e of lauf.ergebnisse) {
      const x = altNach.get(e.id);
      if (x?.typ1 && bewerte(e).typ1 === false) dokumente.push(`${name}: ${e.id}`);
    }
  }
  return { zeilen, hinweise, dokumente };
}

function tabelle(kopf, zeilen) {
  return [
    `| ${kopf.join(' | ')} |`,
    `|${kopf.map((_, i) => (i ? '---:' : '---')).join('|')}|`,
    ...zeilen.map((z) => `| ${z.join(' | ')} |`),
  ];
}

function gruppenTabelle(laeufe, gruppe) {
  const werte = [...new Set(laeufe.flatMap(([, l]) => Object.keys(l.k.nach[gruppe])))].sort();
  return tabelle(
    [gruppe, ...laeufe.map(([n]) => n)],
    werte.map((w) => [
      w,
      ...laeufe.map(([, l]) => {
        const g = l.k.nach[gruppe][w];
        return g ? `Typ ${zelle(g.typ1)} · Abs. ${zelle(g.absender)} · Felder ${zelle(g.felder)}` : '–';
      }),
    ]),
  );
}

/** Markdown des Berichts. */
export function markdown(bericht, vergleich) {
  const laeufe = Object.entries(bericht.laeufe).map(([n, l]) => [n, { ...l, k: auswerten(l.ergebnisse) }]);
  const z = [
    `# Prüfstand Erkennung – ${bericht.erstellt.slice(0, 10)}`,
    '',
    `- Satz: ${bericht.satz.name ?? '–'} · Commit \`${bericht.satz.commit || '–'}\` · ${bericht.satz.dokumente} Dokumente`,
    `- Ablago: ${bericht.ablago?.version ?? '–'}${bericht.ablago?.image ? ` (${bericht.ablago.image})` : ''}`,
    `- Pakete: ${(bericht.ablago?.pakete ?? []).map((p) => `${p.id} ${p.version}`).join(', ') || '–'}`,
    '',
    '## Kennzahlen je Lauf',
    '',
    ...tabelle(
      ['Kennzahl', ...laeufe.map(([n]) => n)],
      [
        ['Dokumente gemessen', ...laeufe.map(([, l]) => String(l.k.gesamt.dokumente))],
        ...Object.entries(NAMEN).map(([k, n]) => [n, ...laeufe.map(([, l]) => zelle(l.k.gesamt[k]))]),
        ['ohne Text', ...laeufe.map(([, l]) => String(l.k.ohneText))],
        ['Typ nicht installiert', ...laeufe.map(([, l]) => String(l.k.typFehlt))],
        ['Dauer', ...laeufe.map(([, l]) => `${Math.round((l.dauerS ?? 0) / 60)} min`)],
      ],
    ),
    '',
    `„sicher“ heißt wie in „Wie sicher ist Ablago?“: Sicherheit ab 0,75 (bzw. der Schwelle). Absender zählt nur mit einer Mappe für den Absender, Zielmappe nur, wenn die Mappe vor dem Dokument schon da war.`,
  ];
  const ungl = laeufe.filter(([, l]) => l.auffuellen !== undefined && l.auffuellen !== null);
  if (ungl.length)
    z.push(
      '',
      '## Bei Ungleichgewicht',
      '',
      ...tabelle(
        ['aufgefüllt', 'Typ', 'Platz 1', 'Top 3', 'aufgefüllter Typ fälschlich vorn', '„sicher“, aber falsch'],
        ungl.map(([, l]) => [
          String(l.auffuellen),
          l.fuellTyp ?? '–',
          zelle(l.k.gesamt.typ1),
          zelle(l.k.gesamt.typ3),
          zelle(l.k.gesamt.fuellVorn),
          zelle(l.k.gesamt.sicherFalsch),
        ]),
      ),
    );
  for (const g of ['seltenheit', 'form', 'absender']) z.push('', `## Nach ${g}`, '', ...gruppenTabelle(laeufe, g));
  z.push(
    '',
    '## Je Weg („Wohin gehört das?“)',
    '',
    ...tabelle(
      ['Weg', ...laeufe.map(([n]) => n)],
      WEGE.map((w) => [
        w,
        ...laeufe.map(([, l]) =>
          l.k.wege[w].geliefert
            ? `${l.k.wege[w].geliefert}× · Platz 1 ${zelle(l.k.wege[w].typ1)} · Top 3 ${zelle(l.k.wege[w].typ3)}`
            : 'nichts geliefert',
        ),
      ]),
    ),
  );
  z.push('', '## Vergleich zum letzten Bericht', '');
  if (!vergleich?.zeilen.length) z.push('Kein früherer Bericht mit denselben Läufen.');
  else {
    z.push(...(vergleich.hinweise.length ? vergleich.hinweise.map((h) => `> **Hinweis:** ${h}`) : ['Keine Kennzahl schlechter.']), '');
    z.push(
      ...tabelle(
        ['Lauf', 'Kennzahl', 'vorher', 'jetzt', ''],
        vergleich.zeilen.map((x) => [
          x.lauf,
          NAMEN[x.kennzahl],
          `${x.vorher ?? '–'} %`,
          `${x.jetzt ?? '–'} %`,
          x.schlechter ? 'schlechter' : '',
        ]),
      ),
    );
    if (vergleich.dokumente.length)
      z.push(
        '',
        `Mappentyp vorher auf Platz 1, jetzt nicht: ${vergleich.dokumente.slice(0, 40).join(', ')}${vergleich.dokumente.length > 40 ? ' …' : ''}`,
      );
  }
  const hinweise = [...new Set(laeufe.flatMap(([, l]) => l.hinweise ?? []))];
  if (hinweise.length)
    z.push(
      '',
      '## Hinweise beim Aufbau',
      '',
      ...hinweise.slice(0, 60).map((h) => `- ${h}`),
      ...(hinweise.length > 60 ? [`- … und ${hinweise.length - 60} weitere`] : []),
    );
  return `${z.join('\n')}\n`;
}
