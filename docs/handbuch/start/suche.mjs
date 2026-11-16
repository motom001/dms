/**
 * Suche über alle Handbücher (#841) – ein Baustein für die Startseite von help.ablago.app und die Seite „nicht
 * gefunden“, online wie in der Hilfe im Programm (/hilfe/). Ohne fremde Bibliothek und ohne Server: Gesucht wird in den
 * Suchverzeichnissen, die mkdocs neben jedes Handbuch legt (<handbuch>/[aktuell/][en/]search/search_index.json) –
 * geladen erst beim ersten Tippen. Fehlt ein Verzeichnis (etwa offline), sucht der Baustein in den übrigen.
 *
 * Der Kern (falten, suchen, Ausschnitt) folgt shared/src/handbuchsuche.ts und listensuche.ts – dieselbe Toleranz wie
 * die Suche im Assistenten: ohne Groß-/Kleinschreibung, Akzente und ß, Umlaut-Umschreibung ae/oe/ue. Der Test
 * shared/test/handbuchstart.test.ts vergleicht beide; wer dort etwas ändert, ändert es hier mit.
 */

/* ---------- Kern (ohne Oberfläche) ---------- */

const falte = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[Œœ]/g, 'oe').replace(/[Łł]/g, 'l').toLowerCase();

/** Text gefaltet und mit Rückweg je Zeichen (von, bis) ins Original. */
export function gefaltet(text) {
  const zeichen = [];
  let i = 0;
  for (const c of text) {
    const n = c.length;
    for (const f of falte(c)) zeichen.push({ c: f, von: i, bis: i + n });
    i += n;
  }
  const aus = [];
  for (let k = 0; k < zeichen.length; k++) {
    const z = zeichen[k];
    const nach = zeichen[k + 1];
    if ((z.c === 'a' || z.c === 'o' || z.c === 'u') && nach?.c === 'e') {
      aus.push({ c: z.c, von: z.von, bis: nach.bis });
      k++;
      continue;
    }
    aus.push(z);
  }
  return { s: aus.map((z) => z.c).join(''), von: aus.map((z) => z.von), bis: aus.map((z) => z.bis) };
}

const faltWort = (w) => gefaltet(w).s;
const suchwoerter = (suche) => suche.trim().split(/\s+/).filter(Boolean).slice(0, 10);

function stellen(text, woerter) {
  const g = gefaltet(text);
  const roh = [];
  for (const w of woerter) {
    if (!w) continue;
    for (let p = g.s.indexOf(w); p >= 0; p = g.s.indexOf(w, p + w.length)) roh.push([g.von[p], g.bis[p + w.length - 1]]);
  }
  roh.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const aus = [];
  for (const s of roh) {
    const letzte = aus[aus.length - 1];
    if (letzte && s[0] <= letzte[1]) letzte[1] = Math.max(letzte[1], s[1]);
    else aus.push([s[0], s[1]]);
  }
  return aus;
}

function zerlege(text, bereiche) {
  const teile = [];
  let p = 0;
  for (const [a, b] of bereiche) {
    if (a > p) teile.push({ text: text.slice(p, a), treffer: false });
    teile.push({ text: text.slice(a, b), treffer: true });
    p = b;
  }
  if (p < text.length) teile.push({ text: text.slice(p), treffer: false });
  return teile;
}

function ausschnitt(text, bereiche, umfeld) {
  const quelle = text.replace(/\s/g, ' ');
  if (quelle.length <= 80 || !bereiche.length) return zerlege(quelle, bereiche);
  const [a, b] = bereiche[0];
  let von = Math.max(0, a - umfeld);
  let bis = Math.min(quelle.length, b + umfeld);
  if (von > 0) {
    const l = quelle.indexOf(' ', von);
    if (l >= 0 && l < a) von = l + 1;
  }
  if (bis < quelle.length) {
    const r = quelle.lastIndexOf(' ', bis);
    if (r >= b) bis = r;
  }
  const innen = bereiche.filter(([x, y]) => x >= von && y <= bis).map(([x, y]) => [x - von, y - von]);
  const teile = zerlege(quelle.slice(von, bis), innen);
  if (von > 0) teile.unshift({ text: '… ', treffer: false });
  if (bis < quelle.length) teile.push({ text: ' …', treffer: false });
  return teile;
}

const ZEICHEN = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** HTML aus dem Suchverzeichnis als schlichter Text. */
export function ohneHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (ganz, name) => {
      if (name[0] === '#') {
        const n = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
      }
      return ZEICHEN[name.toLowerCase()] ?? ganz;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function ersteWorte(text, max = 140) {
  if (text.length <= max) return text;
  const schnitt = text.slice(0, max);
  const grenze = schnitt.lastIndexOf(' ');
  return `${(grenze > max / 2 ? schnitt.slice(0, grenze) : schnitt).trimEnd()} …`;
}

/** Liest ein Suchverzeichnis von mkdocs; Kaputtes fällt still weg. */
export function handbuchVerzeichnis(roh) {
  const docs = roh && typeof roh === 'object' && Array.isArray(roh.docs) ? roh.docs : [];
  const eintraege = docs.flatMap((d) => {
    if (!d || typeof d !== 'object') return [];
    const { location, title, text } = d;
    if (typeof location !== 'string' || typeof title !== 'string' || !title.trim()) return [];
    return [{ adresse: location, titel: ohneHtml(title), text: typeof text === 'string' ? ohneHtml(text) : '' }];
  });
  const seiten = new Map(eintraege.filter((e) => !e.adresse.includes('#')).map((e) => [e.adresse, e.titel]));
  return eintraege.map((e) => {
    const istSeite = !e.adresse.includes('#');
    return { ...e, istSeite, seite: istSeite ? e.titel : (seiten.get(e.adresse.split('#')[0]) ?? '') };
  });
}

/**
 * Sucht in mehreren Handbüchern (`[{ handbuch, abschnitte }]`): jedes Suchwort muss im Titel oder Text vorkommen.
 * Treffer im Titel zuerst, dann die übrigen – je Gruppe in der Reihenfolge der Handbücher. Höchstens `max`.
 */
export function sucheInHandbuechern(verzeichnisse, suche, max = 10) {
  const formen = suchwoerter(suche).map(faltWort).filter(Boolean);
  if (!formen.length) return [];
  const imTitel = [];
  const sonst = [];
  for (const { handbuch, abschnitte } of verzeichnisse) {
    for (const a of abschnitte) {
      const t = gefaltet(a.titel).s;
      const x = gefaltet(a.text).s;
      if (!formen.every((w) => t.includes(w) || x.includes(w))) continue;
      const titelTreffer = formen.some((w) => t.includes(w));
      const imText = formen.some((w) => x.includes(w));
      const treffer = {
        handbuch,
        abschnitt: a,
        ...(titelTreffer ? { titel: zerlege(a.titel, stellen(a.titel, formen)) } : {}),
        ausschnitt: imText ? ausschnitt(a.text, stellen(a.text, formen), 48) : [{ text: ersteWorte(a.text), treffer: false }],
      };
      (titelTreffer ? imTitel : sonst).push(treffer);
    }
  }
  return [...imTitel, ...sonst].slice(0, max);
}

/* ---------- Oberfläche ---------- */

const HANDBUECHER = ['benutzer', 'installieren', 'admin', 'entwickler'];

const TEXTE = {
  de: {
    feld: 'In allen Handbüchern suchen',
    platzhalter: 'z. B. Sicherung, Post ablegen, Synology',
    laedt: 'Suche wird geladen …',
    keine: 'Nichts gefunden. Versuch es mit einem anderen Wort.',
    eins: '1 Treffer',
    mehr: '{n} Treffer',
    nichtDa: 'Die Suche ist gerade nicht erreichbar.',
    namen: { benutzer: 'Benutzerhandbuch', installieren: 'Installieren', admin: 'Administratorhandbuch', entwickler: 'Entwicklerhandbuch' },
  },
  en: {
    feld: 'Search all manuals',
    platzhalter: 'e.g. backup, filing post, Synology',
    laedt: 'Loading search …',
    keine: 'Nothing found. Try another word.',
    eins: '1 result',
    mehr: '{n} results',
    nichtDa: 'Search is not available right now.',
    namen: { benutzer: 'User manual', installieren: 'Installing', admin: 'Administrator manual', entwickler: 'Developer manual' },
  },
};

/** Die Wurzel der Hilfe: das Verzeichnis dieses Moduls (help.ablago.app/ bzw. /hilfe/). */
const WURZEL = new URL('./', import.meta.url);

/**
 * Baut die Suche in `ort` (ein leeres Element). `ordner`: „aktuell/“ online, „“ in der Hilfe im Programm;
 * `sprache`: „de“ oder „en“; `fokus`: das Feld beim Laden fokussieren.
 */
export function starteSuche(ort, { ordner = 'aktuell/', sprache = 'de', fokus = false } = {}) {
  const tx = TEXTE[sprache] ?? TEXTE.de;
  const unter = sprache === 'de' ? '' : `${sprache}/`;
  const id = `hs-${Math.random().toString(36).slice(2, 8)}`;
  ort.classList.add('handbuchsuche');
  ort.innerHTML = '';
  const form = document.createElement('form');
  form.setAttribute('role', 'search');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ergebnisse.querySelector('a')?.focus();
  });
  const label = document.createElement('label');
  label.htmlFor = `${id}-feld`;
  label.textContent = tx.feld;
  const feld = document.createElement('input');
  Object.assign(feld, { type: 'search', id: `${id}-feld`, placeholder: tx.platzhalter, autocomplete: 'off', spellcheck: false });
  feld.setAttribute('aria-describedby', `${id}-stand`);
  feld.setAttribute('aria-controls', `${id}-liste`);
  const stand = document.createElement('p');
  stand.id = `${id}-stand`;
  stand.className = 'hs-stand';
  stand.setAttribute('role', 'status');
  const ergebnisse = document.createElement('ul');
  ergebnisse.id = `${id}-liste`;
  ergebnisse.className = 'hs-liste';
  ergebnisse.setAttribute('aria-label', tx.feld);
  form.append(label, feld);
  ort.append(form, stand, ergebnisse);

  let verzeichnisse = null;
  let laden = null;
  const lade = () =>
    (laden ??= Promise.all(
      HANDBUECHER.map(async (handbuch) => {
        const basis = new URL(`${handbuch}/${ordner}${unter}`, WURZEL);
        try {
          const r = await fetch(new URL('search/search_index.json', basis));
          if (!r.ok) return null;
          return { handbuch, basis, abschnitte: handbuchVerzeichnis(await r.json()) };
        } catch {
          return null;
        }
      }),
    ).then((alle) => {
      verzeichnisse = alle.filter(Boolean);
    }));

  const teile = (liste) =>
    liste.map((t) => {
      if (!t.treffer) return document.createTextNode(t.text);
      const m = document.createElement('mark');
      m.textContent = t.text;
      return m;
    });

  function zeige() {
    const suche = feld.value;
    ergebnisse.replaceChildren();
    if (!suche.trim()) {
      stand.textContent = '';
      return;
    }
    if (!verzeichnisse) {
      stand.textContent = tx.laedt;
      lade().then(zeige);
      return;
    }
    if (!verzeichnisse.length) {
      stand.textContent = tx.nichtDa;
      return;
    }
    const treffer = sucheInHandbuechern(verzeichnisse, suche, 10);
    stand.textContent = !treffer.length ? tx.keine : treffer.length === 1 ? tx.eins : tx.mehr.replace('{n}', String(treffer.length));
    for (const t of treffer) {
      const v = verzeichnisse.find((x) => x.handbuch === t.handbuch);
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = new URL(t.abschnitt.adresse, v.basis).href;
      a.className = `hs-treffer ${t.handbuch}`;
      const kopf = document.createElement('span');
      kopf.className = 'hs-titel';
      kopf.append(...(t.titel ? teile(t.titel) : [document.createTextNode(t.abschnitt.titel)]));
      const wo = document.createElement('span');
      wo.className = 'hs-wo';
      wo.textContent = t.abschnitt.istSeite || !t.abschnitt.seite ? tx.namen[t.handbuch] : `${tx.namen[t.handbuch]} · ${t.abschnitt.seite}`;
      const text = document.createElement('span');
      text.className = 'hs-text';
      text.append(...teile(t.ausschnitt));
      a.append(kopf, wo, text);
      li.append(a);
      ergebnisse.append(li);
    }
  }

  let uhr = 0;
  feld.addEventListener('input', () => {
    clearTimeout(uhr);
    uhr = setTimeout(zeige, 120);
  });
  // Pfeiltasten: vom Feld in die Treffer und zwischen ihnen; Escape zurück ins Feld.
  ort.addEventListener('keydown', (e) => {
    const links = [...ergebnisse.querySelectorAll('a')];
    const i = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && links.length) {
      e.preventDefault();
      links[Math.min(i + 1, links.length - 1)].focus();
    } else if (e.key === 'ArrowUp' && i >= 0) {
      e.preventDefault();
      (i === 0 ? feld : links[i - 1]).focus();
    } else if (e.key === 'Escape' && i >= 0) {
      e.preventDefault();
      feld.focus();
    }
  });
  if (fokus) feld.focus();
  return { feld };
}
