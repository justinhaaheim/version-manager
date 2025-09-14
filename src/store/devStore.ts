import {create} from 'zustand';

export interface RequestStatus {
  message: string;
  timestamp: number;
  type: 'start' | 'success' | 'error' | 'retry' | 'info';
}

interface DevStore {
  // Actions
  actions: {
    addRequestHistory: (status: RequestStatus) => void;
    clearRequestHistory: () => void;
    setRequestStatus: (status: RequestStatus | null) => void;
    toggleDebugFlag: (flag: keyof DevStore['debugFlags']) => void;
  };

  // Debug flags (fixed for now, can be made dynamic later)
  debugFlags: {
    DEBUG_DATE_PARSING: boolean;
    DEBUG_DEBOUNCE: boolean;
    DEBUG_MEDICATION_PARSER: boolean;
    DEBUG_MEDICATION_VISUALIZATION: boolean;
    DEBUG_QUERY_LIFECYCLE: boolean;
    DEBUG_TIMELINE_OVERFLOW: boolean;
    SHOW_REQUEST_INFO_ON_HOME_SCREEN: boolean;
  };
  requestHistory: RequestStatus[];

  // Request status messages for home screen display
  requestStatus: RequestStatus | null;
}

const useDevStore = create<DevStore>((set) => ({
  actions: {
    addRequestHistory: (status) =>
      set((state) => ({
        requestHistory: [...state.requestHistory, status].slice(-20),
      })),

    clearRequestHistory: () =>
      set({
        requestHistory: [],
        requestStatus: null,
      }),

    setRequestStatus: (status) =>
      set((state) => {
        if (status) {
          return {
            requestHistory: [...state.requestHistory, status].slice(-20),
            requestStatus: status, // Keep last 20 messages
          };
        }
        return {requestStatus: status};
      }),

    toggleDebugFlag: (flag) =>
      set((state) => ({
        debugFlags: {
          ...state.debugFlags,
          [flag]: !state.debugFlags[flag],
        },
      })),
  },

  debugFlags: {
    DEBUG_DATE_PARSING: true,
    DEBUG_DEBOUNCE: false,
    DEBUG_MEDICATION_PARSER: false,
    DEBUG_MEDICATION_VISUALIZATION: false,
    DEBUG_QUERY_LIFECYCLE: true,
    DEBUG_TIMELINE_OVERFLOW: false,
    SHOW_REQUEST_INFO_ON_HOME_SCREEN: true,
  },
  requestHistory: [],

  requestStatus: null,
}));

// Individual hooks for debug flags
export const useDebugQueryLifecycle = () =>
  useDevStore((state) => state.debugFlags.DEBUG_QUERY_LIFECYCLE);

export const useDebugDateParsing = () =>
  useDevStore((state) => state.debugFlags.DEBUG_DATE_PARSING);

export const useDebugDebounce = () =>
  useDevStore((state) => state.debugFlags.DEBUG_DEBOUNCE);

export const useDebugMedicationParser = () =>
  useDevStore((state) => state.debugFlags.DEBUG_MEDICATION_PARSER);

export const useDebugMedicationVisualization = () =>
  useDevStore((state) => state.debugFlags.DEBUG_MEDICATION_VISUALIZATION);

export const useDebugTimelineOverflow = () =>
  useDevStore((state) => state.debugFlags.DEBUG_TIMELINE_OVERFLOW);

export const useShowRequestInfoOnHomeScreen = () =>
  useDevStore((state) => state.debugFlags.SHOW_REQUEST_INFO_ON_HOME_SCREEN);

// Hook for all debug flags (for settings display)
export const useAllDebugFlags = () => useDevStore((state) => state.debugFlags);

// Hooks for request status
export const useRequestStatus = () =>
  useDevStore((state) => state.requestStatus);

export const useRequestHistory = () =>
  useDevStore((state) => state.requestHistory);

// Actions hook
export const useDevStoreActions = () => useDevStore((state) => state.actions);

// For use outside React components
export const devStore = {
  getState: () => useDevStore.getState(),

  logDateParsing: (message: string, data?: unknown) => {
    if (useDevStore.getState().debugFlags.DEBUG_DATE_PARSING) {
      console.debug(`[DateParsing] ${message}`, data);
    }
  },

  logDebounce: (message: string, data?: unknown) => {
    if (useDevStore.getState().debugFlags.DEBUG_DEBOUNCE) {
      console.debug(`[Debounce] ${message}`, data);
    }
  },

  logMedicationParser: (message: string, data?: unknown) => {
    if (useDevStore.getState().debugFlags.DEBUG_MEDICATION_PARSER) {
      console.debug(`[MedicationParser] ${message}`, data);
    }
  },

  logMedicationVisualization: (message: string, data?: unknown) => {
    if (useDevStore.getState().debugFlags.DEBUG_MEDICATION_VISUALIZATION) {
      console.debug(`[MedicationVisualization] ${message}`, data);
    }
  },

  // Convenience methods for logging with debug flags
  logQueryLifecycle: (message: string, data?: unknown) => {
    if (useDevStore.getState().debugFlags.DEBUG_QUERY_LIFECYCLE) {
      console.debug(`[Query] ${message}`, data);
    }
  },

  setRequestStatus: (message: string, type: RequestStatus['type'] = 'info') => {
    useDevStore.getState().actions.setRequestStatus({
      message,
      timestamp: Date.now(),
      type,
    });
  },
};
