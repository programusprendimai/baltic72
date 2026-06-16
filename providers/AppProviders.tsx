import type { ReactNode } from 'react';

import { DatabaseProvider } from '@/providers/DatabaseProvider';
import { FamilyProvider } from '@/providers/FamilyProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <DatabaseProvider>
      <FamilyProvider>{children}</FamilyProvider>
    </DatabaseProvider>
  );
}
