import {DynamicVersionSchema} from './types';

// Re-export types for consumer convenience
export type {DynamicVersion, GenerationTrigger} from './types';

/**
 * Validate and parse dynamic version data from imported JSON
 *
 * @param version - Raw imported dynamic-version.local.json data
 * @returns Validated DynamicVersion object
 * @throws ZodError if validation fails
 *
 * @example
 * ```typescript
 * import rawVersion from './dynamic-version.local.json';
 * import { validateDynamicVersion } from '@justinhaaheim/version-manager';
 *
 * const version = validateDynamicVersion(rawVersion);
 * console.log(version.codeVersion); // e.g., "1.2.3"
 * ```
 */
export function validateDynamicVersion(version: unknown) {
  return DynamicVersionSchema.parse(version);
}
