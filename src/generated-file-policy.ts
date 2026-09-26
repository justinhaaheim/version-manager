import type {DynamicVersion, VersionMode} from './types';

import {writeFileSync} from 'fs';

import {VERSION_LOG_FILENAME} from './event-log';
import {generateTypeDefinitions} from './version-generator';

/**
 * Where the generated version file goes when the user did not say.
 *
 * This lives here rather than in the yargs option definition on purpose: with
 * a yargs `default`, "the user typed --output" and "nobody typed anything"
 * arrive at the handler as the same string and become indistinguishable.
 * See resolveOutputPathOption().
 */
export const DEFAULT_OUTPUT_PATH = './dynamic-version.local.json';

/**
 * The --output option plus the one thing the path alone cannot tell us:
 * whether a human asked for it.
 */
export interface OutputPathOption {
  /** True only when --output/-o named a path on the command line. */
  explicit: boolean;
  /** The path to write to if a write happens at all. */
  path: string;
}

/**
 * Turn the parsed value of --output into an OutputPathOption.
 *
 * The empty string is treated as absent, not as a path. `--output` typed with
 * no value after it parses to '', and the only thing writing to '' can do is
 * throw ENOENT. MEASURED, not assumed: before the yargs `default` was removed,
 * that same invocation fell back to the default path and wrote the file with
 * exit 0, so mapping '' to the default is what keeps dynamic-file mode
 * behaving exactly as it did.
 *
 * @param parsedOutput - yargs' value for --output: `undefined` when the flag
 *   was absent (the option deliberately declares no yargs `default`)
 */
export function resolveOutputPathOption(
  parsedOutput: string | undefined,
): OutputPathOption {
  if (parsedOutput === undefined || parsedOutput === '') {
    return {explicit: false, path: DEFAULT_OUTPUT_PATH};
  }

  return {explicit: true, path: parsedOutput};
}

/**
 * THE decision, made in exactly one place (version-manager-70i.2, D12).
 *
 * package-json mode exists to deliver the dynamic-version effect WITHOUT
 * dynamic-version.local.json: the file is gitignored, so CI has to regenerate
 * it (which needs .git) and Expo EAS builds cannot produce it at all. So in
 * that mode nothing is written — unless the user explicitly passed --output,
 * which is unambiguous intent and is honoured.
 *
 * event-log mode (version-manager-cza) answers the same way and for the same
 * reason: the committed version.jsonl is the deliverable, the version is
 * derived from it on demand by src/version-reader.ts, and a generated file
 * would be a second, staleable copy of a number this mode deliberately never
 * stores. An explicit --output is still honoured — unambiguous intent.
 *
 * dynamic-file mode is unchanged: it always writes.
 *
 * Both the CLI path (generateVersionFile) and the hook paths call this, so
 * they cannot drift apart.
 */
export function shouldWriteGeneratedFiles(
  versionMode: VersionMode,
  output: OutputPathOption,
): boolean {
  if (versionMode === 'package-json' || versionMode === 'event-log') {
    return output.explicit;
  }

  return true;
}

/**
 * Why nothing was written, and where to look instead (version-manager-70i.11,
 * W3 and W5).
 *
 * The watcher and the metro plugin both decline to write in a mode that has no
 * generated file. Declining silently would leave someone who configured them
 * waiting for a file that never appears, so every refusal names the mode and
 * says where the version is. This is wording only: the decision itself is
 * shouldWriteGeneratedFiles(), above.
 */
export function describeNoGeneratedFile(versionMode: VersionMode): string {
  switch (versionMode) {
    case 'event-log':
      return `versionMode is "event-log", which writes no dynamic-version.local.json. The version is derived from ${VERSION_LOG_FILENAME}: read it with readVersion() from @justinhaaheim/version-manager/version-reader.`;
    case 'package-json':
      return 'versionMode is "package-json", which writes no dynamic-version.local.json. The version lives in the committed "version" field of package.json.';
    case 'dynamic-file':
      // Unreachable while shouldWriteGeneratedFiles() always writes in this
      // mode. Worded so that it stays true if that ever changes.
      return `versionMode is "dynamic-file", which does write ${DEFAULT_OUTPUT_PATH}, but nothing was written this time.`;
  }
}

/**
 * What writeGeneratedFiles() actually wrote.
 *
 * `null` means "deliberately not written", never "the write failed": a failed
 * write throws out of writeFileSync rather than being reported as a null path.
 * Consumers use these paths to report what happened, so a null must not be
 * rendered as a successful write.
 */
export interface GeneratedFileWriteResult {
  dtsPath: string | null;
  jsonPath: string | null;
}

/**
 * Write the generated version file (and its .d.ts) if the mode calls for it.
 *
 * @param options.generateTypes - Whether the .d.ts companion is wanted
 * @param options.output - Resolved --output option
 * @param options.versionData - The computed version data to serialise
 * @param options.versionMode - versionMode from version-manager.json
 * @returns The paths written, or nulls when this mode writes nothing
 */
export function writeGeneratedFiles(options: {
  generateTypes: boolean;
  output: OutputPathOption;
  versionData: DynamicVersion;
  versionMode: VersionMode;
}): GeneratedFileWriteResult {
  const {generateTypes, output, versionData, versionMode} = options;

  if (!shouldWriteGeneratedFiles(versionMode, output)) {
    return {dtsPath: null, jsonPath: null};
  }

  writeFileSync(output.path, JSON.stringify(versionData, null, 2) + '\n');

  if (!generateTypes) {
    return {dtsPath: null, jsonPath: output.path};
  }

  const dtsPath = generateTypeDefinitions(
    output.path,
    Object.keys(versionData.versions),
  );

  return {dtsPath, jsonPath: output.path};
}
