import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'baltic72.onboarding.completed';

type OnboardingContextValue = {
  ready: boolean;
  completed: boolean;
  complete: () => Promise<void>;
  reset: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled) setCompleted(stored === '1');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const complete = useCallback(async () => {
    setCompleted(true);
    await AsyncStorage.setItem(STORAGE_KEY, '1');
  }, []);

  const reset = useCallback(async () => {
    setCompleted(false);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({ ready, completed, complete, reset }),
    [ready, completed, complete, reset]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}
