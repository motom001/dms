/** Ansicht der Werkbank (#281): Vorlagen, Abweichungen, eigene Ergänzungen, Speichern. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ansichtAus, BEREICHE, fuerAlle, inVorlage, liesAnsicht, liesEigene, OHNE_EINSTELLUNG, sichtbar,
} from '../../shared/src/werkbankansicht';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const ICH = { id: 'admin-1', email: 'admin@example.org' };
const DU = { id: 'admin-2', email: 'zweite@example.org' };

describe('Werkbank-Ansicht: Regeln', () => {
  it('Haushalt ist schlank, Organisation mehr, Alles alles', () => {
    const h = BEREICHE.filter((b) => inVorlage('haushalt', b.pfad)).map((b) => b.pfad);
    const o = BEREICHE.filter((b) => inVorlage('organisation', b.pfad)).map((b) => b.pfad);
    assert.ok(h.includes('sicherung') && h.includes('benutzer') && h.includes('pakete'));
    assert.ok(!h.includes('nummernkreise') && !h.includes('protokoll') && !h.includes('demo'));
    assert.ok(h.every((p) => o.includes(p)), 'Organisation enthält alles aus Haushalt');
    assert.ok(o.includes('nummernkreise') && o.includes('postfaecher'));
    assert.equal(BEREICHE.filter((b) => inVorlage('alles', b.pfad)).length, BEREICHE.length);
  });

  it('Übersicht ist immer da; Abweichungen von der Vorlage zählen', () => {
    const a = { vorlage: 'haushalt' as const, ein: ['protokoll'], aus: ['vollexport'] };
    assert.equal(fuerAlle(a, 'uebersicht'), true);
    assert.equal(fuerAlle(a, 'protokoll'), true);
    assert.equal(fuerAlle(a, 'vollexport'), false);
    assert.equal(fuerAlle(a, 'demo'), false);
    assert.equal(sichtbar(a, { ein: ['demo'] }, 'demo'), true, 'eigene Ergänzung');
  });

  it('ansichtAus speichert nur Abweichungen', () => {
    const an = BEREICHE.filter((b) => inVorlage('haushalt', b.pfad)).map((b) => b.pfad).filter((p) => p !== 'vollexport');
    assert.deepEqual(ansichtAus('haushalt', [...an, 'demo']), { vorlage: 'haushalt', ein: ['demo'], aus: ['vollexport'] });
  });

  it('liest nur bekannte Bereiche und gültige Vorlagen', () => {
    assert.equal(liesAnsicht(null), null);
    assert.deepEqual(liesAnsicht({ vorlage: 'quatsch', ein: ['demo', 'gibtsnicht', 'demo', 3], aus: 'x' }), { vorlage: 'alles', ein: ['demo'], aus: [] });
    assert.deepEqual(liesEigene({ ein: ['technik', '../x'] }), { ein: ['technik'] });
    assert.deepEqual(liesEigene(undefined), { ein: [] });
  });
});

describe('Werkbank-Ansicht: Dienst', () => {
  const neu = () => new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });

  it('ohne Einstellung bleibt alles sichtbar', async () => {
    const s = await neu().werkbankAnsicht(ICH);
    assert.deepEqual(s.installation, OHNE_EINSTELLUNG);
    assert.equal(s.eingestellt, false);
    assert.deepEqual(s.eigene, { ein: [] });
  });

  it('Installation gilt für alle, eigene Ergänzungen nur für einen Administrator', async () => {
    const d = neu();
    await d.setzeWerkbankAnsicht(ICH, { installation: { vorlage: 'haushalt', ein: [], aus: [] }, eigene: { ein: ['protokoll'] } });
    const ich = await d.werkbankAnsicht(ICH);
    const du = await d.werkbankAnsicht(DU);
    assert.equal(ich.eingestellt, true);
    assert.equal(ich.installation.vorlage, 'haushalt');
    assert.deepEqual(ich.eigene.ein, ['protokoll']);
    assert.deepEqual(du.eigene.ein, []);
    assert.equal(du.installation.vorlage, 'haushalt');
    // Nur die eigene Ansicht ändern lässt die Installation unberührt.
    await d.setzeWerkbankAnsicht(DU, { eigene: { ein: ['demo'] } });
    assert.equal((await d.werkbankAnsicht(ICH)).installation.vorlage, 'haushalt');
    assert.deepEqual((await d.werkbankAnsicht(DU)).eigene.ein, ['demo']);
    // Leere eigene Ansicht wird gelöscht.
    await d.setzeWerkbankAnsicht(ICH, { eigene: { ein: [] } });
    assert.deepEqual((await d.werkbankAnsicht(ICH)).eigene.ein, []);
  });

  it('Administrator ohne Id (z. B. aus der Umgebung) wird über die E-Mail-Adresse unterschieden', async () => {
    const d = neu();
    await d.setzeWerkbankAnsicht({ id: null, email: 'env@example.org' }, { eigene: { ein: ['technik'] } });
    assert.deepEqual((await d.werkbankAnsicht({ id: null, email: 'env@example.org' })).eigene.ein, ['technik']);
  });

  it('lehnt Unbrauchbares ab', async () => {
    await assert.rejects(neu().setzeWerkbankAnsicht(ICH, { installation: 'haushalt' }), (e: unknown) => e instanceof Fachfehler && e.status === 422);
  });
});
