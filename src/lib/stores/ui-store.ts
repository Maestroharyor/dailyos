import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  activeApp: string | null;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveApp: (app: string | null) => void;
}

interface UIStore extends UIState {
  actions: UIActions;
}

const useUIStore = create<UIStore>()((set) => ({
  sidebarOpen: false,
  activeApp: null,

  actions: {
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setActiveApp: (app) => set({ activeApp: app }),
  },
}));

export const useSidebarOpen = () => useUIStore((state) => state.sidebarOpen);
export const useActiveApp = () => useUIStore((state) => state.activeApp);
export const useUIActions = () => useUIStore((state) => state.actions);
