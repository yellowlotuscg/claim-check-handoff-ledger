import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Ajv2020, { JSONSchemaType, ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { Handoff } from './types';

const schemaPath = resolve(__dirname, '..', 'schemas', 'handoff.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as JSONSchemaType<Handoff>;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateFn: ValidateFunction<Handoff> = ajv.compile(schema);

export function validateHandoff(value: unknown): asserts value is Handoff {
  if (!validateFn(value)) {
    const details = (validateFn.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ');
    throw new Error(`Invalid handoff: ${details}`);
  }
}

export function isValidHandoff(value: unknown): value is Handoff {
  return validateFn(value) as boolean;
}
