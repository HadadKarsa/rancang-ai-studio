'use client';

import * as React from 'react';

interface AppShellContextValue {
  projectBreadcrumb: string | null;
  setProjectBreadcrumb: (name: string | null) => void;
  modelRefreshTick: number;
  refreshActiveModel: () => void;
}

const AppShellContext = React.createContext<AppShellContextValue>({
  projectBreadcrumb: null,
  setProjectBreadcrumb: () => {},
  modelRefreshTick: 0,
  refreshActiveModel: () => {},
});

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [projectBreadcrumb, setProjectBreadcrumb] = React.useState<string | null>(null);
  const [modelRefreshTick, setModelRefreshTick] = React.useState(0);

  const refreshActiveModel = React.useCallback(() => {
    setModelRefreshTick((n) => n + 1);
  }, []);

  const value = React.useMemo(
    () => ({ projectBreadcrumb, setProjectBreadcrumb, modelRefreshTick, refreshActiveModel }),
    [projectBreadcrumb, modelRefreshTick, refreshActiveModel],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  return React.useContext(AppShellContext);
}
