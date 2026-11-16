/**
 * Sprachdateien und Prettier (#1280): Die Sprachdateien unter `shared/src/sprachen/` formatiert Prettier mit – das
 * ist nur in Ordnung, solange dabei jeder Wert gleich bleibt (Bedingung Sicherheit). Der Test formatiert jede Datei
 * mit den Einstellungen des Projekts und vergleicht die gelesenen Werte vorher und nachher. Ändert ein neuer
 * Prettier daran etwas, gehören die Sprachdateien in `.prettierignore`.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { format, getFileInfo, resolveConfig } from 'prettier';

const WURZEL = new URL('../..', import.meta.url).pathname;
const SPRACHEN = join(WURZEL, 'shared/src/sprachen');

function jsonDateien(ordner: string): string[] {
  return readdirSync(ordner, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsonDateien(join(ordner, e.name)) : e.name.endsWith('.json') ? [join(ordner, e.name)] : [],
  );
}

describe('Sprachdateien mit Prettier (#1280)', () => {
  const dateien = jsonDateien(SPRACHEN);

  it('es gibt Sprachdateien, und Prettier formatiert sie (nicht in .prettierignore)', async () => {
    assert.ok(dateien.length > 30, `nur ${dateien.length} Sprachdateien gefunden`);
    const info = await getFileInfo(dateien[0], { ignorePath: join(WURZEL, '.prettierignore') });
    assert.equal(info.ignored, false);
  });

  it('nach dem Formatieren stehen in jeder Sprachdatei genau dieselben Werte', async () => {
    for (const datei of dateien) {
      const text = readFileSync(datei, 'utf8');
      const optionen = await resolveConfig(datei);
      const formatiert = await format(text, { ...optionen, filepath: datei });
      assert.deepEqual(JSON.parse(formatiert), JSON.parse(text), relative(WURZEL, datei));
    }
  });
});
