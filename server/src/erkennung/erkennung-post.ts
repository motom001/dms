/** Erkennung (#1278 aus erkennung.ts): Vorschläge beim Zuordnen von Post (#336) und ihr gespeichertes Ergebnis. */
import { ErkennungAbgleich } from './erkennung-abgleich';
import { type PostErkennung, ausstellerAus, MAX_ABSENDER, type Zielvorschlag, MAX_ZIELE, log } from './erkennung-hilfen';
import { findeAngaben, findeMappen, eigenerAussteller, istAbsenderTyp, eindeutigerTreffer } from '../../../shared/src/erkennung';
import { t } from '../sprache/sprache';

export abstract class ErkennungPost extends ErkennungAbgleich {
  /** Erkennung einer Post rechnen und speichern. */
  async fuerPost(postId: string): Promise<PostErkennung | null> {
    const repo = this.repo();
    const post = await repo.holeMappe(postId);
    if (!post) return null;
    const start = Date.now();
    const { text, dokumente } = await this.postText(post);
    const angaben = findeAngaben(text);
    const { typen, mappen } = await this.vergleich();
    const typVon = new Map(typen.map((t) => [t.id, t]));
    // Eigene Organisation (#995) und Haushalt (#1043): nie Absender, auch nicht über „gefunden“ (auch wenn sie im
    // Anschriftfeld stehen). Stehen sie in der Absenderzeile, ist die Post wohl ausgehend – nur als Hinweis.
    const eigen = await this.eigeneLage();
    const treffer = findeMappen(text, typen, mappen).filter((x) => !eigen.ids.has(x.mappeId));
    const aus = eigenerAussteller(ausstellerAus(angaben), eigen.angaben);
    const absender = treffer.filter((x) => istAbsenderTyp(typVon.get(x.typId)!)).slice(0, MAX_ABSENDER);
    const eindeutig = eindeutigerTreffer(absender);
    const haupt = eindeutig ?? (absender[0]?.stark ? absender[0] : null);

    // Ziele: direkte Treffer (z. B. Vertrag über die Vertragsnummer), Mappen, die auf den Absender verweisen,
    // frühere Post dieses Absenders und der Absender selbst.
    const ziele = new Map<string, Zielvorschlag>();
    const dazu = (mappeId: string, typId: string, punkte: number, grund: string, direkt = false) => {
      if (mappeId === post.id) return;
      const z = ziele.get(mappeId) ?? { mappeId, typId, punkte: 0, gruende: [] };
      z.punkte += punkte;
      if (direkt) z.direkt = true;
      if (!z.gruende.includes(grund)) z.gruende.push(grund);
      ziele.set(mappeId, z);
    };
    for (const x of treffer)
      if (!istAbsenderTyp(typVon.get(x.typId)!)) dazu(x.mappeId, x.typId, x.punkte + 1, `gefunden: ${x.gruende.join(', ')}`, true);
    if (haupt) {
      const alleTypen = new Map((await repo.listeTypen()).map((t) => [t.id, t]));
      for (const r of (await repo.rueckverweise(haupt.mappeId)).slice(0, 200)) {
        const qt = alleTypen.get(r.quelleTypId);
        if (!qt || qt.system || istAbsenderTyp(qt)) continue;
        dazu(
          r.quelleId,
          r.quelleTypId,
          2,
          t('meldungen.erkennung.verweist-ueber-auf-den', { wert: qt.felder.find((f) => f.key === r.feldKey)?.label ?? r.feldKey }),
        );
      }
      const frueher = (await repo.erkennungenMitAbsender(haupt.mappeId, 50)).filter((id) => id !== post.id);
      const zaehler = new Map<string, number>();
      for (const p of await repo.holeMappen(frueher))
        for (const z of Array.isArray(p.werte.bezug) ? p.werte.bezug.map(String) : []) zaehler.set(z, (zaehler.get(z) ?? 0) + 1);
      const ziel = await repo.holeMappen([...zaehler.keys()]);
      for (const m of ziel) {
        const n = zaehler.get(m.id)!;
        if (alleTypen.get(m.typId)?.system) continue;
        dazu(
          m.id,
          m.typId,
          2 + Math.min(n, 5),
          t('meldungen.erkennung.fruehere-post-dieses-absenders', { wert: n > 1 ? ` (${n}-mal)` : '' }),
        );
      }
      const at = alleTypen.get(haupt.typId);
      if (at?.register.some((r) => r.art === 'dokumente'))
        dazu(haupt.mappeId, haupt.typId, 1, t('meldungen.erkennung.der-absender-selbst'));
    }
    const vorher = await repo.erkennungLies(post.id);
    const auto = (vorher?.ergebnis as PostErkennung | undefined)?.auto;
    const ergebnis: PostErkennung = {
      ...(auto ? { auto } : {}),
      zeit: new Date().toISOString(),
      dokumente,
      absender,
      eindeutig: eindeutig?.mappeId ?? null,
      angaben: {
        datum: angaben.datum,
        betrag: angaben.betrag,
        nummern: angaben.nummern.slice(0, 10),
        ...(angaben.gutschrift ? { gutschrift: angaben.gutschrift } : {}),
      },
      // Eigene Post: kein „neuen Absender anlegen“ mit den eigenen Angaben.
      briefkopf: absender.length || aus ? null : angaben.briefkopf,
      ziele: [...ziele.values()].sort((a, b) => b.punkte - a.punkte).slice(0, MAX_ZIELE),
      ...(aus ? { ausgehend: { mappeId: aus.mappeId, fundstelle: angaben.briefkopf?.fundstelle ?? '' } } : {}),
    };
    await repo.erkennungSchreibe(post.id, ergebnis, ergebnis.eindeutig);
    log.info('Erkennung für Post', {
      post: post.id,
      dokumente,
      absender: absender.length,
      eindeutig: !!eindeutig,
      ziele: ergebnis.ziele.length,
      ausgehend: !!aus,
      ms: Date.now() - start,
    });
    return ergebnis;
  }

  /** Gespeichertes Ergebnis; fehlt es (ältere Post, E-Mail ohne Anhang), wird es jetzt einmal gerechnet. */
  async ergebnis(postId: string): Promise<PostErkennung | null> {
    const da = await this.repo().erkennungLies(postId);
    return da ? (da.ergebnis as PostErkennung) : this.fuerPost(postId);
  }
}
