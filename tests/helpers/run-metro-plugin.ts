/**
 * Drive the metro plugin's serializer the way Metro would, in a process of its
 * own whose cwd is the fixture repository.
 *
 * A process of its own for two reasons: the plugin reads process.cwd(), and it
 * warns once per PROCESS (version-manager-70i.11, W5), so every run needs fresh
 * module state for that count to mean anything.
 *
 * metro is not installed in this repository. The plugin only requires
 * metro/src/lib/bundleToString when no customSerializer is given, so a stub
 * serializer is always passed and nothing here needs metro.
 *
 * Usage: bun tests/helpers/run-metro-plugin.ts <calls>
 * Prints one JSON line per call: {"bundle": <what the serializer returned>}.
 */
import {withVersionManager} from '../../src/metro-plugin';

/** What the stub serializer returns, so a test can see it was really called. */
export const STUB_BUNDLE = 'STUB BUNDLE';

/**
 * @throws If the argument is not a positive whole number. Number('') is 0, so
 *   a missing or empty argument must not quietly mean "call it zero times".
 */
function parseCallCount(raw: string | undefined): number {
  const count = raw === undefined ? NaN : Number(raw);

  if (raw === undefined || raw.trim() === '' || !Number.isInteger(count)) {
    throw new Error(
      `Expected a whole number of calls, got ${JSON.stringify(raw)}`,
    );
  }

  if (count < 1) {
    throw new Error(`Expected at least one call, got ${count}`);
  }

  return count;
}

async function main(): Promise<void> {
  const calls = parseCallCount(process.argv[2]);

  const config = withVersionManager({
    serializer: {customSerializer: () => STUB_BUNDLE},
  });

  const serializer = config.serializer?.customSerializer;
  if (serializer === undefined) {
    throw new Error('withVersionManager() returned no customSerializer');
  }

  for (let call = 0; call < calls; call++) {
    const bundle = await serializer('index.js', [], {}, {});
    console.log(JSON.stringify({bundle}));
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
