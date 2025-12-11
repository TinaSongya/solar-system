import { create } from 'zustand';

export const MAX_ZOOM = 1.0; // 100% max depth
export const MIN_ZOOM = -0.5; // -50% min depth (further away)

interface AppState {
  zoomLevel: number; // -0.5 (very far) to 1.0 (close/scattered)
  setZoomLevel: (level: number) => void;
  increaseZoom: (amount: number) => void;
  decreaseZoom: (amount: number) => void;
  
  gestureStatus: 'IDLE' | 'POINT' | 'PINCH' | 'TWO' | 'OPEN';
  setGestureStatus: (status: 'IDLE' | 'POINT' | 'PINCH' | 'TWO' | 'OPEN') => void;

  focusTarget: 'NONE' | 'SATURN' | 'EARTH';
  setFocusTarget: (target: 'NONE' | 'SATURN' | 'EARTH') => void;

  saturnRotation: { x: number, y: number };
  setSaturnRotation: (x: number, y: number) => void;
}

export const useStore = create<AppState>((set) => ({
  zoomLevel: 0.2,
  gestureStatus: 'IDLE',
  focusTarget: 'NONE',
  saturnRotation: { x: 0, y: 0 },

  setZoomLevel: (level) => set({ zoomLevel: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)) }),
  increaseZoom: (amount) => set((state) => ({ 
    zoomLevel: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoomLevel + amount)) 
  })),
  decreaseZoom: (amount) => set((state) => ({ 
    zoomLevel: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoomLevel - amount)) 
  })),
  
  setGestureStatus: (status) => set({ gestureStatus: status }),
  setFocusTarget: (target) => set({ focusTarget: target }),
  setSaturnRotation: (x, y) => set({ saturnRotation: { x, y } }),
}));