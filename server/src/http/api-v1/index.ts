/**
 * Öffentliche Schnittstelle /api/v1 (#20) – die Tür des Ordners (#1278, vorher die eine Datei `http/api-v1.ts`):
 *
 * - `typen.ts`, `parameter.ts`: Einträge der Tabelle und gemeinsame Parameter
 * - `tabelle-*.ts`: die Tabelle je Bereich, zusammengesetzt in `tabelle.ts`
 * - `routen.ts`: Routen /api/v1/… aus der Tabelle, Übergang der Post-Namen (#1042)
 * - `schema-hilfen.ts`, `schemas-*.ts`: OpenAPI-Schemas je Bereich, zusammengesetzt in `schemas.ts`
 * - `openapi.ts`: die OpenAPI-Beschreibung aus Tabelle und Schemas
 */
export { V1_TABELLE } from './tabelle';
export { mitAltenPostNamen, v1Routen, wer, type V1Uebergang } from './routen';
export { API_VERSION_OHNE_ANMELDUNG, openapi } from './openapi';
