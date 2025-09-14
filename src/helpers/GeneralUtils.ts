export function isNullishOrEmpty(
  value?: string | null,
): value is null | undefined | '' {
  return value == null || value.trim().length === 0;
}

export function emptyStringToNull(value?: string | null): string | null {
  return isNullishOrEmpty(value) ? null : value;
}
