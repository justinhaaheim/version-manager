/**
 * Run `fn` with process.cwd() set to `directory`, and put the previous cwd
 * back whatever happens.
 *
 * Several functions in src/ read process.cwd() rather than taking a path
 * (generateFileBasedVersion() among them), so calling them in-process against
 * a fixture repository means changing the cwd. The finally block is the whole
 * point: a test that fails half way must not leave every later test running
 * in a deleted temp directory.
 */
export async function inDirectory<T>(
  directory: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = process.cwd();
  process.chdir(directory);

  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}
