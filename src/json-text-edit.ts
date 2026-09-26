/**
 * Surgical, string-level edits to JSON text.
 *
 * WHY NOT JSON.parse + JSON.stringify (version-manager-70i.3, D9): the
 * pre-commit hook rewrites a package.json that may be half-edited in the
 * working tree. A parse-and-re-stringify reformats the whole file —
 * indentation, key order, blank lines, trailing newline — which destroys
 * exactly the unstaged work this change exists to protect. So the version
 * VALUE is replaced in place and every other byte of the file is left alone.
 *
 * WHY NOT A REGEX: `"version"` is not unique in a package.json. It appears
 * inside nested objects (a dependency literally named `version` exists on
 * npm; `overrides`, `pnpm`, `volta` and lockfile-ish blocks all nest freely),
 * and a regex has no idea which one is the top-level key. The scanner below
 * tracks brace depth so only a key at depth 1 — a direct property of the root
 * object — can match.
 */

/** A half-open [start, end) range of `text`, including the quote characters. */
export interface JsonTextSpan {
  /** Index one past the value's closing quote. */
  end: number;
  /** Index of the value's opening quote. */
  start: number;
}

/**
 * Read one JSON string literal starting at its opening quote.
 *
 * The returned `value` is only ever used to compare against a known key name,
 * so escape sequences are kept verbatim rather than decoded: a key written as
 * "version" therefore fails to match "version". That is deliberate — the
 * consequence is "key not found", which callers must already handle loudly,
 * and never a wrong edit at a wrong offset.
 *
 * @param text - The full JSON text
 * @param start - Index of the opening quote
 * @returns The index one past the closing quote, and the raw inner text
 * @throws If the literal is never closed
 */
function readStringLiteral(
  text: string,
  start: number,
): {end: number; value: string} {
  let index = start + 1;
  let value = '';

  while (index < text.length) {
    const char = text[index];

    if (char === '\\') {
      value += text.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (char === '"') {
      return {end: index + 1, value};
    }

    value += char;
    index += 1;
  }

  throw new Error(
    `Unterminated string literal in JSON text at offset ${start}`,
  );
}

/** Index of the first non-whitespace character at or after `start`. */
function skipWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }
  return index;
}

/**
 * Locate the value of a top-level string property in JSON text.
 *
 * @param text - JSON text (an object at the root)
 * @param key - The property name to find, compared literally
 * @returns The span of the value token, or null when the root object has no
 *   such property OR its value is not a string. Null is "not found", never
 *   "could not look": malformed text throws instead.
 * @throws If a string literal in `text` is unterminated
 */
export function findTopLevelStringValueSpan(
  text: string,
  key: string,
): JsonTextSpan | null {
  let depth = 0;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === '"') {
      const literal = readStringLiteral(text, index);
      const afterLiteral = skipWhitespace(text, literal.end);

      // A string followed by ':' is an object key; anything else is a value.
      // In well-formed JSON a value is followed by ',', '}' or ']', so this
      // cannot misread a value as a key.
      const isKey = text[afterLiteral] === ':';

      if (isKey && depth === 1 && literal.value === key) {
        const valueStart = skipWhitespace(text, afterLiteral + 1);

        if (text[valueStart] !== '"') {
          // Present, but not a string (null, a number, an object). Callers
          // must not guess at what to do with it.
          return null;
        }

        return {
          end: readStringLiteral(text, valueStart).end,
          start: valueStart,
        };
      }

      index = literal.end;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;
    }

    index += 1;
  }

  return null;
}

/**
 * Add a string property at the END of the root object, touching nothing else
 * (version-manager-70i.7, M2).
 *
 * The new property copies the file's own layout: the whitespace that precedes
 * the last top-level key, and the spacing around that key's colon. So a
 * 4-space file gains a 4-space line, a tab-indented file a tab-indented one,
 * and a single-line object stays on one line. An empty object gets a
 * two-space line of its own.
 *
 * @param text - JSON text with an object at the root
 * @param key - The property name to add
 * @param value - The string value, JSON-escaped on the way in
 * @returns The edited text
 * @throws If the root is not an object, a string literal is unterminated, the
 *   root object is never closed, or `key` is ALREADY a top-level property —
 *   use replaceTopLevelStringValue() for that; adding a second copy would
 *   leave JSON.parse reading whichever came last
 */
export function appendTopLevelStringProperty(
  text: string,
  key: string,
  value: string,
): string {
  const open = skipWhitespace(text, 0);

  if (text[open] !== '{') {
    throw new Error('The JSON text does not have an object at its root');
  }

  let depth = 0;
  let index = open;
  let close: number | null = null;
  // The '{' or ',' that precedes the top-level key seen most recently.
  let lastDelimiter = open;
  let lastKey: {
    delimiter: number;
    end: number;
    start: number;
    valueStart: number;
  } | null = null;

  while (index < text.length) {
    const char = text[index];

    if (char === '"') {
      const literal = readStringLiteral(text, index);
      const afterLiteral = skipWhitespace(text, literal.end);

      if (depth === 1 && text[afterLiteral] === ':') {
        if (literal.value === key) {
          throw new Error(
            `"${key}" is already a top-level property; replace its value instead of adding another`,
          );
        }

        lastKey = {
          delimiter: lastDelimiter,
          end: literal.end,
          start: index,
          valueStart: skipWhitespace(text, afterLiteral + 1),
        };
      }

      index = literal.end;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    } else if (char === ',' && depth === 1) {
      lastDelimiter = index;
    }

    index += 1;
  }

  if (close === null) {
    throw new Error(
      'The JSON text has an object at its root that never closes',
    );
  }

  const property = (leading: string, colon: string): string =>
    `${leading}${JSON.stringify(key)}${colon}${JSON.stringify(value)}`;

  if (lastKey === null) {
    return (
      text.slice(0, open + 1) +
      property('\n  ', ': ') +
      '\n' +
      text.slice(close)
    );
  }

  // Everything between the preceding '{' or ',' and the last key: the
  // newline-plus-indent of a multi-line file, or the space of a one-line one.
  const precedingWhitespace = text.slice(lastKey.delimiter + 1, lastKey.start);
  const leading = precedingWhitespace === '' ? ' ' : precedingWhitespace;
  const colon = text.slice(lastKey.end, lastKey.valueStart);

  // Directly after the last value, so the whitespace before the closing brace
  // (and whatever follows it) stays exactly where it was.
  let endOfLastValue = close;
  while (endOfLastValue > open && /\s/.test(text[endOfLastValue - 1])) {
    endOfLastValue -= 1;
  }

  return (
    text.slice(0, endOfLastValue) +
    ',' +
    property(leading, colon) +
    text.slice(endOfLastValue)
  );
}

/**
 * Replace the value of a top-level string property, touching nothing else.
 *
 * @param text - JSON text (an object at the root)
 * @param key - The property whose value to replace
 * @param newValue - The replacement, JSON-escaped on the way in
 * @returns The edited text, or null when the property is absent from the root
 *   object or does not hold a string
 * @throws If a string literal in `text` is unterminated
 */
export function replaceTopLevelStringValue(
  text: string,
  key: string,
  newValue: string,
): string | null {
  const span = findTopLevelStringValueSpan(text, key);

  if (span === null) {
    return null;
  }

  return (
    text.slice(0, span.start) + JSON.stringify(newValue) + text.slice(span.end)
  );
}
