import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppsView = "os" | "cards";

interface UIState {
  sidebarOpen: boolean;
  activeApp: string | null;
  minimizingApp: string | null;
  openApps: string[];
  appPaths: Record<string, string>; // Store last path per app
  appsView: AppsView;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveApp: (app: string | null) => void;
  minimizeApp: (app: string, currentPath: string) => void;
  openApp: (app: string) => void;
  closeApp: (app: string) => void;
  clearMinimizing: () => void;
  getAppPath: (app: string) => string;
  setAppsView: (view: AppsView) => void;
}

interface UIStore extends UIState {
  actions: UIActions;
}

const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      sidebarOpen: false,
      activeApp: null,
      minimizingApp: null,
      openApps: [],
      appPaths: {},
      appsView: "os",

      actions: {
        toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        setActiveApp: (app) => set({ activeApp: app }),
        minimizeApp: (app, currentPath) =>
          set((state) => ({
            minimizingApp: app,
            openApps: state.openApps.includes(app) ? state.openApps : [...state.openApps, app],
            appPaths: { ...state.appPaths, [app]: currentPath },
          })),
        openApp: (app) =>
          set((state) => ({
            activeApp: app,
            openApps: state.openApps.includes(app) ? state.openApps : [...state.openApps, app],
          })),
        closeApp: (app) =>
          set((state) => {
            const newPaths = { ...state.appPaths };
            delete newPaths[app];
            return {
              openApps: state.openApps.filter((a) => a !== app),
              activeApp: state.activeApp === app ? null : state.activeApp,
              appPaths: newPaths,
            };
          }),
        clearMinimizing: () => set({ minimizingApp: null }),
        getAppPath: (app) => get().appPaths[app] || `/${app}`,
        setAppsView: (view) => set({ appsView: view }),
      },
    }),
    {
      name: "ui-store",
      partialize: (state) => ({ appsView: state.appsView }),
    }
  )
);

export const useSidebarOpen = () => useUIStore((state) => state.sidebarOpen);
export const useActiveApp = () => useUIStore((state) => state.activeApp);
export const useMinimizingApp = () => useUIStore((state) => state.minimizingApp);
export const useOpenApps = () => useUIStore((state) => state.openApps);
export const useAppPaths = () => useUIStore((state) => state.appPaths);
export const useAppsView = () => useUIStore((state) => state.appsView);
export const useUIActions = () => useUIStore((state) => state.actions);
