/**
 * Auswertung der Oberflächen-Messung (#1276): Kennzahlen je Ablauf zusammenfassen, mit einem früheren Lauf vergleichen,
 * Ziele und CI-Grenzen prüfen und den Bericht als Markdown schreiben. Ohne Playwright und ohne node:test – die Server-
 * Tests prüfen diese Datei (server/test/oberflaeche-messen.test.ts).
 */

/** Was eine Runde je Ablauf liefert und der Bericht zeigt – in dieser Reihenfolge. */
export const KENNZAHLEN = [
  ['bedienbar', 'bis bedienbar'],
  ['inp', 'INP'],
  ['laengste', 'längste Aufgabe'],
  ['blockiert', 'Blockierzeit'],
];
/** Verglichen werden die Mediane dieser Kennzahlen (p95 aus fünf Runden ist das Maximum – zu zufällig für ein Urteil). */
export const VERGLICHEN = ['bedienbar', 'inp', 'blockiert'];
/** Schwelle für „schlechter als vorher“ (Vorschlag im Issue): mehr als 20 % und mindestens 100 ms. */
export const SCHWELLE = { anteil: 0.2, ms: 100 };
/** Ziele für die normale Messung (ohne Drossel), wie im Issue: bedienbar unter 1 s, INP unter 200 ms. */
export const ZIEL = { bedienbar: 1000, inp: 200 };

/** Quantil nach dem Rang (nearest rank); null-Werte zählen nicht. */
export function quantil(werte, q) {
  const s = werte.filter((w) => typeof w === 'number').sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

/**
 * Kennzahlen einer Runde aus den Rohdaten: lange Aufgaben [Beginn, Dauer] und Eingaben [Dauer, Interaktion].
 * INP (Interaction to Next Paint) ist bei wenigen Eingaben die längste Interaktion; ohne Eingabe null.
 */
export function rundeAuswerten({ dauer, lange = [], ereignisse = [] }) {
  const jeInteraktion = new Map();
  for (const [d, id] of ereignisse) jeInteraktion.set(id, Math.max(jeInteraktion.get(id) ?? 0, d));
  return {
    bedienbar: Math.round(dauer),
    inp: jeInteraktion.size ? Math.round(Math.max(...jeInteraktion.values())) : null,
    laengste: Math.round(Math.max(0, ...lange.map(([, d]) => d))),
    blockiert: Math.round(lange.reduce((s, [, d]) => s + Math.max(0, d - 50), 0)),
  };
}

/** Runden eines Ablaufs (eine Drossel) zusammenfassen: je Kennzahl Median und p95, dazu Anfragen und Server-Zeit. */
export function zusammenfassen(runden) {
  const z = { runden: runden.length };
  for (const [k] of KENNZAHLEN)
    z[k] = {
      median: quantil(
        runden.map((r) => r[k]),
        0.5,
      ),
      p95: quantil(
        runden.map((r) => r[k]),
        0.95,
      ),
    };
  z.anfragen = quantil(
    runden.map((r) => r.anfragen ?? null),
    0.5,
  );
  z.serverMs = quantil(
    runden.map((r) => r.serverMs ?? null),
    0.5,
  );
  z.zeitueberschritten = runden.filter((r) => r.zeitueberschritten).length;
  return z;
}

/**
 * Zwei Messungen desselben Ablaufs (erste und Nachmessung bei Verschlechterung): je Kennzahl die bessere, damit ein
 * Ausreißer des Rechners nicht rot macht; eine echte Bremse ist in beiden.
 */
export function besseresVon(a, b) {
  const z = { ...a, nachgemessen: true, zeitueberschritten: Math.min(a.zeitueberschritten, b.zeitueberschritten) };
  for (const [k] of KENNZAHLEN) {
    const wa = a[k]?.median,
      wb = b[k]?.median;
    if (typeof wb === 'number' && (typeof wa !== 'number' || wb < wa)) z[k] = b[k];
  }
  return z;
}

/**
 * Mit einem früheren Lauf vergleichen: je Ablauf, Drossel und Kennzahl (Median). „schlechter“ ab der Schwelle,
 * „besser“ spiegelbildlich. Abläufe, die es vorher nicht gab, fehlen im Vergleich.
 */
export function vergleichen(jetzt, vorher, schwelle = SCHWELLE) {
  const funde = [];
  if (!vorher?.ergebnisse) return funde;
  for (const [id, a] of Object.entries(jetzt.ergebnisse)) {
    const alt = vorher.ergebnisse[id];
    if (!alt) continue;
    for (const drossel of Object.keys(a.drosseln)) {
      const n = a.drosseln[drossel],
        v = alt.drosseln?.[drossel];
      if (!v) continue;
      for (const k of VERGLICHEN) {
        const wn = n[k]?.median,
          wv = v[k]?.median;
        if (typeof wn !== 'number' || typeof wv !== 'number') continue;
        const diff = wn - wv;
        const art =
          diff > wv * schwelle.anteil && diff >= schwelle.ms
            ? 'schlechter'
            : -diff > wv * schwelle.anteil && -diff >= schwelle.ms
              ? 'besser'
              : null;
        if (art) funde.push({ ablauf: id, name: a.name, drossel: Number(drossel), kennzahl: k, vorher: wv, jetzt: wn, art });
      }
    }
  }
  return funde;
}

/**
 * Ziele (nur ohne Drossel) und CI-Grenzen prüfen. `grenzen`: je Ablauf { "<drossel>": { bedienbar, inp } } in ms –
 * leer bis zum ersten Lauf auf GitHub (dann erster Lauf + 20 %, wie beim Lasttest #563).
 */
export function grenzenPruefen(ergebnis, grenzen = {}) {
  const funde = [];
  for (const [id, a] of Object.entries(ergebnis.ergebnisse)) {
    for (const [drossel, z] of Object.entries(a.drosseln)) {
      const ziel = Number(drossel) === 1 ? ZIEL : {};
      for (const [k, wert] of Object.entries(ziel))
        if ((z[k]?.median ?? 0) > wert)
          funde.push({ ablauf: id, name: a.name, drossel: Number(drossel), kennzahl: k, wert: z[k].median, grenze: wert, art: 'ziel' });
      for (const [k, wert] of Object.entries(grenzen[id]?.[drossel] ?? {}))
        if ((z[k]?.median ?? 0) > wert)
          funde.push({ ablauf: id, name: a.name, drossel: Number(drossel), kennzahl: k, wert: z[k].median, grenze: wert, art: 'grenze' });
      if (z.zeitueberschritten)
        funde.push({
          ablauf: id,
          name: a.name,
          drossel: Number(drossel),
          kennzahl: 'bedienbar',
          wert: z.bedienbar.median,
          grenze: null,
          art: 'zeit',
        });
    }
  }
  return funde;
}

const ms = (w) => (typeof w === 'number' ? w.toLocaleString('de-DE') : '–');
const kennzahlName = (k) => KENNZAHLEN.find(([x]) => x === k)?.[1] ?? k;
const drosselText = (d) => (Number(d) === 1 ? 'normal' : `CPU ${d}× gedrosselt`);

/** Bericht als Markdown: Kopf mit Umgebung, Tabelle je Drossel, dann Vergleich und Grenzen. */
export function bericht(ergebnis, { vergleich = [], pruefung = [], vorher = null } = {}) {
  const z = [
    `## Oberfläche messen (#1276) – Ablago ${ergebnis.ablago ?? '?'}`,
    '',
    `Gemessen ${ergebnis.zeit?.slice(0, 16).replace('T', ' ')} UTC auf: **${ergebnis.geraet}**. ${ergebnis.runden} Runden je Ablauf nach einer zum Aufwärmen; Median und p95 in ms.`,
    `Daten: ${ergebnis.daten ?? '–'}.`,
    '',
    '*bis bedienbar*: vom Klick bzw. Aufruf, bis das Ergebnis zu sehen ist und die Seite wieder auf Eingaben reagiert. *INP*: längste Reaktion auf eine Eingabe (Klick, Taste) bis zum nächsten Bild; „–“: keine Eingabe im Schritt oder alle unter 16 ms. *längste Aufgabe*: längster Block des Browsers (Long Task). *Blockierzeit*: Summe der Anteile über 50 ms. *Anfragen/Server*: Median der Anfragen und ihrer Server-Zeit (Server-Timing) im Schritt.',
  ];
  const drosseln = [...new Set(Object.values(ergebnis.ergebnisse).flatMap((a) => Object.keys(a.drosseln)))].sort((a, b) => a - b);
  for (const d of drosseln) {
    z.push(
      '',
      `### ${drosselText(d)}`,
      '',
      `| Ablauf | ${KENNZAHLEN.map(([, n]) => `${n} Median | p95`).join(' | ')} | Anfragen | Server ms |`,
      `|---|${KENNZAHLEN.map(() => '---:|---:').join('|')}|---:|---:|`,
    );
    for (const a of Object.values(ergebnis.ergebnisse)) {
      const w = a.drosseln[d];
      if (!w) continue;
      const zeit = `${w.nachgemessen ? ' (nachgemessen)' : ''}${w.zeitueberschritten ? ` (${w.zeitueberschritten}× Zeit überschritten)` : ''}`;
      z.push(
        `| ${a.name}${zeit} | ${KENNZAHLEN.map(([k]) => `${ms(w[k]?.median)} | ${ms(w[k]?.p95)}`).join(' | ')} | ${ms(w.anfragen)} | ${ms(w.serverMs)} |`,
      );
    }
  }
  z.push('', '### Vergleich mit dem Vorlauf', '');
  if (!vorher) z.push('Kein Vorlauf zum Vergleichen.');
  else {
    z.push(
      `Vorlauf: Ablago ${vorher.ablago ?? '?'} vom ${vorher.zeit?.slice(0, 10)} auf ${vorher.geraet}${vorher.geraet !== ergebnis.geraet ? ' – **anderes Gerät, nur bedingt vergleichbar**' : ''}. Schwelle: mehr als ${SCHWELLE.anteil * 100} % und mindestens ${SCHWELLE.ms} ms (Median); was darüber lag, wurde einmal nachgemessen, es zählt je Kennzahl der bessere Lauf.`,
      '',
    );
    if (!vergleich.length) z.push('Keine Änderung über der Schwelle.');
    for (const v of vergleich)
      z.push(
        `- ${v.art === 'schlechter' ? '**schlechter**' : 'besser'}: ${v.name}, ${drosselText(v.drossel)}, ${kennzahlName(v.kennzahl)} ${ms(v.vorher)} → ${ms(v.jetzt)} ms`,
      );
  }
  z.push('', '### Ziele und Grenzen', '');
  if (!pruefung.length)
    z.push(`Alle Ziele erreicht (ohne Drossel: bis bedienbar unter ${ms(ZIEL.bedienbar)} ms, INP unter ${ZIEL.inp} ms).`);
  for (const p of pruefung) {
    if (p.art === 'zeit')
      z.push(`- **Zeit überschritten**: ${p.name}, ${drosselText(p.drossel)} – mindestens eine Runde kam nicht ans Ziel.`);
    else
      z.push(
        `- ${p.art === 'grenze' ? '**über der CI-Grenze**' : 'Ziel verfehlt'}: ${p.name}, ${drosselText(p.drossel)}, ${kennzahlName(p.kennzahl)} ${ms(p.wert)} ms (${p.art === 'grenze' ? 'Grenze' : 'Ziel'} ${ms(p.grenze)} ms)`,
      );
  }
  return z.join('\n') + '\n';
}

/** Rot (Exit-Code 1 mit --grenzen)? Bei einer Verschlechterung, einer überschrittenen CI-Grenze oder Zeitüberschreitung. */
export function istRot(vergleich, pruefung) {
  return vergleich.some((v) => v.art === 'schlechter') || pruefung.some((p) => p.art === 'grenze' || p.art === 'zeit');
}
