import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export function buildAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}


