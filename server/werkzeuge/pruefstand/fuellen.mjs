/**
 * Prüfstand (#1679), Szenario „Ungleichgewicht“ (#1672): vor dem Lauf einen häufigen Typ künstlich auffüllen – so
 * sieht eine echte Ablage aus (z. B. 200 Kontoauszüge, aber nur wenige Verträge). Die aufgefüllten Dokumente sind
 * Abwandlungen der Dokumente dieses Typs aus dem Satz: andere Daten, Beträge, Nummern und Buchungszeilen, gleicher
 * Absender. Sie liegen gleich in Mappen ihres Typs, wie in einer gewachsenen Ablage.
 */
import { readFileSync } from 'node:fs';
import { liesDokument, typKennung } from './satz.mjs';
import { pdfAusZeilen } from './pdf.mjs';

/** Reproduzierbarer Zufall (mulberry32). */
function zufall(saat) {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vorlagen: Dokumente des Typs, häufige zuerst (sonst alle des Typs). */
export function vorlagen(satz, typ) {
  const vom = (satz.alleDokumente ?? satz.dokumente).filter((d) => typKennung(satz, satz.mappen.get(d.erwartung.mappe)?.typ ?? '') === typ);
  const haeufig = vom.filter((d) => d.seltenheit !== 'selten');
  return haeufig.length ? haeufig : vom;
}

const verschiebe = (j, m, t, um) => {
  const d = new Date(Date.UTC(j, m - 1 - um, 1));
  const tage = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, Math.min(t, tage)];
};
const zwei = (n) => String(n).padStart(2, '0');
const betragDe = (x) => {
  const [g, k] = Math.abs(x).toFixed(2).split('.');
  return `${x < 0 ? '−' : ''}${g.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${k}`;
};

/** Daten (TT.MM.JJJJ und JJJJ-MM-TT) um `um` Monate zurück. */
export function datenZurueck(text, um) {
  return text
    .replace(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g, (_, t, m, j) => {
      const [j2, m2, t2] = verschiebe(+j, +m, +t, um);
      return `${zwei(t2)}.${zwei(m2)}.${j2}`;
    })
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, j, m, t) => {
      const [j2, m2, t2] = verschiebe(+j, +m, +t, um);
      return `${j2}-${zwei(m2)}-${zwei(t2)}`;
    });
}

/** Markdown-Text in schlichte Zeilen (Tabellen als Spalten mit Abstand). */
export function zeilenAusMarkdown(md) {
  return md
    .split('\n')
    .filter((z) => !/^\|\s*-{3}/.test(z))
    .map((z) =>
      z.startsWith('|')
        ? z
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim())
            .join('   ')
        : z,
    )
    .map((z) => z.replace(/\*\*|__|^#+\s*/g, '').trimEnd());
}

/**
 * Die i-te Abwandlung einer Vorlage: Zeilen fürs PDF und die Werte der Mappe (Daten verschoben, Nummer neu).
 * `kopf` sind die Briefkopfzeilen (Absender aus organisationen.yaml).
 */
export function abwandlung(vorlage, i, { werte = {}, kopf = [] } = {}) {
  const z = zufall(1000 + i);
  const um = 3 * (i + 1);
  const { text } = liesDokument(readFileSync(vorlage.md, 'utf8'));
  let t = datenZurueck(text, um).replace(/\d{1,3}(?:\.\d{3})*,\d{2}(?= ?€)/g, (b) => {
    const x = Number(b.replace(/\./g, '').replace(',', '.'));
    return betragDe(Math.round(x * (0.5 + z()) * 100) / 100).replace('−', '');
  });
  // Nummern (Feldnamen auf „nummer“, z. B. nummer, vertragsnummer) bekommen eine neue, damit nichts doppelt ist.
  const nummern = Object.values(vorlage.erwartung.felder ?? {}).flatMap((f) =>
    Object.entries(f ?? {})
      .filter(([k, v]) => /nummer$/.test(k) && typeof v === 'string')
      .map(([, v]) => v),
  );
  const neueNummer = `${(i % 12) + 1}/${2024 - Math.floor(i / 4)}`;
  for (const n of nummern) t = t.split(n).join(neueNummer);
  // Buchungszeilen: einige weglassen, die übrigen in neuer Reihenfolge innerhalb der Tabelle.
  const zeilen = zeilenAusMarkdown(t);
  const buchung = (s) => /^\d{2}\.\d{2}\.\d{4}\s/.test(s);
  const behalten = zeilen.filter((s) => !buchung(s) || z() > 0.25);
  const buchungen = behalten.filter(buchung).sort(() => z() - 0.5);
  const fertig = behalten.map((s) => (buchung(s) ? buchungen.shift() : s));
  const w = Object.fromEntries(
    Object.entries(werte).map(([k, v]) => [k, typeof v === 'string' ? (nummern.includes(v) ? neueNummer : datenZurueck(v, um)) : v]),
  );
  return { zeilen: [...kopf, '', ...fertig], werte: w };
}

/** Erstes Dokumentenregister eines Typs (das Hochladen verlangt eins). */
export const dokRegister = (typ) => typ.register?.find((r) => r.art === 'dokumente')?.key ?? '';

/** Briefkopf aus organisationen.yaml. */
function kopfVon(satz, absender) {
  const o = satz.organisationen[absender] ?? {};
  return [
    o.name,
    [o.strasse, o.hausnummer].filter(Boolean).join(' '),
    [o.plz, o.ort].filter(Boolean).join(' '),
    o.iban ? `IBAN ${o.iban}` : '',
  ]
    .filter(Boolean)
    .map(String);
}

/** `anzahl` Mappen des Typs `typ` mit je einer Abwandlung anlegen; liefert die Ids der Dokumente. */
export async function fuelleAuf(api, bau, satz, { typ, anzahl, log = () => {} }) {
  const liste = vorlagen(satz, typ);
  const t = bau.b.typen.get(typ);
  if (!liste.length || !t) throw new Error(`Auffüllen: keine Vorlage oder Typ ${typ} nicht installiert`);
  const doks = [];
  for (let i = 0; i < anzahl; i++) {
    const v = liste[i % liste.length];
    // Verweisziele der Vorlage (z. B. das Konto) gibt es in einer gewachsenen Ablage schon – also jetzt anlegen.
    for (const w of Object.values(satz.mappen.get(v.erwartung.mappe)?.werte ?? {}).flat())
      if (w && typeof w === 'object' && 'beispiel' in w) await bau.legeAn(w.beispiel);
    const { werte } = satz.mappen.has(v.erwartung.mappe) ? bau.werte(v.erwartung.mappe, t) : { werte: {} };
    const a = abwandlung(v, i, { werte, kopf: kopfVon(satz, v.absender) });
    const m = await api.json('POST', '/api/mappen', { body: { typId: t.id, werte: a.werte } });
    bau.namen.set(m.id, `aufgefuellt:${i + 1}`);
    const q = new URLSearchParams({
      name: `aufgefuellt-${String(i + 1).padStart(3, '0')}.pdf`,
      typ: 'application/pdf',
      register: dokRegister(t),
    });
    const r = await api.json('POST', `/api/mappen/${m.id}/dokumente?${q}`, { body: pdfAusZeilen(a.zeilen, { titel: v.titel ?? '' }) });
    doks.push(r?.dokument?.id);
    if ((i + 1) % 25 === 0) log(`aufgefüllt: ${i + 1} von ${anzahl}`);
  }
  return doks.filter(Boolean);
}
