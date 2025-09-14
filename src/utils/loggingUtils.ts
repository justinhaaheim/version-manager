export type BaseObject = Record<string, unknown>;
// type AL = ArrayLike<unknown>;

export function objectGetValueOfAllProperties(obj: unknown): unknown {
  if (Array.isArray(obj) || obj == null || typeof obj !== 'object') {
    return obj;
  }

  const result: BaseObject = {};

  Object.entries(obj).forEach(([key, value]) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    result[key] = value != null ? value?.toString() : value;
  });
  return result;
}
