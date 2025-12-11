import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { SolarSystem } from './components/SolarSystem';
import { HandTracker } from './components/HandTracker';
import { useStore, MAX_ZOOM, MIN_ZOOM } from './store';

const UIOverlay = () => {
  const zoomLevel = useStore(state => state.zoomLevel);
  const gestureStatus = useStore(state => state.gestureStatus);
  const focusTarget = useStore(state => state.focusTarget);

  let statusText = "Ready";
  if (gestureStatus === 'POINT') statusText = "Controlling Saturn";
  if (gestureStatus === 'TWO') statusText = "Visiting Earth";
  if (gestureStatus === 'PINCH') statusText = "Zooming Out...";
  if (gestureStatus === 'OPEN') statusText = "Zooming In...";
  
  if (gestureStatus === 'IDLE') {
    if (focusTarget === 'SATURN') statusText = "Locked on Saturn";
    if (focusTarget === 'EARTH') statusText = "Locked on Earth";
  }
  
  if (zoomLevel > 0.85 && focusTarget === 'NONE') statusText = "⚠️ SCATTERING ⚠️";

  const range = MAX_ZOOM - MIN_ZOOM;
  const normalizedValue = zoomLevel - MIN_ZOOM;
  const barPercentage = (normalizedValue / range) * 100;

  return (
    <div className="absolute top-8 left-8 text-white pointer-events-none z-10 select-none">
      <h1 className="text-4xl font-light tracking-[0.2em] mb-2 text-yellow-100 drop-shadow-[0_0_10px_rgba(253,184,19,0.8)]">
        SOLAR SYSTEM
      </h1>
      <div className="flex flex-col gap-2 font-mono text-sm text-gray-400">
        <p>Interactive Particle Simulation</p>
        <div className="flex items-center gap-2 mt-4">
          <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700 relative">
            <div 
                className="absolute top-0 bottom-0 w-0.5 bg-gray-600 z-10" 
                style={{ left: `${(-MIN_ZOOM / range) * 100}%` }} 
            />
            <div 
              className="h-full bg-yellow-500 transition-all duration-100 ease-out relative z-0" 
              style={{ width: `${barPercentage}%` }}
            />
          </div>
          <span className="text-yellow-500 min-w-[4rem] text-right">
            {Math.round(zoomLevel * 100)}%
          </span>
        </div>
        
        <div className="mt-4 p-4 border border-white/10 bg-black/30 backdrop-blur-md rounded-lg max-w-sm">
          <p className="uppercase text-xs tracking-widest text-gray-500 mb-2">Controls</p>
          <ul className="space-y-2">
            <li className={`flex items-center gap-2 ${gestureStatus === 'POINT' ? 'text-cyan-400 font-bold' : ''}`}>
              <span className="text-xl">☝️</span> 
              <span>Point "1": Saturn Lock & Rotate</span>
            </li>
            <li className={`flex items-center gap-2 ${gestureStatus === 'TWO' ? 'text-blue-400 font-bold' : ''}`}>
              <span className="text-xl">✌️</span> 
              <span>Sign "2": Focus Earth</span>
            </li>
            <li className={`flex items-center gap-2 ${gestureStatus === 'PINCH' ? 'text-red-400 font-bold' : ''}`}>
              <span className="text-xl">🤏</span> 
              <span>Pinch: Zoom Out</span>
            </li>
            <li className={`flex items-center gap-2 ${gestureStatus === 'OPEN' ? 'text-yellow-400 font-bold' : ''}`}>
              <span className="text-xl">✋</span> 
              <span>Open: Zoom In</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-yellow-300 animate-pulse">{statusText}</p>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <div className="relative w-full h-full bg-black">
      {/* 3D Scene */}
      <Canvas 
        camera={{ position: [0, 20, 60], fov: 45 }}
        gl={{ antialias: true, toneMappingExposure: 1.2, outputColorSpace: "srgb" }}
        dpr={[1, 2]}
      >
        {/* Rich Cosmic Blue Background */}
        <color attach="background" args={['#040B28']} />
        
        {/* Ambient light needed for texture details on Earth */}
        <ambientLight intensity={0.15} />
        
        <Suspense fallback={null}>
          <SolarSystem />
        </Suspense>
      </Canvas>

      {/* UI & Controls */}
      <UIOverlay />
      
      {/* Camera Feed for Gesture Control */}
      <HandTracker />
    </div>
  );
}