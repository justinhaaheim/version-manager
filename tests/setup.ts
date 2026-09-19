import {setDefaultTimeout} from 'bun:test';

/**
 * Raise the per-test timeout for the whole suite.
 *
 * Bun's default is 5000ms. Most of this suite's integration tests build a real
 * git repository in a temp directory and shell out to git — and, in the install
 * tests, to a package manager. Under full-suite load those routinely take
 * longer than 5s, so tests that pass in isolation report as failures when the
 * suite runs in parallel: four runs of one unchanged tree produced 8, 9, 10 and
 * 16 failures, and every extra failure landed between 5008ms and 5659ms.
 *
 * A gate that returns a different answer each time is not a gate. 30s is far
 * above the slowest honest test here (~7s) and still low enough that a genuine
 * hang fails rather than runs forever.
 *
 * Individual tests may still set their own timeout; an explicit one wins.
 *
 * Wired in via the `[test] preload` entry in bunfig.toml, so it applies to
 * `bun test` however it is invoked, not only through the package.json script.
 */
setDefaultTimeout(30_000);
