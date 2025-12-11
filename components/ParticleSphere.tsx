import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';

const VertexShader = `
  uniform float uTime;
  uniform float uScatter;
  uniform float uSize;
  
  attribute float aRandom;
  attribute vec3 aScatterDir;

  varying float vAlpha;

  void main() {
    // Basic position
    vec3 pos = position;

    // Scatter logic
    float scatterEffect = max(0.0, uScatter - 0.8) * 5.0; 
    vec3 movement = aScatterDir * scatterEffect * 15.0; 
    
    // Breathing/Movement
    if (scatterEffect <= 0.01) {
       pos += normal * sin(uTime * 2.0 + aRandom * 10.0) * 0.05;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos + movement, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuation
    gl_PointSize = uSize * (300.0 / -mvPosition.z);

    // --- Twinkle/Flicker Logic ---
    // Use random attribute to create unique flicker speeds and phases per particle
    float twinkleSpeed = 2.0 + aRandom * 4.0; // Speed between 2.0 and 6.0
    float twinklePhase = aRandom * 10.0;
    // Varies between 0.4 and 1.0
    float twinkle = 0.7 + 0.3 * sin(uTime * twinkleSpeed + twinklePhase);

    // Fade out based on distance/scatter, combine with twinkle
    vAlpha = (1.0 - min(1.0, scatterEffect * 0.5)) * twinkle;
  }
`;

const FragmentShader = `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    // Circular particle
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;

    // Soft edge glow (Faint glow effect)
    // 1.0 at center, 0.0 at edge
    float glow = 1.0 - (dist * 2.0);
    
    // Power curve controls the "core" vs "halo" ratio. 
    // Lower power = softer, larger glow. Higher power = tighter, smaller point.
    glow = pow(glow, 1.3);

    gl_FragColor = vec4(uColor, vAlpha * glow);
  }
`;

interface ParticleSphereProps {
  count: number;
  radius: number;
  color: string;
  size?: number;
  glow?: boolean;
}

export const ParticleSphere: React.FC<ParticleSphereProps> = ({ count, radius, color, size = 0.5, glow = false }) => {
  const meshRef = useRef<THREE.Points>(null);
  const zoomLevel = useStore(state => state.zoomLevel);
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uScatter: { value: 0 },
    uColor: { value: new THREE.Color(color) },
    uSize: { value: size }
  }), [color, size]);

  const { positions, randoms, scatterDirs } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const scatterDirs = new Float32Array(count * 3);

    const tempColor = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      // Point on sphere
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      randoms[i] = Math.random();

      // Scatter direction (outwards from center)
      const norm = new THREE.Vector3(x, y, z).normalize();
      scatterDirs[i * 3] = norm.x;
      scatterDirs[i * 3 + 1] = norm.y;
      scatterDirs[i * 3 + 2] = norm.z;
    }

    return { positions, randoms, scatterDirs };
  }, [count, radius, color]);

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.getElapsedTime();
      
      // Smoothly interpolate scatter value based on zoomLevel
      // We want scatter to start happening around zoomLevel 0.8
      material.uniforms.uScatter.value = THREE.MathUtils.lerp(
        material.uniforms.uScatter.value, 
        zoomLevel, 
        0.1
      );
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aRandom"
          count={randoms.length}
          array={randoms}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aScatterDir"
          count={scatterDirs.length / 3}
          array={scatterDirs}
          itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={VertexShader}
        fragmentShader={FragmentShader}
        uniforms={uniforms}
      />
    </points>
  );
};
