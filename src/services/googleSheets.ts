import type {ParsedDataRow} from '@/types/medication';

import axios, {isAxiosError} from 'axios';

import {devStore} from '@/store/devStore';

import {googleSignInService} from './googleSignIn';

const SHEETS_API_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface GoogleSheetsConfig {
  headerRowIndex: number;
  range: string;
  spreadsheetId: string;
}

export const googleSheetsService = {
  extractSpreadsheetId(url: string): string | null {
    // Extract spreadsheet ID from Google Sheets URL
    const match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url);
    return match ? match[1] : null;
  },

  async fetchSpreadsheetData(
    config: GoogleSheetsConfig,
    hasRetried = false,
  ): Promise<ParsedDataRow[] | null> {
    const requestId = Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();

    devStore.logQueryLifecycle(
      `[Service ${requestId}] fetchSpreadsheetData called`,
      {
        config,
        hasRetried,
      },
    );

    try {
      // Always get fresh tokens - the SDK will handle refreshing if needed
      const tokenStartTime = Date.now();
      devStore.setRequestStatus('Getting access token...', 'info');

      const tokens = await googleSignInService.getTokens();
      const accessToken = tokens.accessToken;
      const tokenElapsed = Date.now() - tokenStartTime;

      devStore.logQueryLifecycle(`[Service ${requestId}] Got tokens`, {
        hasAccessToken: !!accessToken,
        tokenElapsedMs: tokenElapsed,
        tokenLength: accessToken?.length,
      });

      if (!accessToken) {
        devStore.logQueryLifecycle(
          `[Service ${requestId}] No access token available`,
        );
        devStore.setRequestStatus('No access token available', 'error');
        return null;
      }

      try {
        const url = `${SHEETS_API_BASE_URL}/${config.spreadsheetId}/values/${config.range}`;

        devStore.logQueryLifecycle(
          `[Service ${requestId}] Making API request`,
          {
            elapsedSoFar: Date.now() - startTime,
            url,
          },
        );
        devStore.setRequestStatus(
          'Sending request to Google Sheets API...',
          'info',
        );

        const apiStartTime = Date.now();
        const response = await axios.get<{values?: string[][]}>(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 30000, // 30 second timeout
        });
        const apiElapsed = Date.now() - apiStartTime;

        devStore.logQueryLifecycle(
          `[Service ${requestId}] API response received`,
          {
            apiElapsedMs: apiElapsed,
            firstRow: response.data?.values?.[0],
            hasData: !!response.data,
            hasValues: !!response.data?.values,
            status: response.status,
            totalElapsedMs: Date.now() - startTime,
            valuesLength: response.data?.values?.length,
          },
        );
        devStore.setRequestStatus(
          `API response received in ${apiElapsed}ms`,
          'success',
        );

        if (response.data?.values) {
          const parseStartTime = Date.now();
          const parsedData = this.parseSheetData(response.data.values, config);
          const parseElapsed = Date.now() - parseStartTime;

          devStore.logQueryLifecycle(`[Service ${requestId}] Data parsed`, {
            firstParsedRows: parsedData.slice(0, 3),
            parseElapsedMs: parseElapsed,
            parsedLength: parsedData.length,
            totalElapsedMs: Date.now() - startTime,
          });
          devStore.setRequestStatus(
            `Parsed ${parsedData.length} rows in ${parseElapsed}ms`,
            'success',
          );
          return parsedData;
        }

        devStore.logQueryLifecycle(
          `[Service ${requestId}] No values in response, returning empty array`,
        );
        devStore.setRequestStatus('No data in spreadsheet', 'info');
        return [];
      } catch (error) {
        const elapsed = Date.now() - startTime;
        const errorDetails = {
          elapsedMs: elapsed,
          error,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          isAxiosError: isAxiosError(error),
          isNetworkError: isAxiosError(error) && !error.response,
          isTimeout: isAxiosError(error) && error.code === 'ECONNABORTED',
          status: isAxiosError(error) ? error.response?.status : undefined,
        };

        devStore.logQueryLifecycle(
          `[Service ${requestId}] API request error`,
          errorDetails,
        );

        if (errorDetails.isTimeout) {
          devStore.setRequestStatus(
            `Request timed out after ${elapsed}ms`,
            'error',
          );
        } else if (errorDetails.isNetworkError) {
          devStore.setRequestStatus(
            `Network error after ${elapsed}ms`,
            'error',
          );
        } else {
          devStore.setRequestStatus(
            `API error (${errorDetails.status}) after ${elapsed}ms`,
            'error',
          );
        }

        if (isAxiosError(error) && error.response?.status === 401) {
          devStore.logQueryLifecycle(
            `[Service ${requestId}] 401 error - token may be expired`,
          );
          devStore.setRequestStatus(
            'Authentication error - token expired',
            'error',
          );

          if (!hasRetried) {
            devStore.logQueryLifecycle(
              `[Service ${requestId}] Attempting token refresh and retry`,
            );
            devStore.setRequestStatus('Refreshing authentication...', 'retry');
            // Let TanStack Query handle the retry with fresh tokens
            throw error;
          } else {
            devStore.logQueryLifecycle(
              `[Service ${requestId}] Already retried token refresh, aborting to prevent infinite recursion`,
            );
            throw error;
          }
        }

        devStore.logQueryLifecycle(
          `[Service ${requestId}] Failed to fetch spreadsheet data`,
          {
            error: error instanceof Error ? error.message : error,
            totalElapsedMs: Date.now() - startTime,
          },
        );
        throw error;
      }
    } catch (tokenError) {
      const elapsed = Date.now() - startTime;
      devStore.logQueryLifecycle(
        `[Service ${requestId}] Failed to get access token`,
        {
          elapsedMs: elapsed,
          error: tokenError instanceof Error ? tokenError.message : tokenError,
        },
      );
      devStore.setRequestStatus(`Token error after ${elapsed}ms`, 'error');
      throw tokenError;
    }
  },

  getDefaultRange(): string {
    // Default to fetching all data from the first sheet. Omitting the sheet name defaults to the first sheet
    return 'A:ZZZ';
  },

  parseSheetData(
    values: string[][],
    config: GoogleSheetsConfig,
  ): ParsedDataRow[] {
    devStore.logQueryLifecycle('[parseSheetData] called', {
      firstRow: values[0],
      headerRowIndex: config.headerRowIndex,
      secondRow: values[1],
      valuesLength: values.length,
    });

    // Check if we have enough rows to include the header and at least one data row
    if (values.length <= config.headerRowIndex) {
      devStore.logQueryLifecycle(
        '[parseSheetData] Not enough rows to parse (headerRowIndex >= values.length)',
        {headerRowIndex: config.headerRowIndex, valuesLength: values.length},
      );
      return [];
    }

    const headers = values[config.headerRowIndex];
    const rows = values.slice(config.headerRowIndex + 1);

    devStore.logQueryLifecycle('[parseSheetData] Parsing sheet data', {
      firstDataRow: rows[0],
      headers,
      rowCount: rows.length,
    });

    const parsedRows = rows.map((row) => {
      const parsedRow: ParsedDataRow = {};
      headers.forEach((header, index) => {
        parsedRow[header] = row[index] ?? '';
      });
      return parsedRow;
    });

    console.debug('[googleSheetsService] Sheet data parsed', {
      firstParsedRow: parsedRows[0],
      parsedRowCount: parsedRows.length,
    });

    return parsedRows;
  },
};
