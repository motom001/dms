/** Alle OpenAPI-Schemas (#1278): die Teile aus `schemas-*.ts` in der Reihenfolge der Beschreibung. */
import type { Schema } from './typen';
import { SCHEMAS_TYPEN } from './schemas-typen';
import { SCHEMAS_MAPPEN } from './schemas-mappen';
import { SCHEMAS_DETAILS } from './schemas-details';
import { SCHEMAS_POST } from './schemas-post';
import { SCHEMAS_BEARBEITEN } from './schemas-bearbeiten';
import { SCHEMAS_DATENSCHUTZ } from './schemas-datenschutz';
import { SCHEMAS_PAKETE } from './schemas-pakete';
import { SCHEMAS_KONTO } from './schemas-konto';

export const SCHEMAS: Record<string, Schema> = {
  ...SCHEMAS_TYPEN,
  ...SCHEMAS_MAPPEN,
  ...SCHEMAS_DETAILS,
  ...SCHEMAS_POST,
  ...SCHEMAS_BEARBEITEN,
  ...SCHEMAS_DATENSCHUTZ,
  ...SCHEMAS_PAKETE,
  ...SCHEMAS_KONTO,
};
