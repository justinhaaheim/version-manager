# Offline Support & Caching Plan for Health Logger

Date: 2025-08-24
Author: Claude 4 Sonnet

## Executive Summary

This plan introduces robust offline support and caching for the Health Logger app to ensure users ALWAYS have access to their recent medication data, even with poor connectivity. We'll implement a multi-layer caching strategy using React Query's built-in cache, AsyncStorage for persistence, and clear UI indicators for cache freshness.

## Core Requirements

1. **Always Available Data**: Users must ALWAYS be able to open the app and see recent medications
2. **Clear Communication**: Users need to know whether data is fresh or cached
3. **Graceful Degradation**: Handle connection issues without disrupting the user experience
4. **Smart Persistence**: Cache data survives app restarts and backgrounding

## Architecture Overview

### 1. Caching Layers

```
┌─────────────────────────────────────┐
│         User Interface              │
│    (Shows cached/fresh indicator)   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       React Query Cache             │
│   (In-memory, fast access)          │
│   • 10 min garbage collection       │
│   • 5 min stale time                │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      AsyncStorage Persistence       │
│   (Survives app restarts)           │
│   • Stores last successful fetch    │
│   • Includes metadata (timestamp)   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Google Sheets API                │
│   (Fresh data source)               │
└─────────────────────────────────────┘
```

### 2. Data Flow

1. **App Launch**:
   - Load cached data from AsyncStorage immediately
   - Display with "cached" indicator
   - Attempt fresh fetch in background
   - Update UI when fresh data arrives

2. **Normal Operation**:
   - React Query manages in-memory cache
   - Background refetches update both caches
   - UI always shows data source status

3. **Offline/Error Scenarios**:
   - Continue showing cached data
   - Display "offline" or "cached" badge
   - Retry fetches with exponential backoff
   - Queue actions for when connection returns

## Implementation Plan

### Phase 1: AsyncStorage Persistence Layer

#### 1.1 Create Cache Service

```typescript
// src/services/cacheService.ts
interface CachedData<T> {
  data: T;
  timestamp: number;
  version: string;
}

export const cacheService = {
  async save(key: string, data: any): Promise<void>,
  async load<T>(key: string): Promise<CachedData<T> | null>,
  async clear(key: string): Promise<void>,
  async getCacheAge(key: string): Promise<number | null>
}
```

#### 1.2 Extend Zustand Store

```typescript
// Add to mainStore.ts
interface MainStore {
  // New cache-related state
  cachedMedicationData: ParsedDataRow[] | null;
  cacheTimestamp: number | null;
  isUsingCache: boolean;
  connectionStatus: 'online' | 'offline' | 'unknown';

  actions: {
    // New cache actions
    loadCachedData: () => Promise<void>;
    saveCachedData: (data: ParsedDataRow[]) => Promise<void>;
    updateConnectionStatus: (status: ConnectionStatus) => void;
  };
}
```

### Phase 2: Integrate with React Query

#### 2.1 Modify useGoogleSheetsData Hook

```typescript
export function useGoogleSheetsData(config, options) {
  const {loadCachedData, saveCachedData} = useMainStoreActions();

  // Load cached data on mount
  useEffect(() => {
    loadCachedData();
  }, []);

  const query = useQuery({
    // Add initial data from cache
    initialData: () => {
      const cached = useMainStore((state) => state.cachedMedicationData);
      return cached || undefined;
    },

    // Modified query function
    queryFn: async () => {
      try {
        const data = await googleSheetsService.fetchSpreadsheetData(config);
        // Save to persistent cache on success
        await saveCachedData(data);
        return data;
      } catch (error) {
        // If offline, return cached data
        const cached = await cacheService.load('medicationData');
        if (cached) {
          return cached.data;
        }
        throw error;
      }
    },

    // Persist cache between sessions
    gcTime: Infinity, // Keep in memory indefinitely
    staleTime: 5 * 60 * 1000, // Consider stale after 5 minutes
  });
}
```

### Phase 3: Network Detection & Status

#### 3.1 Network Monitor Service

```typescript
// src/services/networkService.ts
import NetInfo from '@react-native-community/netinfo';

export const networkService = {
  initialize() {
    NetInfo.addEventListener((state) => {
      const status = state.isConnected ? 'online' : 'offline';
      useMainStore.getState().actions.updateConnectionStatus(status);
    });
  },

  async checkConnectivity(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
  },
};
```

#### 3.2 Smart Retry Logic

- Detect offline state and skip retries
- Queue failed mutations for replay
- Exponential backoff for connection issues
- Clear indication when retrying

### Phase 4: UI Indicators

#### 4.1 Data Freshness Badge

```typescript
// src/components/DataFreshnessIndicator.tsx
export function DataFreshnessIndicator() {
  const cacheTimestamp = useCacheTimestamp();
  const connectionStatus = useConnectionStatus();
  const isRefetching = useIsRefetching();

  // Calculate cache age
  const cacheAge = cacheTimestamp ? Date.now() - cacheTimestamp : null;

  // Determine indicator state
  if (connectionStatus === 'offline') {
    return <Badge variant="warning">Offline - Showing cached data</Badge>;
  }

  if (isRefetching) {
    return <Badge variant="info">Updating...</Badge>;
  }

  if (cacheAge && cacheAge > 60000) { // Over 1 minute old
    const ageText = formatDuration(cacheAge);
    return <Badge variant="subtle">Updated {ageText} ago</Badge>;
  }

  return <Badge variant="success">Live</Badge>;
}
```

#### 4.2 Connection Status Banner

```typescript
// src/components/ConnectionBanner.tsx
export function ConnectionBanner() {
  const connectionStatus = useConnectionStatus();
  const [showBanner, setShowBanner] = useState(false);

  // Show banner when going offline
  useEffect(() => {
    if (connectionStatus === 'offline') {
      setShowBanner(true);
    } else {
      // Hide after delay when back online
      const timer = setTimeout(() => setShowBanner(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [connectionStatus]);

  if (!showBanner) return null;

  return (
    <Banner variant={connectionStatus === 'offline' ? 'warning' : 'success'}>
      {connectionStatus === 'offline'
        ? '📵 No connection - showing cached data'
        : '✅ Back online - data updated'}
    </Banner>
  );
}
```

### Phase 5: Advanced Features

#### 5.1 Background Sync

- Use React Native Background Fetch for periodic updates
- Update cache even when app is backgrounded
- Smart scheduling based on usage patterns

#### 5.2 Cache Versioning & Migration

```typescript
interface CacheMetadata {
  version: string;
  schemaVersion: number;
  lastSync: number;
  deviceId: string;
}
```

#### 5.3 Selective Caching

- Cache last 7 days of data for quick access
- Full history available when online
- Smart pruning of old cache entries

## Testing Strategy

### 1. Offline Scenarios

- [ ] Airplane mode on app launch
- [ ] Network disconnect during fetch
- [ ] Poor network conditions (slow 3G)
- [ ] Network recovery after extended offline

### 2. Cache Validation

- [ ] Cache persists across app restarts
- [ ] Cache updates after successful fetch
- [ ] Stale cache indicators work correctly
- [ ] Cache version migration

### 3. User Experience

- [ ] Data always visible (never blank screen)
- [ ] Clear indication of data freshness
- [ ] Smooth transitions between cached/fresh
- [ ] No UI jank during updates

## Performance Considerations

1. **Cache Size Management**
   - Limit to last 1000 entries (~100KB)
   - Compress data if needed
   - Regular cleanup of old entries

2. **Battery Impact**
   - Minimize background fetches
   - Batch network requests
   - Respect device power state

3. **Memory Usage**
   - Lazy load older data
   - Clear memory cache when backgrounded
   - Use pagination for large datasets

## UI/UX Guidelines

### Visual Indicators

1. **Color Coding**:
   - 🟢 Green: Fresh data (< 1 min)
   - 🟡 Yellow: Recent cache (1-60 min)
   - 🟠 Orange: Stale cache (> 60 min)
   - 🔴 Red: Offline/Error state

2. **Loading States**:
   - Skeleton screens for initial load
   - Subtle refresh indicator for background updates
   - Progress bar for initial sync

3. **Error Communication**:
   - Non-intrusive error messages
   - Actionable retry options
   - Clear offline indication

## Migration Path

### Week 1: Foundation

- [ ] Implement cacheService with AsyncStorage
- [ ] Add cache state to mainStore
- [ ] Basic save/load functionality

### Week 2: Integration

- [ ] Integrate with React Query
- [ ] Add network detection
- [ ] Implement retry logic

### Week 3: UI Polish

- [ ] Add freshness indicators
- [ ] Implement connection banner
- [ ] Polish loading states

### Week 4: Testing & Optimization

- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] User feedback integration

## Success Metrics

1. **Reliability**
   - 100% data availability (cached or fresh)
   - < 500ms to first meaningful paint
   - Zero data loss scenarios

2. **User Experience**
   - Clear understanding of data state
   - Smooth offline/online transitions
   - Confidence in data accuracy

3. **Performance**
   - < 50MB cache size
   - < 5% battery impact
   - < 100ms cache read time

## Next Steps

1. Review and approve this plan
2. Set up AsyncStorage and create cacheService
3. Implement cache persistence in useGoogleSheetsData
4. Add UI indicators for cache state
5. Test thoroughly in various network conditions

This implementation ensures users always have access to their critical medication data while clearly communicating the freshness and reliability of that data.
