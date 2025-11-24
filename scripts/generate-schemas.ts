#!/usr/bin/env bun
/**
 * Generate JSON Schema files from Zod schemas
 * This script converts our runtime Zod schemas to JSON Schema format
 * for better IDE autocomplete and validation support
 */

import {mkdirSync, writeFileSync} from 'fs';
import {join} from 'path';
import {z} from 'zod';

import {DynamicVersionSchema, VersionManagerConfigSchema} from '../src/types';

const SCHEMAS_DIR = join(process.cwd(), 'schemas');

// Ensure schemas directory exists
mkdirSync(SCHEMAS_DIR, {recursive: true});

// Generate version-manager.json schema using Zod 4's native toJSONSchema()
const versionManagerSchema = z.toJSONSchema(
  VersionManagerConfigSchema,
) as Record<string, unknown>;

// Add metadata
const versionManagerSchemaWithMeta = {
  $id: 'https://raw.githubusercontent.com/justinhaaheim/version-manager/main/schemas/version-manager.schema.json',
  $schema: 'http://json-schema.org/draft-07/schema#',
  description:
    'Configuration file for @justinhaaheim/version-manager - controls version calculation mode and custom version types',
  title: 'Version Manager Configuration',
  ...versionManagerSchema,
};

writeFileSync(
  join(SCHEMAS_DIR, 'version-manager.schema.json'),
  JSON.stringify(versionManagerSchemaWithMeta, null, 2) + '\n',
);

console.log('✅ Generated schemas/version-manager.schema.json');

// Generate dynamic-version.local.json schema using Zod 4's native toJSONSchema()
const dynamicVersionSchema = z.toJSONSchema(DynamicVersionSchema) as Record<
  string,
  unknown
>;

// Add metadata
const dynamicVersionSchemaWithMeta = {
  $id: 'https://raw.githubusercontent.com/justinhaaheim/version-manager/main/schemas/dynamic-version.schema.json',
  $schema: 'http://json-schema.org/draft-07/schema#',
  description:
    'Auto-generated version file produced by @justinhaaheim/version-manager - contains computed versions and build metadata',
  title: 'Dynamic Version Output',
  ...dynamicVersionSchema,
};

writeFileSync(
  join(SCHEMAS_DIR, 'dynamic-version.schema.json'),
  JSON.stringify(dynamicVersionSchemaWithMeta, null, 2) + '\n',
);

console.log('✅ Generated schemas/dynamic-version.schema.json');
console.log('\n📦 JSON Schema files generated successfully!');
