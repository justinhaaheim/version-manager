"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDynamicVersion = validateDynamicVersion;
const types_1 = require("./types");
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
function validateDynamicVersion(version) {
    return types_1.DynamicVersionSchema.parse(version);
}
//# sourceMappingURL=reader.js.map