/**
 * Parses a Google Sheets URL and extracts the spreadsheet ID
 *
 * @param url - The Google Sheets URL
 * @returns The spreadsheet ID if valid, null otherwise
 *
 * @example
 * parseSpreadsheetId('https://docs.google.com/spreadsheets/d/1abc123/edit')
 * // returns '1abc123'
 */
export function parseSpreadsheetId(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Remove any whitespace
  const trimmedUrl = url.trim();

  // Regex to extract spreadsheet ID from Google Sheets URL
  // Matches: /spreadsheets/d/{SPREADSHEET_ID}/
  // The ID can contain alphanumeric characters, hyphens, and underscores
  const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
  const match = regex.exec(trimmedUrl);

  if (match?.[1]) {
    // Google Sheets IDs are typically 44 characters long, but can vary
    // We'll accept any ID that's at least 15 characters to be safe
    const id = match[1];
    if (id.length >= 15) {
      return id;
    }
  }

  return null;
}

/**
 * Validates if a URL is a valid Google Sheets URL
 *
 * @param url - The URL to validate
 * @returns True if valid Google Sheets URL, false otherwise
 */
export function isValidGoogleSheetsUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmedUrl = url.trim();

  // Check if it's a Google Sheets URL
  if (!trimmedUrl.includes('docs.google.com/spreadsheets')) {
    return false;
  }

  // Try to parse the ID
  const id = parseSpreadsheetId(trimmedUrl);
  return id !== null;
}
