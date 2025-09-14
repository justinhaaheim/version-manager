import type {MedicationEntry} from '@/types/medication';
import type {QueryObserverResult} from '@tanstack/react-query';

import {useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo} from 'react';

import {useGoogleUser, useSheetsConfig} from '@/store/mainStore';
import {
  parseHealthLoggerData,
  transformToMedicationEntries,
} from '@/utils/medicationParser';

import {useGoogleSheetsData} from './useGoogleSheetsData';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface UseHealthLogDataReturn {
  error: string | null;
  isFetching: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: number | null;
  medicationData: MedicationEntry[];
  refresh: () => Promise<QueryObserverResult>;
}

export function useHealthLogData(): UseHealthLogDataReturn {
  const queryClient = useQueryClient();
  const sheetsConfig = useSheetsConfig();
  const googleUser = useGoogleUser();

  // Check authentication
  const isAuthenticated = googleUser !== null;

  // Use React Query hook for fetching data
  const {
    data: rawData,
    error,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useGoogleSheetsData(sheetsConfig, {
    enabled: Boolean(sheetsConfig) && isAuthenticated,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  // Process the data when available
  const medicationData = useMemo<MedicationEntry[]>(() => {
    if (!rawData) {
      return [];
    }

    console.debug('[useHealthLogData] Processing raw data', {
      firstRows: rawData.slice(0, 3),
      rawDataLength: rawData.length,
    });

    const parsedData = parseHealthLoggerData(rawData);
    console.debug('[useHealthLogData] After parseHealthLoggerData', {
      firstParsedRows: parsedData.slice(0, 3),
      parsedDataLength: parsedData.length,
    });

    const medicationEntries = transformToMedicationEntries(parsedData);
    console.debug('[useHealthLogData] After transformToMedicationEntries', {
      entriesLength: medicationEntries.length,
      medicationEntries,
      // firstEntries: medicationEntries.slice(0, 3),
    });

    return medicationEntries;
  }, [rawData]);

  // Compute error message
  const errorMessage = useMemo(() => {
    if (!isAuthenticated && sheetsConfig) {
      return 'Not authenticated. Please sign in.';
    }
    if (!sheetsConfig) {
      return 'No spreadsheet configured';
    }
    if (error) {
      return error.message || 'Failed to fetch data from Google Sheets';
    }
    return null;
  }, [isAuthenticated, sheetsConfig, error]);

  // Invalidate queries on sign out
  useEffect(() => {
    if (!isAuthenticated) {
      console.debug(
        '[useHealthLogData] Invalidating queries - not authenticated',
      );
      void queryClient.invalidateQueries({queryKey: ['googleSheets']});
    }
  }, [queryClient, isAuthenticated]);

  const returnValue = useMemo(
    () => ({
      error: errorMessage,
      isFetching,
      isLoading,
      isRefreshing: isFetching && !isLoading,
      lastUpdated: dataUpdatedAt === 0 ? null : dataUpdatedAt,
      medicationData,
      refresh: refetch,
    }),
    [
      dataUpdatedAt,
      errorMessage,
      isFetching,
      isLoading,
      medicationData,
      refetch,
    ],
  );

  return returnValue;
}
