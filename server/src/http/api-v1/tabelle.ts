/**
 * Die ganze Tabelle /api/v1 (#20): Aus ihr entstehen die Routen (`routen.ts`) und die OpenAPI-Beschreibung
 * (`openapi.ts`). Die Teile stehen je Bereich in `tabelle-*.ts` (#1278); die Reihenfolge hier ist die der Routen und
 * der Beschreibung.
 */
import type { V1 } from './typen';
import { V1_KONTO } from './tabelle-konto';
import { V1_MAPPEN } from './tabelle-mappen';
import { V1_POST } from './tabelle-post';
import { V1_DOKUMENTE } from './tabelle-dokumente';
import { V1_WERKBANK } from './tabelle-werkbank';

export const V1_TABELLE: V1[] = [...V1_KONTO, ...V1_MAPPEN, ...V1_POST, ...V1_DOKUMENTE, ...V1_WERKBANK];
