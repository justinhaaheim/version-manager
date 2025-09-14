import type {ParsedDataRow} from '@/types/medication';

import {useQuery, type UseQueryResult} from '@tanstack/react-query';
import React from 'react';

import {
  type GoogleSheetsConfig,
  googleSheetsService,
} from '@/services/googleSheets';
import {devStore} from '@/store/devStore';

export interface UseGoogleSheetsDataOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

export function useGoogleSheetsData(
  config: GoogleSheetsConfig | null,
  options?: UseGoogleSheetsDataOptions,
): UseQueryResult<ParsedDataRow[], Error> {
  const isEnabled = Boolean(config) && (options?.enabled ?? true);

  const query = useQuery<ParsedDataRow[], Error>({
    enabled: isEnabled,
    queryFn: async () => {
      const startTime = Date.now();
      const queryId = Math.random().toString(36).substr(2, 9);

      devStore.logQueryLifecycle(`[${queryId}] queryFn executing`, {
        config,
      });
      devStore.setRequestStatus('Starting Google Sheets request...', 'start');

      if (!config) {
        devStore.logQueryLifecycle(
          `[${queryId}] No config provided, throwing error`,
        );
        devStore.setRequestStatus('No spreadsheet configured', 'error');
        throw new Error('No Google Sheets configuration provided');
      }

      devStore.logQueryLifecycle(`[${queryId}] Fetching spreadsheet data`, {
        config,
        range: config.range,
        spreadsheetId: config.spreadsheetId,
      });
      devStore.setRequestStatus('Fetching spreadsheet data...', 'info');

      try {
        const data = await googleSheetsService.fetchSpreadsheetData(config);
        const elapsed = Date.now() - startTime;

        devStore.logQueryLifecycle(`[${queryId}] Data fetched from service`, {
          data,
          dataLength: data?.length,
          dataReceived: data != null,
          elapsedMs: elapsed,
          firstRows: data?.slice(0, 3),
        });
        devStore.setRequestStatus(`Data fetched in ${elapsed}ms`, 'success');

        if (data == null) {
          devStore.logQueryLifecycle(
            `[${queryId}] Data is null, throwing error`,
          );
          devStore.setRequestStatus('Failed to fetch data', 'error');
          throw new Error('Failed to fetch spreadsheet data');
        }

        return data;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        devStore.logQueryLifecycle(`[${queryId}] Error in queryFn`, {
          elapsedMs: elapsed,
          error,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        });
        devStore.setRequestStatus(
          `Error after ${elapsed}ms: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
        throw error;
      }
    },
    queryKey: ['googleSheets', config?.spreadsheetId, config?.range],
    refetchInterval: options?.refetchInterval,
  });

  // Use React hooks for lifecycle monitoring
  React.useEffect(() => {
    if (query.isError && query.error) {
      const retryCount = query.failureCount - 1; // failureCount starts at 1
      devStore.logQueryLifecycle('Query error occurred', {
        error: query.error.message,
        retryCount,
        willRetry: retryCount < 3,
      });

      if (retryCount < 3) {
        devStore.setRequestStatus(
          `Error: ${query.error.message}. Retrying... (${retryCount + 1}/3)`,
          'retry',
        );
      } else {
        devStore.setRequestStatus(
          `Failed after 3 retries: ${query.error.message}`,
          'error',
        );
      }
    }
  }, [query.isError, query.error, query.failureCount]);

  React.useEffect(() => {
    if (query.isSuccess && query.data) {
      devStore.logQueryLifecycle('Query success', {
        dataLength: query.data.length,
        firstRow: query.data[0],
      });
      devStore.setRequestStatus(
        `Successfully loaded ${query.data.length} items`,
        'success',
      );

      // Clear status after a short delay
      const timer = setTimeout(() => {
        devStore.setRequestStatus('', 'info');
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [query.isSuccess, query.data]);

  return query;
}
