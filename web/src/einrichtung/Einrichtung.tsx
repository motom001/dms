import { AuswahlFilter } from '../werkbank/Sichten';
import { kreisImStandard } from '../../../shared/src/nummernkreis';
import { useEffect, useRef, useState } from 'react';
import { Ansage, umgestellt, useZiehen, ziehTasten } from '../ziehen';
import {
  FELDTYPEN, freierSchluessel, INDEXPLATZHALTER, istIndexplatzhalter, REGISTERARTEN, SYSTEMSPALTEN, type Systemspalte, schluesselAus, standardRegister, titelAus, trefferlistenVon, VERWEISARTEN, vorlageFelder, wirksameVorlage, pruefeTitelFilter,
  type Feld, type Mappe, type Mappentyp, type Register, type Registerart, type Werte,
} from '../../../shared/src/model';
import { FILTER } from '../../../shared/src/titelfilter';
import { wirksameTypen } from '../../../shared/src/sichten';
import { OFFENES_REGELWERK, regelProblem, regelwerkVon, type Regelwerk } from '../../../shared/src/rechte';
import { RegelwerkAbschnitt, TestlaufBlatt } from '../werkbank/Berechtigungen';
import { FRIST_STANDARD, FRIST_TEXT, fristText, VORLAUF_EINHEITEN, wiederholungText, type FristEinstellung } from '../../../shared/src/fristen';
import { api, ApiFehler, type Bezuege } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';
import { titelOder } from '../seiten';
import { Hilfe } from '../Hilfe';
import { FRISTEN, JAHRE_MAX, type Archiv } from '../../../shared/src/archiv';
import { Bereich, liesOffen, merkeOffen, TYP_BEREICHE, type Klappe, type TypBereich } from './Bereich';

/** Entfernen im Editor wirkt erst beim Speichern (#136). */
const ERST_BEIM_SPEICHERN = ' Das wird erst mit „Mappentyp speichern“ wirksam.';

/* ---------------------------------------------------------------- */

const ZAHLEN = ['minLen', 'maxLen', 'min', 'max', 'nachkomma'] as const;
type Zahlprop = (typeof ZAHLEN)[number];

/** Feld im Bearbeitungszustand: Zahlen als getippter Text, Merker für neue Felder. */
type EntwurfFeld = Omit<Feld, Zahlprop> & Record<Zahlprop, string> & { _uid: string; _neu?: boolean; _schluesselGetippt?: boolean; _register: string };
/** Register im Bearbeitungszustand; welche Felder darauf liegen, steht am Feld (_register). */
type EntwurfRegister = Omit<Register, 'felder'> & { _uid: string; _neu?: boolean; _schluesselGetippt?: boolean };
/** Trefferliste im Entwurf (#75): Spalten als _titel usw. bzw. feld:<_uid> – damit ein umbenannter Schlüssel nichts kaputt macht. */
interface EntwurfListe { _uid: string; _neu?: boolean; key: string; name: string; spalten: string[]; standard: boolean }
interface Entwurf {
  id: string; name: string;
  /** Fester Schlüssel (#145); bei neuen Typen aus dem Namen, bis man ihn selbst tippt. */
  schluessel: string; _schluesselGetippt?: boolean; beschreibung: string; titelVorlage: string; felder: EntwurfFeld[]; register: EntwurfRegister[]; trefferlisten: EntwurfListe[];
  /** Berechtigungen (#142): mit dem Mappentyp gespeichert. */
  berechtigungen: Regelwerk;
  /** Archivmodus (#212). */
  archiv: Archiv | null;
}

function neueId(): string {
  // crypto.randomUUID gibt es nur über HTTPS oder localhost; im Heimnetz oft nicht.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const alsEntwurfRegister = ({ felder: _f, ...r }: Register): EntwurfRegister => ({ ...r, _uid: neueId() });

function entwurfAus(t?: Mappentyp): Entwurf {
  if (!t) return { id: neueId(), name: '', schluessel: '', beschreibung: '', titelVorlage: '', felder: [], register: standardRegister([]).map(alsEntwurfRegister), trefferlisten: [{ _uid: neueId(), key: 'standard', name: 'Standard', spalten: [], standard: true }], berechtigungen: structuredClone(OFFENES_REGELWERK), archiv: null };
  const erstes = t.register.find((r) => r.art === 'felder')?.key ?? '';
  const e: Entwurf = {
    id: t.id, name: t.name, schluessel: t.schluessel ?? '', beschreibung: t.beschreibung, titelVorlage: t.titelVorlage ?? '',
    berechtigungen: structuredClone(regelwerkVon(t)),
    archiv: t.archiv ?? null,
    register: t.register.map(alsEntwurfRegister),
    felder: t.felder.map((f) => ({
      ...f, _uid: neueId(),
      _register: t.register.find((r) => r.art === 'felder' && r.felder?.includes(f.key))?.key ?? erstes,
      ...Object.fromEntries(ZAHLEN.map((p) => [p, f[p] == null ? '' : String(f[p]).replace('.', ',')])),
    }) as unknown as EntwurfFeld),
    trefferlisten: [],
  };
  e.trefferlisten = trefferlistenVon(t).map((l) => ({
    _uid: neueId(), key: l.key, name: l.name, standard: !!l.standard,
    spalten: l.spalten.flatMap((k) => {
      if (k.startsWith('_')) return [k];
      const f = e.felder.find((x) => x.key === k);
      return f ? [`feld:${f._uid}`] : [];
    }),
  }));
  return e;
}

/** Mappentyp kopieren (#147): neuer, ungespeicherter Entwurf mit Feldern, Titel, Trefferlisten, Registern und Berechtigungen. */
function kopieVon(t: Mappentyp, typen: Mappentyp[]): Entwurf {
  const e = entwurfAus(t);
  const id = neueId();
  const namen = new Set(typen.map((x) => x.name.trim().toLowerCase()));
  let name = `Kopie von ${t.name}`; let n = 2;
  while (namen.has(name.toLowerCase())) name = `Kopie von ${t.name} (${n++})`;
  // Verweise auf sich selbst zeigen in der Kopie auf die Kopie.
  const selbst = (x?: string) => (x === t.id ? id : x);
  return {
    ...e, id, name, schluessel: freierSchluessel(name, typen.map((x) => x.schluessel ?? '')),
    felder: e.felder.map((f) => ({ ...f, zielTyp: selbst(f.zielTyp) ?? '', _neu: true, _schluesselGetippt: true })),
    register: e.register.map((r) => (r.quellen ? { ...r, quellen: r.quellen.map((q) => ({ ...q, typId: selbst(q.typId)! })) } : r)),
    berechtigungen: structuredClone(e.berechtigungen),
  };
}

/** Für die Vorschau, solange es keine Mappe gibt. */
function beispielWerte(felder: Feld[]): Werte {
  const w: Werte = {};
  for (const f of felder) {
    switch (f.typ) {
      case 'zahl': w[f.key] = 42; break;
      case 'betrag': w[f.key] = { betrag: 123.45, waehrung: f.waehrung || 'EUR' }; break;
      case 'datum': w[f.key] = new Date().toISOString().slice(0, 10); break;
      case 'janein': w[f.key] = true; break;
      case 'auswahl': w[f.key] = f.optionen?.[0] ?? ''; break;
      case 'referenz': w[f.key] = 'beispiel'; break;
      case 'passwort': w[f.key] = null; break;
      default: w[f.key] = f.label || f.key;
    }
  }
  return w;
}

export function TypEditor({ typ, vorlage }: { typ?: Mappentyp; vorlage?: Mappentyp }) {
  const d = useDaten();
  const neu = !typ;
  const system = typ?.system;
  const [start] = useState(() => (typ ? entwurfAus(typ) : vorlage ? kopieVon(vorlage, d.typen) : entwurfAus()));
  // Eine Kopie gilt von Anfang an als ungespeichert.
  const [basis, setBasis] = useState(() => (vorlage && !typ ? '' : JSON.stringify(start)));
  const [e, setE] = useState<Entwurf>(start);
  const [offen, setOffen] = useState<number | null>(null);
  const [ansage, setAnsage] = useState('');

  // Bereiche (#144): neu = alle offen, bestehend = zu bzw. wie zuletzt auf diesem Gerät.
  const [auf, setAuf] = useState<Set<TypBereich>>(() => {
    const x = new Set<TypBereich>(neu ? TYP_BEREICHE.map(([k]) => k) : liesOffen(typ.id) ?? []);
    const h = location.hash.slice(1);
    if (TYP_BEREICHE.some(([k]) => k === h)) x.add(h as TypBereich);
    return x;
  });
  const [fehlerOrte, setFehlerOrte] = useState<Set<TypBereich>>(new Set());
  const stelle = (n: Set<TypBereich>) => { if (!neu) merkeOffen(e.id, n); return n; };
  const springe = (k: TypBereich) => setTimeout(() => document.getElementById(k)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
  const oeffne = (ks: TypBereich[], springen = true) => {
    setAuf((x) => stelle(new Set([...x, ...ks])));
    if (springen && ks[0]) springe(ks[0]);
  };
  useEffect(() => { const h = location.hash.slice(1); if (TYP_BEREICHE.some(([k]) => k === h)) springe(h as TypBereich); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Drag & Drop (#74): Felder umsortieren oder auf ein Feldregister ziehen; ändert nur den Entwurf.
  const zf = useZiehen({
    erlaubt: (_q, ziel, ort) => ort !== 'in' || ziel.startsWith('reg:'),
    fertig: (quelle, ziel, ort) => {
      if (ziel.startsWith('reg:')) {
        const key = ziel.slice(4);
        setE((x) => ({ ...x, felder: x.felder.map((f) => (f._uid === quelle ? { ...f, _register: key } : f)) }));
        const f = e.felder.find((x) => x._uid === quelle);
        setAnsage(`${f?.label || 'Feld'} liegt jetzt auf Register „${e.register.find((r) => r.key === key)?.name ?? key}“.`);
        return;
      }
      setE((x) => {
        const von = x.felder.findIndex((f) => f._uid === quelle), zu = x.felder.findIndex((f) => f._uid === ziel);
        return { ...x, felder: umgestellt(x.felder, von, zu, ort === 'vor' ? 'vor' : 'nach') };
      });
      setOffen(null); setFehler(null);
    },
  });
  // Neue Typen bekommen eine eigene Sicht in der Ablage, außer man wählt das ab (#38).
  const [sichtAnlegen, setSichtAnlegen] = useState(true);
  const [fehler, setFehler] = useState<{ allgemein: string[]; felder: Record<string, string[]> } | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [gruende, setGruende] = useState<string[]>([]);
  const [sendet, setSendet] = useState(false);
  const geaendert = neu || JSON.stringify(e) !== basis;
  useUngespeichert(JSON.stringify(e) !== basis && (!neu || e.felder.length > 0 || e.name !== ''));

  const gespeichert = d.typ(e.id);
  // Der Entwurf als Mappentyp, für Regeln und Prüfungen im Editor.
  const entwurfTyp = { id: e.id, name: e.name, beschreibung: e.beschreibung, system: system ?? null, felder: e.felder as unknown as Feld[], register: [], erstellt: '', geaendert: '' } as unknown as Mappentyp;
  // Fehler, die man schon vor dem Speichern sieht.
  const liveFehler: Partial<Record<TypBereich, boolean>> = {
    titel: vorlageFelder(e.titelVorlage).some((k) => !istIndexplatzhalter(k) && !e.felder.some((f) => f.key === k)) || pruefeTitelFilter({ felder: e.felder as unknown as Feld[], titelVorlage: e.titelVorlage }).length > 0,
    berechtigungen: e.berechtigungen.regeln.some((r) => !!regelProblem(r, entwurfTyp)),
  };
  const hatFehler = (k: TypBereich) => fehlerOrte.has(k) || !!liveFehler[k];
  const klappe = (k: TypBereich): Klappe => ({
    offen: auf.has(k), fehler: hatFehler(k),
    umschalten: () => setAuf((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return stelle(n); }),
  });
  const unpassend = gespeichert ? d.zaehler.typen[gespeichert.id]?.unpassend ?? 0 : 0;

  const setzeFeld = (i: number, patch: Partial<EntwurfFeld>) => setE((x) => {
    const felder = x.felder.map((f, j) => (j === i ? { ...f, ...patch } : f));
    return { ...x, felder };
  });
  const eindeutigerSchluessel = (basisKey: string, i: number, felder = e.felder) => {
    let k = basisKey; let n = 2;
    while (felder.some((g, j) => j !== i && g.key === k)) k = `${basisKey}_${n++}`.slice(0, 40);
    return k;
  };

  function feldHinzufuegen() {
    const i = e.felder.length;
    const f: EntwurfFeld = {
      key: eindeutigerSchluessel('neues_feld', i), label: 'Neues Feld', typ: 'text', pflicht: false, eindeutig: false, hilfe: '', standard: '',
      minLen: '', maxLen: '', min: '', max: '', nachkomma: '', muster: '', optionen: [], mehrfach: false, zielTyp: '', verweisart: 'bezug', waehrung: 'EUR', _uid: neueId(), _neu: true,
      _register: e.register.find((r) => r.art === 'felder')?.key ?? '',
    };
    setE((x) => ({ ...x, felder: [...x.felder, f] }));
    setOffen(i);
  }
  function verschiebe(i: number, r: number) {
    const j = i + r;
    if (j < 0 || j >= e.felder.length) return;
    setE((x) => { const fs = [...x.felder]; [fs[i], fs[j]] = [fs[j], fs[i]]; return { ...x, felder: fs }; });
    setOffen((o) => (o === i ? j : o === j ? i : o));
    setFehler(null);
  }
  async function entferne(i: number) {
    const f = e.felder[i];
    const n = gespeichert && d.anzahl(gespeichert.id) ? (await api.belegung(gespeichert.id).catch(() => ({} as Record<string, number>)))[f.key] ?? 0 : 0;
    const frage = n
      ? `${n} ${n === 1 ? 'Mappe hat' : 'Mappen haben'} in „${f.label}“ einen Wert. Die Werte bleiben gespeichert, werden aber nicht mehr angezeigt. Feld entfernen?${ERST_BEIM_SPEICHERN}`
      : `Feld „${f.label}“ entfernen?${ERST_BEIM_SPEICHERN}`;
    if (!confirm(frage)) return;
    setE((x) => ({ ...x, titelVorlage: x.titelVorlage.replace(new RegExp(`\\{${f.key}(\\|[^{}]*)?\\}`, 'g'), '').trim(), felder: x.felder.filter((_, j) => j !== i) }));
    setOffen(null); setFehler(null);
  }

  async function speichern(bestaetigt = false) {
    setSendet(true); setMeldung(undefined); setGruende([]);
    const { trefferlisten: listen, _schluesselGetippt: _sg, ...ohneListen } = e;
    const daten = {
      ...ohneListen,
      felder: e.felder.map(({ _uid, _neu, _schluesselGetippt, _register, ...rest }) => rest),
      register: e.register.map(({ _uid, _neu, _schluesselGetippt, ...r }) =>
        (r.art === 'felder' ? { ...r, felder: e.felder.filter((f) => f._register === r.key).map((f) => f.key) } : r)),
      trefferlisten: listen.map(({ _uid, _neu, ...l }) => ({
        ...l, spalten: l.spalten.flatMap((k) => (k.startsWith('feld:') ? e.felder.filter((f) => `feld:${f._uid}` === k && f.typ !== 'passwort').map((f) => f.key) : [k])),
      })),
    };
    try {
      const t = neu ? await api.typAnlegen({ ...daten, sichtAnlegen }) : await api.typAendern(e.id, { ...daten, bestaetigt });
      const sauber = entwurfAus(t);
      setE(sauber); setBasis(JSON.stringify(sauber)); setFehler(null); setOffen(null); setFehlerOrte(new Set());
      // Ein neuer Typ bleibt nach dem Anlegen aufgeklappt wie gerade.
      if (neu) merkeOffen(t.id, auf);
      loeseWache();
      await d.neuLaden();
      if (neu) geheZu(`/werkbank/typen/${t.id}`);
      else setMeldung('Mappentyp gespeichert.');
    } catch (err) {
      const f = err as ApiFehler;
      // Berechtigungen (#142): Danach könnte niemand mehr Mappen dieses Typs lesen – nachfragen.
      if (f.status === 409 && (f.details as { niemand?: number } | undefined)?.niemand && !bestaetigt && confirm(f.message)) { setSendet(false); await speichern(true); return; }
      // Bereiche mit Fehler markieren und aufklappen (#144).
      const orte = new Set<TypBereich>();
      if (f.pruefung) {
        setFehler(f.pruefung);
        const erstes = Object.keys(f.pruefung.felder)[0];
        if (erstes !== undefined) { setOffen(Number(erstes)); orte.add('felder'); }
        for (const o of f.pruefung.orte ?? []) if (TYP_BEREICHE.some(([k]) => k === o)) orte.add(o as TypBereich);
        if (f.pruefung.allgemein.length > (f.pruefung.orte?.length ?? 0)) orte.add('grunddaten');
      }
      if ((f.details as { berechtigungen?: boolean } | undefined)?.berechtigungen) orte.add('berechtigungen');
      setFehlerOrte(orte);
      if (orte.size) oeffne(TYP_BEREICHE.map(([k]) => k).filter((k) => orte.has(k)));
      setMeldung(f.message);
    } finally { setSendet(false); }
  }

  async function loeschen() {
    if (neu) { loeseWache(); geheZu('/werkbank/typen'); return; }
    if (!confirm(`Mappentyp „${e.name}“ endgültig löschen?`)) return;
    try {
      await api.typLoeschen(e.id);
      loeseWache(); await d.neuLaden(); geheZu('/werkbank/typen');
    } catch (err) {
      setMeldung((err as Error).message);
      setGruende((err as ApiFehler).gruende ?? []);
    }
  }

  const feldregister = e.register.filter((r) => r.art === 'felder');

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} noValidate>
      <div className="seitenkopf"><div>
        <p className="ueber">Mappentyp</p>
        <h1>{e.name || (neu ? 'Neuer Mappentyp' : 'Ohne Namen')}{system && <span className="chip">System</span>}</h1>
        {gespeichert && <p className="leise"><Link to={`/ablage/${gespeichert.id}`} className="verweis">{d.anzahl(gespeichert.id).toLocaleString('de-DE')} {d.anzahl(gespeichert.id) === 1 ? 'Mappe' : 'Mappen'} in der Ablage →</Link></p>}
        {vorlage && neu && <p className="leise">Kopie von „{vorlage.name}“ – noch nicht gespeichert. Mappen werden nicht kopiert.</p>}
      </div>
      {gespeichert && !system && <div className="knoepfe"><Link to={`/werkbank/typen/neu?kopie=${gespeichert.id}`} className="knopf klein" title="Neuen Mappentyp mit Feldern, Titel, Trefferlisten, Registern und Berechtigungen dieses Mappentyps anlegen">Mappentyp kopieren</Link></div>}
      </div>

      <nav className="sprungleiste" aria-label="Bereiche des Mappentyps">
        {TYP_BEREICHE.map(([k, name]) => (
          <button key={k} type="button" className={`sprung${auf.has(k) ? ' an' : ''}${hatFehler(k) ? ' fehler' : ''}`} onClick={() => oeffne([k])}
            title={hatFehler(k) ? `${name}: Fehler` : name}>{name}{hatFehler(k) && <span className="fehlerpunkt" aria-label="mit Fehler">!</span>}</button>
        ))}
        <span className="luecke" aria-hidden="true" />
        <button type="button" className="textknopf klein" onClick={() => setAuf(stelle(auf.size === TYP_BEREICHE.length ? new Set() : new Set(TYP_BEREICHE.map(([k]) => k))))}>
          {auf.size === TYP_BEREICHE.length ? 'Alle zuklappen' : 'Alle aufklappen'}</button>
      </nav>

      {system && (
        <div className="hinweis info"><p>{system === 'benutzer'
          ? 'Systemmappentyp: Jeder Benutzer hat hier seine Mappe. Du kannst Felder und Register ergänzen; die Systemfelder sind fest und werden im Profil und in der Benutzerverwaltung gepflegt. Anlegen und Löschen geschieht nur in der Benutzerverwaltung.'
          : 'Systemmappentyp: Rollen, die Benutzer haben können. Du kannst Felder und Register ergänzen; das Systemfeld ist fest. Administrator und Mitglied sind Systemrollen und lassen sich nicht löschen.'}</p></div>
      )}
      {unpassend > 0 && (
        <div className="hinweis warn"><p>{unpassend} {unpassend === 1 ? 'Mappe passt' : 'Mappen passen'} nicht zur aktuellen Definition. Sie sind in der Ablage markiert.</p></div>
      )}
      {fehler?.allgemein.length ? <div className="hinweis schlecht"><p>{fehler.allgemein.join(' ')}</p></div> : null}
      {gruende.length > 0 && <div className="hinweis warn"><ul>{gruende.map((g) => <li key={g}>{g}</li>)}</ul></div>}

      <Bereich id="grunddaten" titel="Grunddaten" klappe={klappe('grunddaten')}
        kurz={<>Kennung <code className="mono">{e.schluessel || '–'}</code>{e.beschreibung ? <> · {e.beschreibung}</> : null}</>}>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input value={e.name} placeholder="z. B. Vertrag" autoFocus={neu}
            onChange={(ev) => setE({ ...e, name: ev.target.value, ...(neu && !e._schluesselGetippt ? { schluessel: schluesselAus(ev.target.value) } : {}) })} /></label>
          <label className="eigenschaft"><span>Kennung <small>{neu || !gespeichert?.schluessel ? 'wird nach dem Speichern fest' : 'fest – Name lässt sich ändern, Links bleiben gültig'}</small></span>
            <input className="mono" value={e.schluessel} placeholder="z. B. vertrag" disabled={!neu && !!gespeichert?.schluessel}
              onChange={(ev) => setE({ ...e, schluessel: ev.target.value, _schluesselGetippt: true })} /></label>
        </div>
        <label className="eigenschaft"><span>Beschreibung</span><input value={e.beschreibung} placeholder="Wofür ist dieser Mappentyp?" onChange={(ev) => setE({ ...e, beschreibung: ev.target.value })} /></label>
        {neu && <label className="haken"><input type="checkbox" checked={sichtAnlegen} onChange={(ev) => setSichtAnlegen(ev.target.checked)} />
          <span>Eigene Ansicht in der Ablage anlegen<small className="hilfe">Abwählen, wenn die Mappen in einer bestehenden Ansicht erscheinen sollen – das stellst du unter Werkbank → Ansichten ein.</small></span></label>}
        {gespeichert && <VerwendetIn typ={gespeichert} />}
      </Bereich>

      <Bereich id="felder" titel="Felder" hilfe={<Hilfe ort="mappentyp.felder" />} klappe={klappe('felder')} kurz={feldKurz(e.felder)}
        beschreibung={<>Feld anklicken, um Feldart und Eigenschaften festzulegen. Die Reihenfolge gilt auch im Formular; ändern per Pfeil oder am Griff ⠿ ziehen. <Hilfe ort="mappentyp.ziehen" /></>}>
        <div className="feldliste">
          {e.felder.length === 0 && <div className="leer"><p>Noch keine Felder. Füge das erste hinzu, etwa „Bezeichnung“ als Text.</p></div>}
          {e.felder.map((f, i) => (
            <FeldZeile key={f._uid} f={f} i={i} anzahl={e.felder.length} offen={offen === i} fehler={fehler?.felder[String(i)]}
              zieh={zf.eintrag(f._uid)} griff={<button {...zf.griff(f._uid, f.label || 'Feld')} onKeyDown={(ev) => ziehTasten(ev, {
                hoch: i > 0 ? () => { verschiebe(i, -1); setAnsage(`${f.label || 'Feld'} steht jetzt an Stelle ${i}.`); } : undefined,
                runter: i < e.felder.length - 1 ? () => { verschiebe(i, 1); setAnsage(`${f.label || 'Feld'} steht jetzt an Stelle ${i + 2}.`); } : undefined,
              })}><span aria-hidden="true">⠿</span></button>}
              eigeneId={e.id} eigenerName={e.name} typen={d.typen} feldregister={feldregister}
              alleFelder={e.felder.map((x) => ({ key: x.key, label: x.label || x.key, typ: x.typ, optionen: x.optionen, zielTyp: x.zielTyp, mehrfach: x.mehrfach }) as Feld)}
              benutzerFelder={e.felder.filter((x) => x.typ === 'referenz' && !x.mehrfach && x.zielTyp && x.zielTyp === d.typen.find((t) => t.system === 'benutzer')?.id).map((x) => ({ key: x.key, label: x.label || x.key }))}
              umschalten={() => setOffen(offen === i ? null : i)}
              verschiebe={(r) => verschiebe(i, r)} entferne={() => void entferne(i)}
              setze={(patch) => {
                const p = { ...patch };
                if ('label' in p && f._neu && !f._schluesselGetippt) p.key = eindeutigerSchluessel(schluesselAus(p.label ?? ''), i);
                if ('key' in p) p._schluesselGetippt = true;
                if ('typ' in p) p.standard = p.typ === 'janein' ? false : '';
                setzeFeld(i, p);
              }} />
          ))}
        </div>
        <div><button type="button" className="knopf" onClick={feldHinzufuegen}>+ Feld hinzufügen</button></div>
        <Ansage text={ansage} />
      </Bereich>

      <TitelEditor e={e} setze={(titelVorlage) => setE((x) => ({ ...x, titelVorlage }))} klappe={klappe('titel')} />

      <TrefferlisteEditor e={e} setE={setE} klappe={klappe('trefferlisten')} />

      <RegisterEditor e={e} setE={setE} feldAblage={(key) => zf.ablage(`reg:${key}`)} klappe={klappe('register')} />
      <Bereich id="archiv" titel="Archivmodus" hilfe={<Hilfe ort="mappentyp.archiv" />} klappe={klappe('archiv')}
        kurz={e.archiv ? <>an · {e.archiv.jahre} Jahre ab {e.archiv.stichtag ? e.felder.find((f) => f.key === e.archiv!.stichtag)?.label ?? e.archiv.stichtag : 'Anlagedatum'}</> : 'aus'}>
        <ArchivEinstellung archiv={e.archiv} setze={(archiv) => setE({ ...e, archiv })} datumsfelder={e.felder.filter((f) => f.typ === 'datum' && f.key).map((f) => ({ key: f.key, label: f.label || f.key }))} typId={gespeichert?.id} />
      </Bereich>

      <RegelwerkAbschnitt rw={e.berechtigungen} setRw={(f) => setE((x) => ({ ...x, berechtigungen: f(x.berechtigungen) }))} neu={neu}
        gespeichert={gespeichert ? regelwerkVon(gespeichert) : null} typ={entwurfTyp} klappe={klappe('berechtigungen')} />
      <TestlaufBlatt typId={gespeichert?.id ?? ''} entwurf={e.berechtigungen} klappe={klappe('testlauf')} />

      <div className="speicherleiste">
        {system || (!neu && typ?.schluessel === 'ablageort')
          ? <span className="leise klein">{system ? '' : 'Gehört zum Standard (Ablageorte) – lässt sich erweitern, aber nicht löschen.'}</span>
          : <button type="button" className="textknopf gefahr" onClick={() => void loeschen()}>{neu ? 'Entwurf verwerfen' : 'Mappentyp löschen'}</button>}
        <span className={`status ${fehler ? 'schlecht' : ''}`} role="status">{meldung ?? (geaendert && !neu ? 'Ungespeicherte Änderungen' : '')}</span>
        <div className="knoepfe">
          {!neu && <button type="button" className="knopf" disabled={!geaendert || sendet} onClick={() => { setE(JSON.parse(basis)); setFehler(null); setMeldung(undefined); setOffen(null); }}>Änderungen verwerfen</button>}
          <button type="submit" className="knopf primaer" disabled={sendet}>{sendet ? 'Speichere …' : 'Mappentyp speichern'}</button>
        </div>
      </div>
    </form>
  );
}

/** Kurzinfo der Felder (#144), z. B. „8 Felder, 2 Pflicht, 1 mit Erinnerung“. */
function feldKurz(felder: EntwurfFeld[]): string {
  if (!felder.length) return 'noch keine Felder';
  const pflicht = felder.filter((f) => f.pflicht).length;
  const frist = felder.filter((f) => f.typ === 'datum' && f.frist).length;
  return [`${felder.length} ${felder.length === 1 ? 'Feld' : 'Felder'}`, pflicht && `${pflicht} Pflicht`, frist && `${frist} mit Erinnerung`].filter(Boolean).join(', ');
}

/** „Verwendet in“ (#147): Sichten, Referenzfelder und Verknüpfungsregister, die diesen Typ nutzen. */
function VerwendetIn({ typ }: { typ: Mappentyp }) {
  const d = useDaten();
  const sichten = d.sichten.filter((s) => s.typen.includes(typ.id));
  const felder = d.typen.filter((t) => t.id !== typ.id).flatMap((t) => t.felder.filter((f) => f.typ === 'referenz' && f.zielTyp === typ.id).map((f) => ({ t, f })));
  const register = d.typen.filter((t) => t.id !== typ.id)
    .flatMap((t) => t.register.filter((r) => r.art === 'verknuepfungen' && r.quellen?.some((q) => q.typId === typ.id)).map((r) => ({ t, r })));
  const leer = !sichten.length && !felder.length && !register.length;
  return (
    <div className="verwendet">
      <h3 className="zwischen">Verwendet in</h3>
      {leer ? <p className="leise klein">Nirgends verwendet – keine Ansicht zeigt ihn, kein anderer Mappentyp verweist auf ihn.</p> : (
        <ul className="verwendetliste klein">
          {sichten.map((s) => <li key={s.id}>Ansicht <Link to={`/werkbank/sichten/${s.id}`} className="verweis">{s.name}</Link></li>)}
          {felder.map(({ t, f }) => <li key={`${t.id}-${f.key}`}>Feld <Link to={`/werkbank/typen/${t.id}#felder`} className="verweis">{t.name} › {f.label || f.key}</Link></li>)}
          {register.map(({ t, r }) => <li key={`${t.id}-${r.key}`}>Verknüpfungsregister <Link to={`/werkbank/typen/${t.id}#register`} className="verweis">{t.name} › {r.name}</Link></li>)}
        </ul>
      )}
    </div>
  );
}

function FeldZeile(p: {
  f: EntwurfFeld; i: number; anzahl: number; offen: boolean; fehler?: string[];
  eigeneId: string; eigenerName: string; typen: Mappentyp[]; feldregister: EntwurfRegister[];
  /** Fristen (#129): Benutzerfelder dieses Typs als möglicher Empfänger. */
  benutzerFelder: Array<{ key: string; label: string }>;
  /** Auswahlfilter (#173): die Felder dieses Typs, deren Werte der Filter nutzen kann. */
  alleFelder: Feld[];
  umschalten(): void; verschiebe(r: number): void; entferne(): void; setze(patch: Partial<EntwurfFeld>): void;
  zieh: { className: string }; griff: React.ReactNode;
}) {
  const { f, i, offen, fehler, setze } = p;
  const id = (x: string) => `f${i}-${x}`;
  const zielName = f.zielTyp === p.eigeneId ? (p.eigenerName || 'dieser Mappentyp') : f.zielTyp === '*' ? 'jede Mappe' : p.typen.find((t) => t.id === f.zielTyp)?.name ?? '–';

  const chips: string[] = [];
  if (f.system) chips.push('System');
  if (f.eindeutig && (f.typ === 'text' || f.typ === 'zahl')) chips.push('eindeutig');
  if (f.typ === 'referenz') chips.push(`→ ${zielName}`, VERWEISARTEN[f.verweisart ?? 'bezug']);
  if (f.typ === 'auswahl') chips.push(`${(f.optionen ?? []).length} Werte`);
  if (f.mehrfach && (f.typ === 'auswahl' || f.typ === 'referenz')) chips.push('mehrfach');
  if (p.feldregister.length > 1) chips.push(`Register: ${p.feldregister.find((r) => r.key === f._register)?.name ?? '–'}`);
  if (f.typ === 'datum' && f.frist) chips.push(`erinnert ${f.frist.vorlauf} ${VORLAUF_EINHEITEN[f.frist.einheit]} vorher${f.frist.wiederholung ? ` · ${wiederholungText(f.frist.wiederholung)}` : ''}`);

  const zahl = (prop: Zahlprop, label: string, platzhalter: string) => (
    <label className="eigenschaft" htmlFor={id(prop)}><span>{label}</span>
      <input id={id(prop)} inputMode="decimal" placeholder={platzhalter} value={f[prop]} onChange={(e) => setze({ [prop]: e.target.value } as Partial<EntwurfFeld>)} /></label>
  );
  const haken = (prop: 'pflicht' | 'eindeutig' | 'mehrfach', label: string, hilfe: string) => (
    <label className="haken"><input type="checkbox" checked={!!f[prop]} onChange={(e) => setze({ [prop]: e.target.checked })} /><span>{label}<small className="hilfe">{hilfe}</small></span></label>
  );

  let besonders = null;
  if (f.typ === 'text' || f.typ === 'langtext' || f.typ === 'formatiert') besonders = <div className="raster">
    {zahl('minLen', 'Mindestlänge', 'keine')}{zahl('maxLen', 'Höchstlänge', 'keine')}
    {f.typ === 'text' && <label className="eigenschaft" htmlFor={id('muster')}><span>Muster <small>regulärer Ausdruck</small></span><input id={id('muster')} className="mono" placeholder="z. B. [A-Z]{2}-\d+" value={f.muster ?? ''} onChange={(e) => setze({ muster: e.target.value })} /></label>}
  </div>;
  else if (f.typ === 'zahl') besonders = <div className="raster">{zahl('min', 'Minimum', 'keins')}{zahl('max', 'Maximum', 'keins')}{zahl('nachkomma', 'Nachkommastellen', 'beliebig')}</div>;
  else if (f.typ === 'betrag') besonders = <div className="raster">{zahl('min', 'Minimum', 'keins')}{zahl('max', 'Maximum', 'keins')}
    <label className="eigenschaft" htmlFor={id('waehrung')}><span>Standardwährung</span><input id={id('waehrung')} className="mono" maxLength={3} value={f.waehrung ?? 'EUR'} onChange={(e) => setze({ waehrung: e.target.value.toUpperCase() })} /></label></div>;
  else if (f.typ === 'auswahl') besonders = <div className="raster">
    <label className="eigenschaft" htmlFor={id('optionen')}><span>Auswahlwerte <small>einer pro Zeile</small></span>
      <textarea id={id('optionen')} rows={4} defaultValue={(f.optionen ?? []).join('\n')} onBlur={(e) => setze({ optionen: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} /></label>
    <div className="eigenschaft unten">{haken('mehrfach', 'Mehrfachauswahl', 'Mehrere Werte gleichzeitig wählbar')}</div>
  </div>;
  else if (f.typ === 'datum') besonders = <FristEditor f={f} id={id} setze={setze} benutzerFelder={p.benutzerFelder} />;
  else if (f.typ === 'passwort') besonders = <p className="leise klein">Wird verschlüsselt gespeichert und erscheint nie im Titel, in der Trefferliste, in der Suche oder in Demo-Daten. Anzeigen lässt es sich nur einzeln über das Auge; das steht in der Historie.</p>;
  else if (f.typ === 'referenz') besonders = <div className="raster">
    <label className="eigenschaft" htmlFor={id('ziel')}><span>Verweist auf Mappen vom Mappentyp</span>
      <select id={id('ziel')} value={f.zielTyp ?? ''} onChange={(e) => setze({ zielTyp: e.target.value })}>
        <option value="">– bitte wählen –</option>
        {f.zielTyp === '*' && <option value="*">jede Mappe</option>}
        {p.typen.filter((t) => t.id !== p.eigeneId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value={p.eigeneId}>{p.eigenerName || 'Dieser Mappentyp'} (dieser Mappentyp)</option>
      </select>
      <small className="hilfe">„Dieser Mappentyp“ ergibt eine Hierarchie, z. B. Heizung → Haus.</small></label>
    <fieldset className="wahl"><legend>Art des Verweises</legend>
      <label className="haken"><input type="radio" name={id('va')} checked={f.verweisart === 'zugehoerigkeit'} onChange={() => setze({ verweisart: 'zugehoerigkeit' })} /><span>Zugehörigkeit<small className="hilfe">„gehört zu“ – zählt bei „alles zu X“ mit</small></span></label>
      <label className="haken"><input type="radio" name={id('va')} checked={f.verweisart !== 'zugehoerigkeit'} onChange={() => setze({ verweisart: 'bezug' })} /><span>Bezug<small className="hilfe">nur verknüpft, z. B. Aussteller</small></span></label>
    </fieldset>
    <div className="eigenschaft unten">{haken('mehrfach', 'Mehrere Mappen erlaubt', 'z. B. eine Zahlung für mehrere Rechnungen')}</div>
    {/* Auswahlfilter (#172): nicht für „jede Mappe“. */}
    {f.zielTyp && f.zielTyp !== '*' && (() => {
      const ziel = p.typen.find((t) => t.id === f.zielTyp);
      return ziel ? <div className="breit"><AuswahlFilter ziel={ziel} bedingungen={f.auswahlFilter ?? []} setze={(b) => setze({ auswahlFilter: b })} eigeneFelder={p.alleFelder} feldKey={f.key} /></div>
        : f.zielTyp === p.eigeneId ? <p className="leise klein breit">Einen Auswahlfilter auf diesen Mappentyp selbst kannst du nach dem ersten Speichern festlegen.</p> : null;
    })()}
  </div>;

  let standard = null;
  if (f.typ === 'text' || f.typ === 'langtext' || f.typ === 'formatiert' || f.typ === 'zahl' || f.typ === 'betrag')
    standard = <label className="eigenschaft" htmlFor={id('std')}><span>Standardwert {f.typ === 'text' && <small>{kreisImStandard(f.standard) ? 'Nummernkreis – das Feld wird schreibgeschützt' : 'oder {nummernkreis:schlüssel}'}</small>}</span><input id={id('std')} placeholder="leer" value={String(f.standard ?? '')} onChange={(e) => setze({ standard: e.target.value })} /></label>;
  else if (f.typ === 'datum')
    standard = <label className="eigenschaft" htmlFor={id('std')}><span>Standardwert</span><input id={id('std')} type="date" value={String(f.standard ?? '')} onChange={(e) => setze({ standard: e.target.value })} /></label>;
  else if (f.typ === 'janein')
    standard = <div className="eigenschaft unten"><label className="haken"><input type="checkbox" checked={f.standard === true} onChange={(e) => setze({ standard: e.target.checked })} /><span>Standardmäßig „Ja“</span></label></div>;
  else if (f.typ === 'auswahl' && !f.mehrfach)
    standard = <label className="eigenschaft" htmlFor={id('std')}><span>Standardwert</span><select id={id('std')} value={String(f.standard ?? '')} onChange={(e) => setze({ standard: e.target.value })}>
      <option value="">– keiner –</option>{(f.optionen ?? []).map((o) => <option key={o}>{o}</option>)}</select></label>;

  return (
    <div {...p.zieh} className={`feldzeile ${offen ? 'offen' : ''} ${fehler ? 'fehlerhaft' : ''} ${p.zieh.className}`}>
      <div className="feldsumme">
        {p.griff}
        <button type="button" className="feldkopfknopf" aria-expanded={offen} onClick={p.umschalten}>
          <span className="flabel">{f.label || 'Ohne Bezeichnung'}{f.pflicht && <span className="pflicht">*</span>}</span>
          <code className="fkey">{f.key}</code>
          <span className="ftyp">{FELDTYPEN[f.typ]}</span>
          {chips.length > 0 && <span className="chips">{chips.map((c) => <span key={c} className="chip">{c}</span>)}</span>}
        </button>
        <div className="feldaktionen">
          <button type="button" className="symbol" disabled={i === 0} onClick={() => p.verschiebe(-1)} aria-label="Feld nach oben">↑</button>
          <button type="button" className="symbol" disabled={i === p.anzahl - 1} onClick={() => p.verschiebe(1)} aria-label="Feld nach unten">↓</button>
        </div>
      </div>
      {fehler && !offen && <p className="fehlertext eingerueckt">{fehler.join(' ')}</p>}
      {offen && (
        <div className="feldeditor">
          {fehler && <div className="hinweis schlecht"><p>{fehler.join(' ')}</p></div>}
          {f.system && <p className="leise klein">Systemfeld: Bezeichnung, Hilfetext und Register lassen sich ändern, Feldart und Eigenschaften sind fest.</p>}
          <div className="raster">
            <label className="eigenschaft" htmlFor={id('label')}><span>Bezeichnung</span><input id={id('label')} value={f.label} placeholder="z. B. Kündigung bis" onChange={(e) => setze({ label: e.target.value })} autoFocus={f._neu} /></label>
            {p.feldregister.length > 1 && (
              <label className="eigenschaft" htmlFor={id('reg')}><span>Register</span>
                <select id={id('reg')} value={f._register} onChange={(e) => setze({ _register: e.target.value })}>
                  {p.feldregister.map((r) => <option key={r._uid} value={r.key}>{r.name || r.key}</option>)}
                </select></label>
            )}
          </div>
          {/* Bei Systemfeldern sind Schlüssel, Datentyp und Eigenschaften fest. */}
          <fieldset className="ohnerahmen" disabled={f.system}>
          <div className="raster">
            <label className="eigenschaft" htmlFor={id('key')}><span>Kennung <small>{f._neu ? 'wird nach dem Speichern fest' : 'fest – schützt gespeicherte Werte'}</small></span>
              <input id={id('key')} className="mono" value={f.key} disabled={!f._neu} onChange={(e) => setze({ key: e.target.value })} /></label>
            <label className="eigenschaft" htmlFor={id('typ')}><span>Feldart</span>
              <select id={id('typ')} value={f.typ} onChange={(e) => setze({ typ: e.target.value as Feld['typ'] })}>
                {Object.entries(FELDTYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
          <div className="raster">
            <div className="eigenschaft unten">{haken('pflicht', 'Pflichtfeld', 'Mappe lässt sich ohne Wert nicht speichern')}</div>
            {(f.typ === 'text' || f.typ === 'zahl') && <div className="eigenschaft unten">{haken('eindeutig', 'Eindeutig', 'Wert darf je Mappentyp nur einmal vorkommen')}</div>}
            {standard}
          </div>
          {besonders && <><h3 className="zwischen">Eigenschaften für {FELDTYPEN[f.typ]}</h3>{besonders}</>}
          </fieldset>
          <label className="eigenschaft" htmlFor={id('hilfe')}><span>Hilfetext</span><input id={id('hilfe')} placeholder="Erklärung, die beim Ausfüllen erscheint" value={f.hilfe ?? ''} onChange={(e) => setze({ hilfe: e.target.value })} /></label>
          <div className="feldfuss">
            {f.system ? <span className="leise klein">Systemfelder lassen sich nicht entfernen.</span> : <button type="button" className="textknopf gefahr" onClick={p.entferne}>Feld entfernen</button>}
            <button type="button" className="knopf klein" onClick={p.umschalten}>Zuklappen</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Erinnerung an einem Datumsfeld (#129) und wiederkehrende Termine (#130). */
function FristEditor({ f, id, setze, benutzerFelder }: { f: EntwurfFeld; id: (x: string) => string; setze(p: Partial<EntwurfFeld>): void; benutzerFelder: Array<{ key: string; label: string }> }) {
  const fr = f.frist;
  const aendere = (p: Partial<FristEinstellung>) => setze({ frist: { ...(fr ?? FRIST_STANDARD), ...p } });
  return (
    <div className="fristeditor">
      <label className="haken"><input type="checkbox" checked={!!fr} onChange={(e) => setze({ frist: e.target.checked ? { ...FRIST_STANDARD } : null })} />
        <span>Erinnern <Hilfe ort="mappentyp.frist" /><small className="hilfe">Rechtzeitig vor dem Datum steht die Mappe als Frist unter „Zu erledigen“ – auch in der täglichen Zusammenfassung</small></span></label>
      {fr && <>
        <div className="raster">
          <label className="eigenschaft" htmlFor={id('vorlauf')}><span>Vorlauf <small>so lange vorher</small></span>
            <span className="wertgruppe"><input id={id('vorlauf')} type="number" min={0} max={999} className="kurz" value={fr.vorlauf} onChange={(e) => aendere({ vorlauf: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
              <select aria-label="Einheit des Vorlaufs" value={fr.einheit} onChange={(e) => aendere({ einheit: e.target.value as FristEinstellung['einheit'] })}>
                {Object.entries(VORLAUF_EINHEITEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></span></label>
          <label className="eigenschaft" htmlFor={id('empf')}><span>Für</span>
            <select id={id('empf')} value={fr.empfaengerFeld ?? ''} onChange={(e) => aendere({ empfaengerFeld: e.target.value || null })}>
              <option value="">Ersteller der Mappe</option>
              {benutzerFelder.map((b) => <option key={b.key} value={b.key}>Benutzer im Feld „{b.label}“</option>)}
            </select>
            <small className="hilfe">{benutzerFelder.length ? 'Ist das Feld leer, bekommt der Ersteller die Erinnerung.' : 'Mit einem Feld, das auf Benutzer verweist (z. B. „Verantwortlich“), lässt sich ein anderer Empfänger wählen.'}</small></label>
        </div>
        <div className="raster">
          <label className="eigenschaft" htmlFor={id('ftext')}><span>Text <small>Platzhalter {'{feld}'}, {'{datum}'}, {'{titel}'}</small></span>
            <input id={id('ftext')} value={fr.text} maxLength={200} placeholder={FRIST_TEXT} onChange={(e) => aendere({ text: e.target.value })} />
            <small className="hilfe">Ergibt z. B. „{fristText({ ...fr, text: fr.text || FRIST_TEXT }, { label: f.label || 'Datum' }, '2027-09-30', 'Stromvertrag Haus')}“</small></label>
          <label className="eigenschaft" htmlFor={id('wdh')}><span>Wiederkehrend</span>
            <select id={id('wdh')} value={fr.wiederholung ?? ''} onChange={(e) => aendere({ wiederholung: e.target.value ? Number(e.target.value) : null })}>
              <option value="">einmalig</option>
              {[1, 3, 6, 12, 24, 36, 60].map((m) => <option key={m} value={m}>{wiederholungText(m)}</option>)}
              {fr.wiederholung && ![1, 3, 6, 12, 24, 36, 60].includes(fr.wiederholung) && <option value={fr.wiederholung}>{wiederholungText(fr.wiederholung)}</option>}
            </select>
            <small className="hilfe">Beim Erledigen schlägt das DMS den nächsten Termin vor; das Datum ändert sich nie von selbst.</small></label>
        </div>
      </>}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function TitelEditor({ e, setze, klappe }: { e: Entwurf; setze: (v: string) => void; klappe: Klappe }) {
  const d = useDaten();
  const feld = useRef<HTMLInputElement>(null);
  // Beispiele für die Vorschau: die ersten Mappen dieses Typs.
  const [mappen, setMappen] = useState<Mappe[]>([]);
  const [bezuege, setBezuege] = useState<Bezuege>({});
  const [beispielId, setBeispielId] = useState<string>('');
  useEffect(() => {
    if (!d.anzahl(e.id)) return;
    api.seite(`typ:${e.id}`, 0, 50).then((s) => { setMappen(s.mappen); setBezuege(s.bezuege); setBeispielId((b) => b || s.mappen[0]?.id || ''); }).catch(() => {});
  }, [e.id, d.stand]); // eslint-disable-line react-hooks/exhaustive-deps
  const felder = e.felder as unknown as Feld[];
  const v = e.titelVorlage;
  const unbekannt = vorlageFelder(v).filter((k) => !istIndexplatzhalter(k) && !felder.some((f) => f.key === k));
  const filterFehler = pruefeTitelFilter({ felder, titelVorlage: v });
  const beispiel = mappen.find((m) => m.id === beispielId);
  const werte = beispiel ? beispiel.werte : beispielWerte(felder);
  const jetzt = new Date().toISOString();
  const vorschau = titelAus({ felder, titelVorlage: v }, werte, (id) => (id === 'beispiel' ? '‹verwiesene Mappe›' : titelOder(bezuege[id]?.titel)),
    beispiel ?? { erstellt: jetzt, geaendert: jetzt });
  const automatisch = wirksameVorlage({ felder, titelVorlage: '' });

  function einsetzen(key: string) {
    const el = feld.current;
    const von = el?.selectionStart ?? v.length;
    const bis = el?.selectionEnd ?? von;
    const platz = `{${key}}`;
    setze(v.slice(0, von) + platz + v.slice(bis));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(von + platz.length, von + platz.length); });
  }

  return (
    <Bereich id="titel" titel="Titel einer Mappe" klappe={klappe}
      kurz={<><code className="mono">{v || automatisch || '–'}</code>{vorschau ? <> · z. B. „{vorschau}“</> : null}</>}
      beschreibung="So heißt eine Mappe in Listen und Verweisen. Felder in geschweiften Klammern werden eingesetzt, alles andere bleibt stehen.">
      <label className="eigenschaft" htmlFor="titel-vorlage"><span>Vorlage</span>
        <input id="titel-vorlage" ref={feld} className="mono" value={v} onChange={(ev) => setze(ev.target.value)}
          placeholder={automatisch ? `leer = ${automatisch}` : 'z. B. {verwendungszweck} vom {zahlungsdatum}'} /></label>
      <div className="chipwahl">
        <span className="leise klein">Einsetzen:</span>
        {/* Passwörter nie im Titel (#46). */}
        {felder.filter((f) => f.typ !== 'passwort').map((f) => <button key={f.key} type="button" className="chipknopf" onClick={() => einsetzen(f.key)}>{f.label || f.key}</button>)}
        {Object.entries(INDEXPLATZHALTER).map(([k, name]) => (
          <button key={k} type="button" className="chipknopf index" title={`Indexwert {${k}}: Datum, an dem die Mappe ${k === 'angelegt' ? 'angelegt' : 'zuletzt geändert'} wurde`} onClick={() => einsetzen(k)}>{name}</button>
        ))}
      </div>
      {unbekannt.length > 0 && <p className="fehlertext">Diese Platzhalter passen zu keinem Feld: {unbekannt.map((k) => `{${k}}`).join(', ')}</p>}
      {filterFehler.map((x) => <p key={x} className="fehlertext">{x}</p>)}
      <details className="filterhilfe">
        <summary className="klein">Platzhalter formatieren mit Filtern <Hilfe ort="werkbank.titelfilter" /></summary>
        <p className="leise klein">Hinter einem senkrechten Strich, auch mehrere hintereinander: <code className="mono">{'{betreff|kurz:30|gross}'}</code>. Ist ein Feld leer, fällt es samt Trenner wie „ – “ oder „ · “ weg.</p>
        <table className="klein filtertabelle"><tbody>
          {Object.entries(FILTER).map(([k, f]) => <tr key={k}><td><code className="mono">{k}{'arg' in f ? (f.arg === 'zahl' ? ':30' : ':"…"') : ''}</code></td><td>{f.text}</td></tr>)}
        </tbody></table>
      </details>
      <div className="vorschau">
        <span className="ueber">Vorschau</span>
        <strong className="vorschautitel">{vorschau || 'Ohne Titel'}</strong>
        {mappen.length > 0
          ? <label className="klein leise">mit den Werten von&nbsp;
              <select value={beispielId} onChange={(ev) => setBeispielId(ev.target.value)}>
                {mappen.map((m) => <option key={m.id} value={m.id}>{titelOder(m.titel)}</option>)}
              </select></label>
          : <span className="klein leise">mit Beispielwerten</span>}
      </div>
    </Bereich>
  );
}

function RegisterEditor({ e, setE, feldAblage, klappe }: { e: Entwurf; setE: (f: (x: Entwurf) => Entwurf) => void; feldAblage: (key: string) => { className: string }; klappe: Klappe }) {
  const d = useDaten();
  const [ansage, setAnsage] = useState('');
  const zr = useZiehen({
    fertig: (quelle, ziel, ort) => setE((x) => {
      const von = x.register.findIndex((r) => r._uid === quelle), zu = x.register.findIndex((r) => r._uid === ziel);
      return { ...x, register: umgestellt(x.register, von, zu, ort === 'vor' ? 'vor' : 'nach') };
    }),
  });
  const setzeReg = (i: number, patch: Partial<EntwurfRegister>) =>
    setE((x) => ({ ...x, register: x.register.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const eindeutig = (basis: string, i: number) => {
    let k = basis || 'register'; let n = 2;
    while (e.register.some((r, j) => j !== i && r.key === k)) k = `${basis}_${n++}`.slice(0, 40);
    return k;
  };

  function hinzufuegen(art: Registerart) {
    const name = { felder: 'Weitere Angaben', dokumente: 'Dokumente', verknuepfungen: 'Verknüpfungen', protokoll: 'Historie' }[art];
    const r: EntwurfRegister = { key: eindeutig(schluesselAus(name), -1), name, art, _uid: neueId(), _neu: true, ...(art === 'verknuepfungen' ? { quellen: [] } : {}) };
    setE((x) => ({ ...x, register: [...x.register, r] }));
  }
  function verschiebe(i: number, rueck: number) {
    const j = i + rueck;
    if (j < 0 || j >= e.register.length) return;
    setE((x) => { const rs = [...x.register]; [rs[i], rs[j]] = [rs[j], rs[i]]; return { ...x, register: rs }; });
  }
  function entferne(i: number) {
    const r = e.register[i];
    if (r.art === 'felder') {
      const ziel = e.register.find((x, j) => j !== i && x.art === 'felder');
      const betroffen = e.felder.filter((f) => f._register === r.key);
      if (betroffen.length && !ziel) { alert('Auf diesem Register liegen Felder, und es gibt kein anderes Feldregister. Lege zuerst ein weiteres an.'); return; }
      if (!confirm(`${betroffen.length ? `Register „${r.name}“ entfernen? Seine ${betroffen.length} Felder wandern auf „${ziel!.name}“.` : `Register „${r.name}“ entfernen?`}${ERST_BEIM_SPEICHERN}`)) return;
      setE((x) => ({ ...x, register: x.register.filter((_, j) => j !== i), felder: x.felder.map((f) => (f._register === r.key ? { ...f, _register: ziel!.key } : f)) }));
      return;
    }
    if (!confirm(`Register „${r.name}“ entfernen?${r.art === 'dokumente' ? ' Enthält es noch Dokumente, lässt sich der Mappentyp nicht speichern.' : ''}${ERST_BEIM_SPEICHERN}`)) return;
    setE((x) => ({ ...x, register: x.register.filter((_, j) => j !== i) }));
  }

  // Mögliche Quellen: jedes Referenzfeld, das auf diesen Mappentyp zeigt (auch aus ihm selbst).
  const quellen = [
    ...d.typen.filter((t) => t.id !== e.id).flatMap((t) => t.felder.filter((f) => f.typ === 'referenz' && (f.zielTyp === e.id || f.zielTyp === '*')).map((f) => ({ typId: t.id, feldKey: f.key, text: `${t.name} › ${f.label}` }))),
    ...e.felder.filter((f) => f.typ === 'referenz' && f.zielTyp === e.id).map((f) => ({ typId: e.id, feldKey: f.key, text: `${e.name || 'Dieser Mappentyp'} › ${f.label}` })),
  ];

  return (
    <Bereich id="register" titel="Register" hilfe={<Hilfe ort="mappentyp.register" />} klappe={klappe}
      kurz={e.register.map((r) => r.name || r.key).join(' · ') || 'keine'}
      beschreibung="Die Trennblätter einer Mappe, in dieser Reihenfolge. Welche Felder auf welchem Feldregister liegen, stellst du am Feld ein.">
      <div className="registerliste">
        {e.register.map((r, i) => {
          const anzahl = e.felder.filter((f) => f._register === r.key).length;
          const gewaehlt = r.quellen ?? [];
          return (
            <div key={r._uid} {...zr.eintrag(r._uid)}>
              <div {...(r.art === 'felder' ? feldAblage(r.key) : {})} className={`registerzeile art-${r.art} ${r.art === 'felder' ? feldAblage(r.key).className : ''}`}>
              <div className="registerkopf">
                <span className="registerchip"><button {...zr.griff(r._uid, r.name || 'Register')} onKeyDown={(ev) => ziehTasten(ev, {
                  hoch: i > 0 ? () => { verschiebe(i, -1); setAnsage(`${r.name} steht jetzt an Stelle ${i}.`); } : undefined,
                  runter: i < e.register.length - 1 ? () => { verschiebe(i, 1); setAnsage(`${r.name} steht jetzt an Stelle ${i + 2}.`); } : undefined,
                })}><span aria-hidden="true">⠿</span></button><span className="chip">{REGISTERARTEN[r.art]}</span></span>
                <input aria-label="Name des Registers" value={r.name} onChange={(ev) => {
                  const name = ev.target.value;
                  if (!r._neu) { setzeReg(i, { name }); return; }
                  const key = eindeutig(schluesselAus(name), i);
                  // Felder auf diesem Register wandern mit dem neuen Schlüssel mit.
                  setE((x) => ({
                    ...x,
                    register: x.register.map((y, j) => (j === i ? { ...y, name, key } : y)),
                    felder: x.felder.map((f) => (f._register === r.key ? { ...f, _register: key } : f)),
                  }));
                }} />
                <code className="fkey" title="Kennung">{r.key}</code>
                <div className="feldaktionen">
                  <button type="button" className="symbol" disabled={i === 0} onClick={() => verschiebe(i, -1)} aria-label="Register nach vorn">↑</button>
                  <button type="button" className="symbol" disabled={i === e.register.length - 1} onClick={() => verschiebe(i, 1)} aria-label="Register nach hinten">↓</button>
                  <button type="button" className="symbol" onClick={() => entferne(i)} aria-label={`Register ${r.name} entfernen`} title={`Register entfernen –${ERST_BEIM_SPEICHERN}`}>×</button>
                </div>
              </div>
              {r.art === 'felder' && <p className="leise klein">{anzahl ? `${anzahl} Feld${anzahl === 1 ? '' : 'er'}: ${e.felder.filter((f) => f._register === r.key).map((f) => f.label).join(', ')}` : 'Noch keine Felder.'}</p>}
              {r.art === 'dokumente' && <>
                <p className="leise klein">Hier werden Dateien hochgeladen; PDFs und Bilder sind direkt ansehbar.</p>
                <label className="haken"><input type="checkbox" checked={r.volltext !== false} onChange={(ev) => setzeReg(i, { volltext: ev.target.checked ? undefined : false })} />
                  <span>Volltext erzeugen<small className="hilfe">Textebene von PDFs lesen und gescannte Seiten und Bilder durch die Texterkennung schicken, damit die Volltextsuche sie findet.</small></span></label>
                {/* Versionierung (#194) */}
                <label className="haken"><input type="checkbox" checked={!!r.versionierung} onChange={(ev) => setzeReg(i, { versionierung: ev.target.checked || undefined, ...(ev.target.checked ? {} : { versionenBehalten: undefined }) })} />
                  <span>Versionierung einschalten<small className="hilfe">Beim Ersetzen bleibt die alte Version erhalten und lässt sich wieder hervorholen.</small></span></label>
                {r.versionierung && <label className="eigenschaft klein einzug"><span>Nur die letzten … Versionen behalten <small>leer = alle</small></span>
                  <input type="number" min={2} className="kurz" value={r.versionenBehalten ?? ''} onChange={(ev) => setzeReg(i, { versionenBehalten: ev.target.value === '' ? undefined : Math.max(2, Math.trunc(Number(ev.target.value))) })} /></label>}
              </>}
              {r.art === 'protokoll' && <p className="leise klein">Zeigt, wer wann was an der Mappe geändert hat – je Speichern ein Eintrag mit allen geänderten Feldern, dazu Dokumente, Papierkorb, Notizen, Aufgaben und E-Mails. Einträge lassen sich nicht ändern.</p>}
              {r.art === 'verknuepfungen' && (
                quellen.length === 0
                  ? <p className="leise klein">Noch verweist kein Verweisfeld auf diesen Mappentyp. Das Register zeigt alle Verweise, sobald es welche gibt.</p>
                  : <fieldset className="wahl"><legend className="klein">Zeigt Mappen, die so hierher verweisen <span className="leise">(keine Auswahl = alle, als einfache Liste; für eine Tabelle die Quelle auswählen und eine Trefferliste wählen)</span></legend>
                      {quellen.map((q) => {
                        const an = gewaehlt.some((g) => g.typId === q.typId && g.feldKey === q.feldKey);
                        const g = gewaehlt.find((x) => x.typId === q.typId && x.feldKey === q.feldKey);
                        // Trefferliste je Quelle (#75): das Register zeigt die Mappen dann als Tabelle mit deren Spalten.
                        const listen = q.typId === e.id ? e.trefferlisten.map((l) => ({ key: l.key, name: l.name })) : trefferlistenVon(d.typ(q.typId) ?? {}).map((l) => ({ key: l.key, name: l.name }));
                        const fehlt = !!g?.trefferliste && !listen.some((l) => l.key === g.trefferliste);
                        return (
                          <div key={`${q.typId}-${q.feldKey}`} className="quellzeile">
                            <label className="haken"><input type="checkbox" checked={an}
                              onChange={() => setzeReg(i, { quellen: an ? gewaehlt.filter((x) => !(x.typId === q.typId && x.feldKey === q.feldKey)) : [...gewaehlt, { typId: q.typId, feldKey: q.feldKey }] })} />
                              <span>{q.text}</span></label>
                            {an && (
                              <select aria-label={`Trefferliste für ${q.text}`} className={`klein ${fehlt ? 'fehlerhaft' : ''}`} value={g?.trefferliste ?? ''}
                                onChange={(ev) => setzeReg(i, { quellen: gewaehlt.map((x) => (x === g ? { typId: x.typId, feldKey: x.feldKey, ...(ev.target.value ? { trefferliste: ev.target.value } : {}) } : x)) })}>
                                <option value="">einfache Liste (Titel)</option>
                                {fehlt && <option value={g!.trefferliste}>– {g!.trefferliste} (fehlt, einfache Liste) –</option>}
                                {listen.map((l) => <option key={l.key} value={l.key}>Tabelle: {l.name}</option>)}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </fieldset>
              )}
              </div>
            </div>
          );
        })}
      </div>
      <Ansage text={ansage} />
      <div className="knoepfe">
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('felder')}>+ Feldregister</button>
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('dokumente')}>+ Dokumentenregister</button>
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('verknuepfungen')}>+ Verknüpfungsregister</button>
        {!e.register.some((r) => r.art === 'protokoll') && <button type="button" className="knopf klein" onClick={() => hinzufuegen('protokoll')}>+ Historie</button>}
      </div>
    </Bereich>
  );
}

/* ---------------------------------------------------------------- */

/** Trefferlisten (#75): mehrere je Typ, eine ist Standard; je Liste Spalten auswählen und anordnen (#19). */
function TrefferlisteEditor({ e, setE, klappe }: { e: Entwurf; setE: (f: (x: Entwurf) => Entwurf) => void; klappe: Klappe }) {
  const d = useDaten();
  const name = (k: string) => (k.startsWith('feld:') ? e.felder.find((f) => `feld:${f._uid}` === k)?.label || '(Feld ohne Namen)' : SYSTEMSPALTEN[k as Systemspalte] ?? k);
  const setzeListe = (i: number, patch: Partial<EntwurfListe>) => setE((x) => ({ ...x, trefferlisten: x.trefferlisten.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const eindeutig = (basis: string, i: number) => {
    let k = basis || 'liste'; let n = 2;
    while (e.trefferlisten.some((l, j) => j !== i && l.key === k)) k = `${basis || 'liste'}_${n++}`.slice(0, 40);
    return k;
  };
  function hinzufuegen() {
    const nm = `Liste ${e.trefferlisten.length + 1}`;
    const vorlage = e.trefferlisten.find((l) => l.standard)?.spalten ?? [];
    setE((x) => ({ ...x, trefferlisten: [...x.trefferlisten, { _uid: neueId(), _neu: true, key: eindeutig(schluesselAus(nm), -1), name: nm, spalten: [...vorlage], standard: false }] }));
  }
  function entferne(i: number) {
    const l = e.trefferlisten[i];
    const n = verwendung(l.key).length;
    if (!confirm(`Trefferliste „${l.name}“ entfernen?${n ? ` Sie wird ${n === 1 ? 'an einer Stelle' : `an ${n} Stellen`} verwendet; dort gilt danach die Standardliste.` : ''}${ERST_BEIM_SPEICHERN}`)) return;
    setE((x) => {
      const rest = x.trefferlisten.filter((_, j) => j !== i);
      if (l.standard && rest.length) rest[0] = { ...rest[0], standard: true };
      return { ...x, trefferlisten: rest };
    });
  }
  // Wo eine Liste verwendet wird: Sichten mit diesem Typ und Verknüpfungsregister mit diesem Typ als Quelle.
  function verwendung(key: string): string[] {
    const sichten = d.sichten.filter((s) => s.trefferliste === key && wirksameTypen(d.sichten, s.id).includes(e.id)).map((s) => `Ansicht „${s.name}“`);
    const register = [
      ...d.typen.filter((t) => t.id !== e.id).map((t) => ({ typ: t.name, register: t.register })),
      { typ: e.name || 'dieser Mappentyp', register: e.register as Register[] },
    ].flatMap(({ typ, register }) => register.filter((r) => r.quellen?.some((q) => q.typId === e.id && q.trefferliste === key)).map((r) => `Register „${r.name}“ (${typ})`));
    return [...sichten, ...register];
  }
  return (
    <Bereich id="trefferlisten" titel="Trefferlisten" hilfe={<Hilfe ort="mappentyp.trefferlisten" />} klappe={klappe}
      kurz={`${e.trefferlisten.length === 1 ? '1 Liste' : `${e.trefferlisten.length} Listen`}, Standard: ${e.trefferlisten.find((l) => l.standard)?.name ?? '–'}`}
      beschreibung={<>Spalten, wenn die Liste breit genug ist, in dieser Reihenfolge. In schmalen Fenstern bilden die ersten drei den kompakten Eintrag: die erste fett, die zweite und dritte darunter. Ohne Spalten: Titel und zwei Felder.
          Eine Liste ist Standard; Ansichten und Verknüpfungsregister können eine andere wählen.</>}>
      <div className="trefferlisten">
        {e.trefferlisten.map((l, i) => {
          const wo = verwendung(l.key);
          return (
            <section key={l._uid} className={`trefferlistenblock ${l.standard ? 'standard' : ''}`} aria-label={`Trefferliste ${l.name}`}>
              <div className="registerkopf">
                <input aria-label="Name der Trefferliste" value={l.name} onChange={(ev) => {
                  const nm = ev.target.value;
                  setzeListe(i, l._neu ? { name: nm, key: eindeutig(schluesselAus(nm), i) } : { name: nm });
                }} />
                <code className="fkey" title="Kennung">{l.key}</code>
                <label className="haken klein"><input type="radio" name="standardliste" checked={l.standard}
                  onChange={() => setE((x) => ({ ...x, trefferlisten: x.trefferlisten.map((y, j) => ({ ...y, standard: j === i })) }))} /><span>Standard</span></label>
                <div className="feldaktionen">
                  <button type="button" className="symbol" disabled={e.trefferlisten.length < 2} title={e.trefferlisten.length < 2 ? 'Eine Trefferliste braucht der Mappentyp immer' : `Trefferliste entfernen –${ERST_BEIM_SPEICHERN}`}
                    onClick={() => entferne(i)} aria-label={`Trefferliste ${l.name} entfernen`}>×</button>
                </div>
              </div>
              <Spaltenwahl e={e} spalten={l.spalten} name={name} setze={(spalten) => setzeListe(i, { spalten })} />
              <p className="leise klein">{wo.length ? `Verwendet in: ${wo.join(', ')}` : l.standard ? 'Gilt überall, wo keine andere Liste gewählt ist.' : 'Noch nirgends verwendet.'}</p>
            </section>
          );
        })}
      </div>
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={hinzufuegen}>+ Trefferliste</button></div>
    </Bereich>
  );
}

/** Spalten einer Trefferliste: auswählen und anordnen. */
function Spaltenwahl({ e, spalten, name, setze }: { e: Entwurf; spalten: string[]; name: (k: string) => string; setze: (t: string[]) => void }) {
  // Spalten gelöschter Felder und Passwortfelder (#46) fallen weg.
  const liste = spalten.filter((k) => !k.startsWith('feld:') || e.felder.some((f) => `feld:${f._uid}` === k && f.typ !== 'passwort'));
  const verfuegbar = [
    ...e.felder.filter((f) => f.typ !== 'passwort').map((f) => ({ k: `feld:${f._uid}`, n: f.label || f.key })),
    ...(Object.keys(SYSTEMSPALTEN) as Systemspalte[]).filter((k) => k !== '_typ').map((k) => ({ k, n: SYSTEMSPALTEN[k] })),
  ].filter((x) => !liste.includes(x.k));
  const [ansage, setAnsage] = useState('');
  const schiebe = (i: number, r: number) => {
    const j = i + r;
    if (j < 0 || j >= liste.length) return;
    const n = [...liste]; [n[i], n[j]] = [n[j], n[i]]; setze(n);
    setAnsage(`${name(liste[i])} steht jetzt an Stelle ${j + 1}.`);
  };
  // Drag & Drop (#74)
  const zs = useZiehen({ fertig: (quelle, ziel, ort) => setze(umgestellt(liste, liste.indexOf(quelle), liste.indexOf(ziel), ort === 'vor' ? 'vor' : 'nach')) });
  return (
    <>
      <Ansage text={ansage} />
      {liste.length > 0 && (
        <ol className="spaltenliste">
          {liste.map((k, i) => (
            <li key={k} {...zs.eintrag(k)} className={`${i < 3 ? 'kompakt' : ''} ${zs.eintrag(k).className}`}>
              <button {...zs.griff(k, name(k))} onKeyDown={(ev) => ziehTasten(ev, { hoch: () => schiebe(i, -1), runter: () => schiebe(i, 1) })}><span aria-hidden="true">⠿</span></button>
              <span className="nr">{i + 1}</span>
              <span className="nm">{name(k)}{k.startsWith('_') && <span className="chip">System</span>}</span>
              <span className="aktionen">
                <button type="button" className="symbol" disabled={i === 0} onClick={() => schiebe(i, -1)} aria-label={`${name(k)} nach vorn`}>↑</button>
                <button type="button" className="symbol" disabled={i === liste.length - 1} onClick={() => schiebe(i, 1)} aria-label={`${name(k)} nach hinten`}>↓</button>
                <button type="button" className="symbol" onClick={() => setze(liste.filter((x) => x !== k))} aria-label={`${name(k)} entfernen`}>×</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {verfuegbar.length > 0 && (
        <label className="eigenschaft schmal"><span>Spalte hinzufügen</span>
          <select value="" onChange={(ev) => { if (ev.target.value) setze([...liste, ev.target.value]); }}>
            <option value="">– wählen –</option>
            {verfuegbar.map((x) => <option key={x.k} value={x.k}>{x.n}{x.k.startsWith('_') ? ' (System)' : ''}</option>)}
          </select>
        </label>
      )}
    </>
  );
}

/** Archivmodus (#212): Frist, Stichtag; beim Einschalten Vorschau, beim Ausschalten Rückfrage. */
function ArchivEinstellung({ archiv, setze, datumsfelder, typId }: { archiv: Archiv | null; setze: (a: Archiv | null) => void; datumsfelder: Array<{ key: string; label: string }>; typId?: string }) {
  const [vorschau, setVorschau] = useState<{ mappen: number; darfWeg: number } | null>(null);
  const text = JSON.stringify(archiv);
  useEffect(() => {
    if (!archiv || !typId) { setVorschau(null); return; }
    let aktuell = true;
    api.archivVorschau(typId, archiv).then((v) => aktuell && setVorschau(v)).catch(() => aktuell && setVorschau(null));
    return () => { aktuell = false; };
  }, [text, typId]); // eslint-disable-line react-hooks/exhaustive-deps
  const vorschlag = FRISTEN.some((f) => f.jahre === archiv?.jahre);
  return (
    <div className="stapel">
      <p className="leise">Für Belege mit Aufbewahrungspflicht: Bis zum Ende der Frist lässt sich keine Mappe und kein Dokument löschen – auch nicht von Administratoren; Dokumente ändern sich nur als neue Version. Danach stehen die Mappen unter Werkbank → Darf weg. Gelöscht wird nie automatisch. Das unterstützt eine GoBD-gerechte Aufbewahrung, ersetzt aber keine Verfahrensdokumentation und keine Steuerberatung.</p>
      <label className="haken"><input type="checkbox" checked={!!archiv} onChange={(ev) => {
        if (ev.target.checked) setze({ jahre: 8, stichtag: datumsfelder[0]?.key ?? null });
        else if (confirm('Archivmodus ausschalten? Danach lassen sich Mappen und Dokumente dieses Mappentyps wieder vor Fristende löschen. Das steht im Protokoll.')) setze(null);
      }} /><span>Archivmodus einschalten<small className="hilfe">Gilt auch für vorhandene Mappen. Die Versionierung der Dokumentenregister ist dann Pflicht.</small></span></label>
      {archiv && <>
        <div className="raster">
          <label className="eigenschaft"><span>Aufbewahrungsfrist</span>
            <select value={vorschlag ? String(archiv.jahre) : 'eigen'} onChange={(ev) => setze({ ...archiv, jahre: ev.target.value === 'eigen' ? 3 : Number(ev.target.value) })}>
              {FRISTEN.map((f) => <option key={f.jahre} value={f.jahre}>{f.jahre} Jahre – {f.text}</option>)}
              <option value="eigen">eigene Zahl</option>
            </select></label>
          {!vorschlag && <label className="eigenschaft"><span>Jahre</span><input type="number" min={1} max={JAHRE_MAX} value={archiv.jahre} onChange={(ev) => setze({ ...archiv, jahre: Math.max(1, Math.min(JAHRE_MAX, Math.trunc(Number(ev.target.value) || 1))) })} /></label>}
          <label className="eigenschaft"><span>Stichtag <small>Frist bis Ende des Kalenderjahres + Jahre</small></span>
            <select value={archiv.stichtag ?? ''} onChange={(ev) => setze({ ...archiv, stichtag: ev.target.value || null })}>
              {datumsfelder.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              <option value="">Anlagedatum der Mappe</option>
            </select></label>
        </div>
        {vorschau && <p className="hinweis info">{vorschau.mappen === 1 ? '1 Mappe ist' : `${vorschau.mappen} Mappen sind`} betroffen{vorschau.darfWeg ? `, davon ${vorschau.darfWeg === 1 ? 'wäre 1' : `wären ${vorschau.darfWeg}`} schon „darf weg“` : ''}.</p>}
      </>}
    </div>
  );
}
