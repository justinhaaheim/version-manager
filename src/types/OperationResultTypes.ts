// Generic result type
export type Result<T, E = Error> =
  | {data: T; success: true}
  | {error: E; success: false};

// Void result for operations that don't return data
export type VoidResult<E = Error> =
  | {success: true}
  | {error: E; success: false};

// Utility functions for unwrapping results
export function unwrapResult<T, E = Error>(result: Result<T, E>): T {
  if (result.success) return result.data;
  // Ensure error is an Error object
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(String(result.error));
}

// Utility functions for unwrapping results
export function unwrapResultNoThrow<T>(result: Result<T>): T | null {
  if (result.success) return result.data;
  return null;
}

export async function unwrapAsyncResult<T, E = Error>(
  resultPromise: Promise<Result<T, E>>,
): Promise<T> {
  const result = await resultPromise;
  return unwrapResult(result);
}

// For void results
export function unwrapVoidResult<E = Error>(result: VoidResult<E>): void {
  if (!result.success) {
    // Ensure error is an Error object
    if (result.error instanceof Error) {
      throw result.error;
    }
    throw new Error(String(result.error));
  }
  return;
}

export async function unwrapAsyncVoidResult<E = Error>(
  resultPromise: Promise<VoidResult<E>>,
): Promise<void> {
  const result = await resultPromise;
  return unwrapVoidResult(result);
}
