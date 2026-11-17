import type { ReactNode } from 'react';
import { FeldGruppe, Knopf } from '../../bausteine';
import {
  auswahlMitAbhaengigkeiten,
  dmsPasst,
  passt,
  vergleicheVersion,
  type Ergaenzung,
  type KatalogPaket,
  type KatalogVersion,
} from '../../../../shared/src/pakete';
import type { SammelPaket } from '../../api/pakete';
import { t } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import { PaketSymbol } from '../PaketSymbol';
import type { AblaufQuelle } from './kontext';

/**
 * Auswahl im Paket-Ablauf (#405; #1279 aus PaketAblauf.tsx gezogen): Kandidaten aus Katalog oder Sammeldatei, Auflösen
 * der Abhängigkeiten, Kategorien (#645), Sprachen (#1048) und die Pakete als Baum mit ihren Ergänzungen.
 */

export interface Kandidat {
  /** Paket-Id (Katalog) bzw. Upload-Kennung (Sammeldatei). */
  schluessel: string;
  id: string;
  name: string;
  version: string;
  beschreibung: string;
  code: boolean;
  ergaenzt: Ergaenzung | null;
  abhaengigkeiten: Record<string, string>;
  /** Nicht wählbar – mit Grund. */
  gesperrt?: string;
  /** Zusatz, z. B. „Update von 1.0.0“ in der Sammeldatei. */
  zusatz?: string;
  inhalt?: string;
  /** Wie im Katalog (#645): Symbol, Sprachkürzel, Kategorien, Größe des Archivs in Bytes. */
  symbol?: string;
  kuerzel?: string;
  kategorien?: string[];
  groesse?: number;
  /** Sprachpaket (#1048): nicht in der ersten Liste, sondern unter „Sprachen“. */
  sprache?: boolean;
}

/** Was mit einem Paket der Sammeldatei passiert (#461). */
export function sammelStand(p: SammelPaket): { text: string; chip: 'gut' | 'warn' | ''; installierbar: boolean } {
  if (p.stand === 'gleich')
    return { text: t('pakete.ablauf.sammel.gleich', { version: p.installiert ?? '' }), chip: '', installierbar: false };
  if (p.stand === 'aelter')
    return { text: t('pakete.ablauf.sammel.aelter', { version: p.installiert ?? '' }), chip: '', installierbar: false };
  if (!p.vorschau.dmsOk) return { text: t('pakete.ablauf.sammel.dms', { dms: p.vorschau.paket.dms }), chip: 'warn', installierbar: false };
  if (p.stand === 'neuer' && p.vorschau.herkunft?.art === 'katalog')
    return { text: t('pakete.ablauf.sammel.katalog', { version: p.installiert ?? '' }), chip: 'warn', installierbar: false };
  if (p.stand === 'neuer')
    return { text: t('pakete.ablauf.sammel.update', { version: p.installiert ?? '' }), chip: 'gut', installierbar: true };
  return { text: t('pakete.ablauf.sammel.neu'), chip: 'gut', installierbar: true };
}

const passende = (p: KatalogPaket, dms: string): KatalogVersion | undefined =>
  [...p.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((v) => dmsPasst(dms, v.dms));
const inhaltText = (v: KatalogVersion) =>
  [
    v.inhalt.mappentypen.length ? t('pakete.ablauf.inhalt.typen', { namen: v.inhalt.mappentypen.map((x) => x.name).join(', ') }) : '',
    v.inhalt.sichten.length ? t('pakete.ablauf.inhalt.sichten', { namen: v.inhalt.sichten.map((x) => x.name).join(', ') }) : '',
  ]
    .filter(Boolean)
    .join(' · ');

export function kandidaten(q: AblaufQuelle, versionen: Record<string, string>): Kandidat[] {
  if (q.art === 'katalog') {
    return q.katalog.pakete
      .filter((p) => !q.installiert.some((x) => x.id === p.id))
      .map((p): Kandidat => {
        const v = (versionen[p.id] ? p.versionen.find((x) => x.version === versionen[p.id]) : undefined) ?? passende(p, q.dms);
        const z = v ?? p.versionen[0];
        return {
          schluessel: p.id,
          id: p.id,
          name: p.name,
          version: z.version,
          beschreibung: p.beschreibung,
          code: z.code,
          ergaenzt: z.ergaenzt ?? null,
          abhaengigkeiten: z.abhaengigkeiten,
          ...(v ? {} : { gesperrt: t('pakete.ablauf.dms', { dms: z.dms, version: q.dms }) }),
          inhalt: inhaltText(z),
          symbol: p.symbol,
          kuerzel: p.kuerzel,
          kategorien: p.kategorien,
          groesse: z.groesse,
          ...(z.sprache ? { sprache: true } : {}),
        };
      });
  }
  return q.sammeldatei.pakete.map((p): Kandidat => {
    const st = sammelStand(p);
    return {
      schluessel: p.upload,
      id: p.id,
      name: p.name,
      version: p.version,
      beschreibung: p.vorschau.paket.beschreibung,
      code: !!p.vorschau.laeufer,
      ergaenzt: p.ergaenzt ?? null,
      abhaengigkeiten: p.abhaengigkeiten,
      ...(st.installierbar ? { zusatz: st.text } : { gesperrt: st.text }),
    };
  });
}

/** Die Auswahl samt Abhängigkeiten: in der Sammeldatei nur aus der Datei, im Katalog wie bisher (#460). */
export function aufloesen(
  q: AblaufQuelle,
  liste: Kandidat[],
  wahl: string[],
  versionen: Record<string, string>,
): { pakete: Array<{ schluessel: string; id: string; gewaehlt: boolean; fuer: string[] }>; probleme: string[] } {
  if (q.art === 'katalog') {
    const r = auswahlMitAbhaengigkeiten(q.katalog, wahl, q.dms, q.installiert, versionen);
    return { pakete: r.pakete.map((p) => ({ schluessel: p.id, id: p.id, gewaehlt: p.gewaehlt, fuer: p.fuer })), probleme: r.probleme };
  }
  const plan = new Map<string, { schluessel: string; id: string; gewaehlt: boolean; fuer: string[] }>();
  const probleme: string[] = [];
  const nimm = (k: Kandidat, von: string | null) => {
    const da = plan.get(k.id);
    if (da) {
      if (von && !da.fuer.includes(von)) da.fuer.push(von);
      if (!von) da.gewaehlt = true;
      return;
    }
    plan.set(k.id, { schluessel: k.schluessel, id: k.id, gewaehlt: !von, fuer: von ? [von] : [] });
    for (const [a, b] of Object.entries(k.abhaengigkeiten)) {
      const inst = q.installiert.find((x) => x.id === a);
      if (inst && passt(inst.version, b)) continue;
      const mit = liste.find((x) => x.id === a && !x.gesperrt);
      if (mit) nimm(mit, k.id);
      else probleme.push(t('pakete.ablauf.sammel.fehlt', { name: k.name, abh: a, bereich: b }));
    }
  };
  for (const s of wahl) {
    const k = liste.find((x) => x.schluessel === s);
    if (k && !k.gesperrt) nimm(k, null);
  }
  return { pakete: [...plan.values()], probleme };
}

/** Name einer Kategorie aus dem Katalog (#645); unbekannte Kennungen zeigt Ablago, wie sie sind. */
const kategorieName = (k: string) => {
  const s = `pakete.kategorie.${k}`;
  const x = t(s as never);
  return x === s ? k : x;
};
const groesseText = (b: number) =>
  b >= 1048576
    ? `${(b / 1048576).toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Filter „Sprachen“ (#1048) neben den Kategorien des Katalogs. */
const SPRACHEN = '~sprachen';

/** Kurzer Name einer Ergänzung unter ihrem Paket: „Texterkennung – Zusatzsprache Französisch“ → „Zusatzsprache Französisch“. */
const kurz = (name: string) => (name.includes(' – ') ? name.slice(name.lastIndexOf(' – ') + 3) : name);

/** „Weitere Sprachen?“: Ergänzungen eines Pakets als Häkchen, gruppiert; zu, solange das Paket nicht gewählt ist. */
function ErgaenzungenWahl({
  erg,
  offen,
  wahl,
  imPlan,
  schalten,
}: {
  erg: Kandidat[];
  offen: boolean;
  wahl: string[];
  imPlan: (id: string) => { gewaehlt: boolean } | undefined;
  schalten(s: string, an: boolean): void;
}) {
  const gruppen = [...new Set(erg.map((k) => k.ergaenzt?.gruppe ?? ''))];
  if (!offen) return <p className="pd-darf klein leise">{t('pakete.ablauf.ergaenzungen.zu', { anzahl: erg.length })}</p>;
  return (
    <>
      {gruppen.map((g) => (
        <FeldGruppe key={g} beschriftung={g ? `${g}?` : t('pakete.ablauf.ergaenzungen')} className="pd-ergaenzungen">
          <div className="pd-ergaenzungsliste">
            {erg
              .filter((k) => (k.ergaenzt?.gruppe ?? '') === g)
              .map((k) => {
                const p = imPlan(k.id);
                const an = wahl.includes(k.schluessel) || (!!p && !p.gewaehlt);
                return (
                  <label key={k.schluessel} className="haken klein" title={k.gesperrt ?? k.beschreibung}>
                    <input
                      type="checkbox"
                      checked={an}
                      disabled={!!k.gesperrt}
                      onChange={(e) => schalten(k.schluessel, e.target.checked)}
                    />
                    <span>
                      {kurz(k.name)}
                      {k.gesperrt && <span className="fehlertext"> {k.gesperrt}</span>}
                    </span>
                  </label>
                );
              })}
          </div>
        </FeldGruppe>
      ))}
    </>
  );
}

type Aufgeloest = ReturnType<typeof aufloesen>;
type ImPlan = (id: string) => Aufgeloest['pakete'][number] | undefined;

/** Ein Paket als Kachel (#1214): Haken, Symbol und Beschreibung als eine Fläche, darunter Inhalt und Abhängigkeiten. */
function Kachel({
  k,
  quelle,
  wahl,
  empfohlen,
  imPlan,
  name,
  schalten,
  ergaenzungen,
}: {
  k: Kandidat;
  quelle: AblaufQuelle;
  wahl: string[];
  empfohlen: string[];
  imPlan: ImPlan;
  name: (id: string) => string;
  schalten(s: string, an: boolean): void;
  ergaenzungen: Kandidat[];
}) {
  const p = imPlan(k.id);
  const mit = !!p && !p.gewaehlt;
  const an = wahl.includes(k.schluessel) || mit;
  return (
    <li className={an ? 'an' : undefined}>
      {/* Kachel als Gruppe mit dem Paketnamen (#1214): Haken, Symbol und Beschreibung bleiben eine Fläche zum Antippen. */}
      <FeldGruppe beschriftung={k.name} beschriftungVerbergen>
        <label className="haken pd-kachel">
          <input
            type="checkbox"
            checked={an}
            disabled={!!k.gesperrt || mit}
            onChange={(e) => schalten(k.schluessel, e.target.checked)}
            aria-describedby={`pa-${k.id}`}
          />
          <PaketSymbol symbol={k.symbol} kuerzel={k.kuerzel} name={k.name} />
          <span>
            <span>
              <strong>{k.name}</strong> <span className="leise klein">{k.version}</span>
              {empfohlen.includes(k.id) && !k.gesperrt && <Chip art="gut">{t('pakete.ablauf.empfohlen')}</Chip>}
              {k.code && <Chip>{t('pakete.ablauf.code')}</Chip>}
              {k.zusatz && <Chip art="gut">{k.zusatz}</Chip>}
              {mit && <Chip>{t('pakete.ablauf.kommtmit', { namen: p!.fuer.map(name).join(', ') })}</Chip>}
            </span>
            <span className="klein">{k.beschreibung}</span>
            {k.groesse !== undefined && k.groesse > 0 && (
              <span className="klein leise">{t('pakete.ablauf.groesse', { groesse: groesseText(k.groesse) })}</span>
            )}
          </span>
        </label>
      </FeldGruppe>
      <div className="pd-darf klein leise" id={`pa-${k.id}`}>
        {k.gesperrt ? <span className="fehlertext">{k.gesperrt}</span> : k.inhalt ? k.inhalt : null}
        {!k.gesperrt && Object.keys(k.abhaengigkeiten).length > 0 && (
          <>
            {k.inhalt ? ' · ' : ''}
            {t('pakete.ablauf.braucht', {
              namen: Object.keys(k.abhaengigkeiten)
                .map((a) => (quelle.installiert.some((x) => x.id === a) ? t('pakete.ablauf.braucht.da', { name: name(a) }) : name(a)))
                .join(', '),
            })}
          </>
        )}
      </div>
      {ergaenzungen.length > 0 && <ErgaenzungenWahl erg={ergaenzungen} offen={an} wahl={wahl} imPlan={imPlan} schalten={schalten} />}
    </li>
  );
}

/** Ein Chip hinter dem Namen, mit Leerzeichen davor. */
function Chip({ art, children }: { art?: string; children: ReactNode }) {
  return (
    <>
      {' '}
      <span className={art ? `chip ${art}` : 'chip'}>{children}</span>
    </>
  );
}

/** Kategorien wie im Katalog (#645) und „Sprachen“ (#1048) als Filter über der Liste. */
function KategorienFilter({
  kategorien,
  sprachen,
  kategorie,
  setKategorie,
}: {
  kategorien: string[];
  sprachen: boolean;
  kategorie: string | null;
  setKategorie(k: string | null): void;
}) {
  if (kategorien.length <= 1 && !sprachen) return null;
  return (
    <div className="pd-kategorien" role="group" aria-label={t('pakete.ablauf.kategorien')}>
      <Knopf aria-pressed={kategorie === null} onClick={() => setKategorie(null)}>
        {t('pakete.ablauf.kategorien.alle')}
      </Knopf>
      {kategorien.map((k) => (
        <Knopf key={k} aria-pressed={kategorie === k} onClick={() => setKategorie(kategorie === k ? null : k)}>
          {kategorieName(k)}
        </Knopf>
      ))}
      {sprachen && (
        <Knopf aria-pressed={kategorie === SPRACHEN} onClick={() => setKategorie(kategorie === SPRACHEN ? null : SPRACHEN)}>
          {t('pakete.ablauf.kategorien.sprachen')}
        </Knopf>
      )}
    </div>
  );
}

/** Was oben steht (#645, #1048): Basis-Pakete ohne Ergänzungen, Kategorien, Sprachen, schon installierte Basen. */
function baum(quelle: AblaufQuelle, liste: Kandidat[], nur: string[] | undefined, kategorie: string | null, wahl: string[]) {
  // Baum: oben die Pakete, darunter ihre Ergänzungen (auch unter einem schon installierten Paket).
  const basis = (k: Kandidat) =>
    k.ergaenzt && (liste.some((x) => x.id === k.ergaenzt!.paket) || quelle.installiert.some((x) => x.id === k.ergaenzt!.paket))
      ? k.ergaenzt.paket
      : null;
  const alleOben = liste.filter((k) => !basis(k) && (!nur || nur.includes(k.id)));
  // Kategorien wie im Katalog (#645): nur die, die hier vorkommen; Gewähltes bleibt beim Filtern sichtbar. Sprachen
  // (#1048) stehen nicht in der ersten Liste, sondern unter „Sprachen“ – außer, man sieht nur bestimmte Pakete (nur).
  const sprachen = !nur && alleOben.some((k) => k.sprache);
  const kategorien = [...new Set(alleOben.filter((k) => !sprachen || !k.sprache).flatMap((k) => k.kategorien ?? []))];
  const zeigen = (k: Kandidat) =>
    kategorie === SPRACHEN ? !!k.sprache : (!sprachen || !k.sprache) && (!kategorie || !!k.kategorien?.includes(kategorie));
  const oben = alleOben.filter((k) => zeigen(k) || wahl.includes(k.schluessel));
  const installierteBasen = [
    ...new Set(liste.map(basis).filter((b): b is string => !!b && quelle.installiert.some((x) => x.id === b))),
  ].filter((b) => !nur || nur.includes(b));
  const ergaenzungen = (id: string) => liste.filter((k) => basis(k) === id);
  return { sprachen, kategorien, oben, installierteBasen, ergaenzungen };
}

/** Eine Meldung mit Gründen (Prüfen bzw. Installieren). */
export function AblaufMeldung({ m }: { m?: { text: string; gruende?: string[] } }) {
  if (!m) return null;
  return (
    <div className="hinweis schlecht" role="status">
      <p>{m.text}</p>
      {!!m.gruende?.length && (
        <ul>
          {m.gruende.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Die Auswahl: Filter, Baum der Pakete, Probleme, Meldung und „Weiter“ mit weiteren Knöpfen. */
export function Auswahl({
  quelle,
  liste,
  nur,
  empfohlen,
  wahl,
  setWahl,
  aufgeloest,
  kategorie,
  setKategorie,
  meldung,
  laeuft,
  pruefen,
  weiterText,
  aktionen,
}: {
  quelle: AblaufQuelle;
  liste: Kandidat[];
  nur?: string[];
  empfohlen: string[];
  wahl: string[];
  setWahl(w: string[]): void;
  aufgeloest: Aufgeloest;
  kategorie: string | null;
  setKategorie(k: string | null): void;
  meldung?: { text: string; gruende?: string[] };
  laeuft: boolean;
  pruefen(): void;
  weiterText?: string;
  aktionen?: ReactNode;
}) {
  const b = baum(quelle, liste, nur, kategorie, wahl);
  const imPlan = (id: string) => aufgeloest.pakete.find((p) => p.id === id);
  const name = (id: string) => liste.find((k) => k.id === id)?.name ?? quelle.installiert.find((x) => x.id === id)?.name ?? id;
  const schalten = (s: string, an: boolean) => setWahl(an ? [...wahl, s] : wahl.filter((x) => x !== s));
  return (
    <div className="stapel">
      <KategorienFilter kategorien={b.kategorien} sprachen={b.sprachen} kategorie={kategorie} setKategorie={setKategorie} />
      <ul className="pd-liste" aria-label={t('pakete.ablauf.auswahl')}>
        {b.installierteBasen.map((x) => (
          <li key={`da-${x}`}>
            <span>
              <strong>{name(x)}</strong> <span className="chip">{t('pakete.ablauf.installiert')}</span>
            </span>
            <ErgaenzungenWahl erg={b.ergaenzungen(x)} offen wahl={wahl} imPlan={imPlan} schalten={schalten} />
          </li>
        ))}
        {b.oben.map((k) => (
          <Kachel
            key={k.schluessel}
            k={k}
            quelle={quelle}
            wahl={wahl}
            empfohlen={empfohlen}
            imPlan={imPlan}
            name={name}
            schalten={schalten}
            ergaenzungen={b.ergaenzungen(k.id)}
          />
        ))}
      </ul>
      {!b.oben.length && !b.installierteBasen.length && <p className="leise">{t('pakete.ablauf.nichts')}</p>}
      {aufgeloest.probleme.length > 0 && (
        <div className="hinweis warn">
          <ul>
            {aufgeloest.probleme.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <AblaufMeldung m={meldung} />
      <p className="leise klein">{t('pakete.ablauf.auswahl.hinweis')}</p>
      <div className="knoepfe">
        <Knopf
          art="haupt"
          gesperrt={!aufgeloest.pakete.length || aufgeloest.probleme.length > 0}
          laeuft={laeuft}
          laeuftText={t('pakete.ablauf.pruefe')}
          onClick={pruefen}>
          {weiterText ?? t('pakete.ablauf.weiter', { anzahl: aufgeloest.pakete.length })}
        </Knopf>
        {aktionen}
      </div>
    </div>
  );
}
