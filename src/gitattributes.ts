import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

/**
 * Putting one line in .gitattributes, idempotently and without clobbering.
 *
 * The rules are the same whichever attribute is being written, and they are
 * conservative on purpose: .gitattributes is the user's file and encodes
 * their merge policy.
 *
 * - An existing file is APPENDED to, never rewritten or reordered.
 * - A path that already carries the attribute we want is left alone.
 * - A path that already carries a DIFFERENT value of the same attribute is
 *   left alone and REPORTED. Appending a second line would silently win (git
 *   takes the last match) and override a policy nobody asked us to change.
 *
 * src/merge-driver.ts has its own near-identical private copy of this for
 * `package.json merge=version-manager`; folding it onto this helper is filed
 * as its own bead rather than done here, so that a change to event-log mode
 * cannot break package-json mode's merge behaviour.
 */

export type GitAttributesOutcome =
  | 'added'
  | 'already-present'
  | 'claimed-by-another'
  | 'created';

/**
 * The line already in the file for this path and attribute name, if any.
 *
 * @param lines - The file, split on newlines
 * @param path - The pattern to look for, matched exactly
 * @param attributeName - e.g. 'merge'
 * @returns The trimmed line, or null when the path has no such attribute
 */
function findAttributeLine(
  lines: string[],
  path: string,
  attributeName: string,
): string | null {
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const [pattern, ...attributes] = trimmed.split(/\s+/);

    if (pattern !== path) {
      continue;
    }

    if (
      attributes.some((attribute) => attribute.startsWith(`${attributeName}=`))
    ) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Ensure `<path> <attributeName>=<attributeValue>` is in .gitattributes.
 *
 * @param options.attributeName - e.g. 'merge'
 * @param options.attributeValue - e.g. 'union'
 * @param options.comment - A comment line written above a newly added entry
 * @param options.cwd - The directory holding .gitattributes
 * @param options.path - The pattern the attribute applies to
 * @returns What was done, including the one case where nothing was
 * @throws If .gitattributes cannot be read or written
 */
export function ensureGitAttributesLine(options: {
  attributeName: string;
  attributeValue: string;
  comment: string;
  cwd: string;
  path: string;
}): GitAttributesOutcome {
  const {attributeName, attributeValue, comment, cwd, path} = options;

  const attributesPath = join(cwd, '.gitattributes');
  const wanted = `${path} ${attributeName}=${attributeValue}`;
  const block = `# ${comment}\n${wanted}\n`;

  if (!existsSync(attributesPath)) {
    writeFileSync(attributesPath, block);
    return 'created';
  }

  const content = readFileSync(attributesPath, 'utf-8');
  const existing = findAttributeLine(content.split('\n'), path, attributeName);

  if (existing !== null) {
    return existing.split(/\s+/).includes(`${attributeName}=${attributeValue}`)
      ? 'already-present'
      : 'claimed-by-another';
  }

  // A file that does not end in a newline would otherwise get our entry
  // glued onto its last line, which is both a wrong attribute line and a
  // corrupted one.
  const separator = content === '' || content.endsWith('\n') ? '' : '\n';

  writeFileSync(attributesPath, `${content}${separator}${block}`);

  return 'added';
}
