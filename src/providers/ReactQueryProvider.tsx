import type {ReactNode} from 'react';

import {
  QueryClient,
  type QueryClientConfig,
  QueryClientProvider,
} from '@tanstack/react-query';
import React from 'react';

// Configure retry logic with exponential backoff
const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    mutations: {
      retry: false, // Don't retry mutations by default
    },
    queries: {
      // Cache time: How long to keep data in cache after component unmounts
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
      // Don't refetch on reconnect automatically (user can pull to refresh)
      refetchOnReconnect: false,
      // Refetch on window focus (good for mobile apps)
      refetchOnWindowFocus: true,
      // Retry configuration
      retry: (failureCount, error: unknown) => {
        const errorWithResponse = error as {
          code?: string;
          response?: {status?: number};
        };
        // For 401 errors, retry once (token might just need refreshing)
        if (errorWithResponse?.response?.status === 401) {
          return failureCount < 1;
        }
        // Retry up to 3 times for 429 (rate limit) and network errors
        if (
          errorWithResponse?.response?.status === 429 ||
          errorWithResponse?.code === 'NETWORK_ERROR'
        ) {
          return failureCount < 3;
        }
        // Default: retry once for other errors
        return failureCount < 1;
      },
      // Exponential backoff delay
      retryDelay: (attemptIndex, error: unknown) => {
        // Check for Retry-After header (Google Sheets API may send this)
        const errorWithHeaders = error as {
          response?: {
            headers?: {'retry-after'?: string};
          };
        };
        const retryAfter = errorWithHeaders?.response?.headers?.['retry-after'];
        if (retryAfter) {
          // Retry-After can be in seconds or a date string
          const delaySeconds = Number.isNaN(Number(retryAfter))
            ? Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000)
            : Number(retryAfter);
          return delaySeconds * 1000; // Convert to milliseconds
        }
        // Exponential backoff: 1s, 2s, 4s
        return Math.min(1000 * 2 ** attemptIndex, 30000);
      },
      // Stale time: How long until data is considered stale
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
};

// Create a client instance
const queryClient = new QueryClient(queryClientConfig);

interface ReactQueryProviderProps {
  children: ReactNode;
}

export function ReactQueryProvider({children}: ReactQueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
