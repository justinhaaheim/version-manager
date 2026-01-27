# Restore readDynamicVersion Utility

## Current State

`reader.ts` currently exports:

- `validateDynamicVersion(version: unknown)` - validates already-imported data
- Re-exports for `DynamicVersion` and `GenerationTrigger` types

What's missing: A function that actually **reads** the file from disk.

## Analysis of the Approach

### Can a function in node_modules read a file in the project root?

**Yes, via `fs.readFileSync` + `process.cwd()`:**

- `path.join(process.cwd(), 'dynamic-version.local.json')` works at runtime
- `process.cwd()` returns where the Node process started (typically project root)

**No, via static imports:**

- `import from './dynamic-version.local.json'` won't work from node_modules
- Bundlers resolve imports at build time relative to the module's location
- A file in node_modules can't statically import a file in the project root

### Will bundlers hot reload?

**For files read via `fs.readFileSync`: NO**

- Metro/Vite/Webpack watch _imported_ files, not files read at runtime
- `fs.readFileSync` happens at runtime, bundler never sees it

**For files imported directly by the consumer: YES**

- `import version from './dynamic-version.local.json'` in consumer's code
- Bundler sees this import, tracks the file, triggers HMR on change

### The Two Use Cases

1. **Bundled apps (React Native, Vite, etc.)** - Want HMR
   - Consumer must import the JSON directly (bundler sees it)
   - Use `validateDynamicVersion()` to validate/type the imported data
   - This pattern already works!

2. **CLI tools / Build scripts / Server-side** - Don't need HMR
   - `readDynamicVersion()` reads from disk, validates, returns typed result
   - Convenient one-liner

## Recommendation

**Keep both patterns:**

1. `validateDynamicVersion(unknown)` - Already exists, for bundled apps
2. `readDynamicVersion(options?)` - Add this, for non-bundled use cases

The consumer docs should clearly explain:

- For HMR/bundled apps: Import JSON directly, use `validateDynamicVersion`
- For CLI/server: Use `readDynamicVersion()`

## Implementation Plan

1. Add `readDynamicVersion()` function to `reader.ts`
   - Reads from disk using `fs.readFileSync`
   - Uses `process.cwd()` to find project root
   - Optional `path` parameter to override location
   - Validates via existing `DynamicVersionSchema`
   - Returns typed `DynamicVersion`

2. Handle missing file gracefully
   - Throw descriptive error with instructions to run the CLI

3. Export the function

4. Update types.ts if needed (likely not)

5. Run `bun run signal` to check for issues

## Open Questions

- Should `readDynamicVersion` be synchronous or async?
  - Sync is simpler for most use cases (config reading)
  - Could offer both if there's demand

- Should there be a `readDynamicVersionSync` and `readDynamicVersion` (async)?
  - For now, just sync is fine - keep it simple

---

## Progress

- [x] Analyze current state
- [x] Document tradeoffs
- [ ] Get approval for plan
- [ ] Implement readDynamicVersion
- [ ] Run signal checks
- [ ] Commit and push
