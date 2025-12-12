import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Stars, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { TextureLoader } from 'three';
import { useStore } from '../store';
import { ParticleSphere } from './ParticleSphere';

// --- Shader for Soft Glow Sphere ---
const vertexShader = `
varying float vIntensity;
uniform float uPower;

void main() {
  vec3 vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec3 vView = normalize(-mvPosition.xyz);
  
  // Dot product creates the radial falloff
  // 1.0 at center (facing camera), 0.0 at edge
  float dotP = dot(vNormal, vView);
  
  // Clamp to avoid artifacts
  dotP = clamp(dotP, 0.0, 1.0);
  
  // Raise to power to control sharpness
  // High power = small concentrated glow
  // Low power = big soft glow
  vIntensity = pow(dotP, uPower);
  
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vIntensity;

void main() {
  // Output color with alpha based on intensity
  gl_FragColor = vec4(uColor, vIntensity * uOpacity);
}
`;

// --- Shader for Sun Halo (Subtle Dust & Twinkle) ---
const haloVertexShader = `
uniform float uTime;
uniform float uZoomScale;
attribute float aSize;
attribute float aSpeed;
attribute float aPhase;
attribute vec3 aColor;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Reduced size multiplier significantly for "dust" look
  // Was 300.0, now 120.0 to make them look like distant sparkles
  gl_PointSize = aSize * uZoomScale * (120.0 / -mvPosition.z);

  // Twinkle logic: Sine wave based on time
  float twinkle = 0.5 + 0.5 * sin(uTime * aSpeed + aPhase);
  
  vColor = aColor;
  vAlpha = twinkle;
}
`;

const haloFragmentShader = `
varying vec3 vColor;
varying float vAlpha;

void main() {
  // Circular particle shape
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  
  if (dist > 0.5) discard;
  
  // Sharper falloff for a "point light" look rather than "foggy blob"
  float strength = 1.0 - (dist * 2.0);
  strength = pow(strength, 3.0); // Higher power = sharper, smaller core

  // Lower overall opacity (0.6) for subtlety
  gl_FragColor = vec4(vColor, strength * vAlpha * 0.6);
}
`;

const GlowSphere = ({ radius, color, power, opacity = 1.0 }: { radius: number, color: string, power: number, opacity?: number }) => {
    const uniforms = useMemo(() => ({
        uColor: { value: new THREE.Color(color) },
        uPower: { value: power },
        uOpacity: { value: opacity }
    }), [color, power, opacity]);
    
    return (
        <mesh>
            <sphereGeometry args={[radius, 64, 64]} />
            <shaderMaterial 
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.FrontSide}
            />
        </mesh>
    );
};

// --- Component: Sun Halo (Fine Dust Ring) ---
const SunHalo = () => {
  const ref = useRef<THREE.Points>(null);
  const zoomLevel = useStore(state => state.zoomLevel);

  const count = 5000; // High count for fine dust

  const uniforms = useMemo(() => ({
      uTime: { value: 0 },
      uZoomScale: { value: 1.0 }
  }), []);

  const { positions, colors, sizes, speeds, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);

    const color1 = new THREE.Color("#FFD700"); // Gold
    const color2 = new THREE.Color("#FF8800"); // Orange
    const color3 = new THREE.Color("#FFFFFF"); // White (sparkle)

    for(let i=0; i<count; i++) {
        const angle = Math.random() * Math.PI * 2;
        
        // Distribution: Tighter inner ring, fading out
        // Start from sun surface (~5) out to ~15
        const r = 5.0 + Math.pow(Math.random(), 1.5) * 10.0;
        
        // Flatter ring (less vertical fog)
        const y = (Math.random() - 0.5) * 0.6; 

        positions[i*3] = Math.cos(angle) * r;
        positions[i*3+1] = y;
        positions[i*3+2] = Math.sin(angle) * r;

        // Small sizes for dust effect (0.5 to 2.0 max)
        sizes[i] = Math.random() * 1.5 + 0.5;

        // Colors
        const c = Math.random();
        let finalColor;
        if (c < 0.6) finalColor = color1;
        else if (c < 0.8) finalColor = color2;
        else finalColor = color3;

        colors[i*3] = finalColor.r;
        colors[i*3+1] = finalColor.g;
        colors[i*3+2] = finalColor.b;

        // Twinkle params
        speeds[i] = 2.0 + Math.random() * 4.0; // Faster twinkling for small stars
        phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, colors, sizes, speeds, phases };
  }, []);

  useFrame((state) => {
      if (ref.current) {
          ref.current.rotation.y -= 0.0005;
          
          const material = ref.current.material as THREE.ShaderMaterial;
          material.uniforms.uTime.value = state.clock.getElapsedTime();

          if (zoomLevel > 1.0) {
             const scatterScale = 1 + (zoomLevel - 1) * 3;
             ref.current.scale.setScalar(scatterScale);
             material.uniforms.uZoomScale.value = 1.0; 
          } else {
             ref.current.scale.setScalar(1.0);
             // Maintain visibility when zoomed out
             material.uniforms.uZoomScale.value = 1.0;
          }
      }
  });

  return (
      <points ref={ref}>
          <bufferGeometry>
              <bufferAttribute attach="attributes-position" count={positions.length/3} array={positions} itemSize={3} />
              <bufferAttribute attach="attributes-aColor" count={colors.length/3} array={colors} itemSize={3} />
              <bufferAttribute attach="attributes-aSize" count={sizes.length} array={sizes} itemSize={1} />
              <bufferAttribute attach="attributes-aSpeed" count={speeds.length} array={speeds} itemSize={1} />
              <bufferAttribute attach="attributes-aPhase" count={phases.length} array={phases} itemSize={1} />
          </bufferGeometry>
          <shaderMaterial 
            vertexShader={haloVertexShader}
            fragmentShader={haloFragmentShader}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
      </points>
  )
};

// --- Component: Realistic Moon ---
const RealisticMoon = ({ radius = 0.35, distance = 3.5 }: { radius?: number, distance?: number }) => {
  const moonRef = useRef<THREE.Mesh>(null);
  const orbitRef = useRef<THREE.Group>(null);
  
  const [colorMap, bumpMap] = useLoader(TextureLoader, [
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg' // Using standard moon map as bump map works well enough
  ]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (moonRef.current) {
      // Moon rotation (tidal locking roughly modeled by slow rotation)
      moonRef.current.rotation.y = time * 0.2;
    }
    if (orbitRef.current) {
      // Moon orbit speed around Earth
      orbitRef.current.rotation.y = time * 0.5; 
    }
  });

  return (
    <group ref={orbitRef}>
        {/* Moon Orbit Line (Mini) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[distance - 0.05, distance + 0.05, 64]} />
            <meshBasicMaterial color="#444" transparent opacity={0.1} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
        
        <mesh ref={moonRef} position={[distance, 0, 0]}>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshStandardMaterial 
                map={colorMap}
                bumpMap={bumpMap}
                bumpScale={0.05}
                roughness={0.8}
            />
        </mesh>
    </group>
  );
};

// --- Component: Realistic Earth ---
const RealisticEarth = ({ radius }: { radius: number }) => {
    const cloudsRef = useRef<THREE.Mesh>(null);
    const earthRef = useRef<THREE.Mesh>(null);

    const [colorMap, normalMap, specularMap, cloudsMap] = useLoader(TextureLoader, [
        'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
        'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
        'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
        'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png'
    ]);

    useFrame((state) => {
        const time = state.clock.getElapsedTime();
        if (earthRef.current) {
            earthRef.current.rotation.y = time * 0.1;
        }
        if (cloudsRef.current) {
            cloudsRef.current.rotation.y = time * 0.12;
        }
    });

    return (
        <group>
            {/* Earth Sphere */}
            <mesh ref={earthRef}>
                <sphereGeometry args={[radius, 64, 64]} />
                <meshPhongMaterial 
                    map={colorMap}
                    normalMap={normalMap}
                    specularMap={specularMap}
                    specular={new THREE.Color(0x333333)}
                    shininess={5}
                />
            </mesh>
            {/* Clouds Sphere */}
            <mesh ref={cloudsRef}>
                <sphereGeometry args={[radius + 0.02, 64, 64]} />
                <meshPhongMaterial 
                    map={cloudsMap}
                    transparent={true}
                    opacity={0.8}
                    blending={THREE.AdditiveBlending}
                    side={THREE.DoubleSide}
                />
            </mesh>
             {/* Atmosphere Glow */}
             <GlowSphere radius={radius + 0.5} color="#4F4CB0" power={3.0} opacity={0.4} />
        </group>
    );
};

// --- Helper: Procedural Saturn Textures ---
// Generates textures on the fly to avoid external URL 404s/CORS issues
const { saturnBodyUrl, saturnRingUrl } = (() => {
  // Safe check for SSR or non-browser environments
  if (typeof document === 'undefined') return { saturnBodyUrl: '', saturnRingUrl: '' };

  // 1. Saturn Body Texture (High Res Banded Gradient + Noise)
  const canvasBody = document.createElement('canvas');
  canvasBody.width = 1024;
  canvasBody.height = 1024;
  const ctxBody = canvasBody.getContext('2d');
  if (ctxBody) {
    // Base color
    ctxBody.fillStyle = '#C5AB6E';
    ctxBody.fillRect(0,0,1024,1024);

    // Bands Gradient
    const gradient = ctxBody.createLinearGradient(0, 0, 0, 1024);
    // Detailed bands based on real Saturn colors
    const stops: [number, string][] = [
        [0.0, '#8c7a62'], [0.05, '#99866c'], [0.1, '#b09f85'], 
        [0.15, '#a49173'], [0.2, '#99866c'], [0.25, '#8c7a62'],
        [0.3, '#bfb19c'], [0.35, '#a6957c'], [0.4, '#d6c8b3'], 
        [0.45, '#e0d4be'], [0.5, '#efe5ce'], // Equator (brightest)
        [0.55, '#e0d4be'], [0.6, '#d6c8b3'], [0.65, '#bfb19c'],
        [0.7, '#a49173'], [0.75, '#99866c'], [0.8, '#b09f85'],
        [0.85, '#8c7a62'], [0.9, '#756452'], [0.95, '#5e4f40'], [1.0, '#4b3d32']
    ];
    stops.forEach(([pos, color]) => gradient.addColorStop(pos, color));
    ctxBody.fillStyle = gradient;
    ctxBody.fillRect(0, 0, 1024, 1024);

    // Add atmospheric noise/storms (horizontal streaks)
    ctxBody.globalCompositeOperation = 'overlay';
    for(let i=0; i<400; i++) {
        const y = Math.random() * 1024;
        const h = Math.random() * 15 + 2;
        // Subtle light and dark streaks
        ctxBody.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
        ctxBody.fillRect(0, y, 1024, h);
    }
    ctxBody.globalCompositeOperation = 'source-over';
  }

  // 2. Saturn Ring Texture (Detailed Colorful Radial Gradient)
  const canvasRing = document.createElement('canvas');
  canvasRing.width = 1024;
  canvasRing.height = 64;
  const ctxRing = canvasRing.getContext('2d');
  if (ctxRing) {
      const gradient = ctxRing.createLinearGradient(0, 0, 1024, 0);
      
      // Clear transparent inner gap
      gradient.addColorStop(0.0, 'rgba(0,0,0,0)');
      
      // C Ring (Inner, Faint, Darker/Reddish)
      gradient.addColorStop(0.15, 'rgba(40, 30, 30, 0.05)');
      gradient.addColorStop(0.20, 'rgba(60, 50, 50, 0.1)');
      gradient.addColorStop(0.25, 'rgba(70, 60, 60, 0.15)');

      // B Ring (Main, Bright, Gold/Tan with subtle teal hints at inner edge)
      gradient.addColorStop(0.26, 'rgba(100, 90, 80, 0.8)');
      gradient.addColorStop(0.30, 'rgba(160, 140, 110, 0.9)'); 
      gradient.addColorStop(0.35, 'rgba(200, 180, 140, 1.0)'); // Peak brightness
      gradient.addColorStop(0.40, 'rgba(210, 190, 150, 1.0)'); 
      gradient.addColorStop(0.48, 'rgba(200, 180, 140, 1.0)'); 
      gradient.addColorStop(0.52, 'rgba(150, 130, 100, 0.9)'); 

      // Cassini Division (Sharp Dark Gap)
      gradient.addColorStop(0.53, 'rgba(0,0,0,0.02)'); 
      gradient.addColorStop(0.56, 'rgba(0,0,0,0.02)'); 

      // A Ring (Outer, Cooler Greyish-Tan)
      gradient.addColorStop(0.57, 'rgba(140, 130, 120, 0.6)'); 
      gradient.addColorStop(0.65, 'rgba(160, 150, 140, 0.7)'); 
      gradient.addColorStop(0.70, 'rgba(150, 140, 130, 0.5)'); // Encke Gap hint
      gradient.addColorStop(0.72, 'rgba(160, 150, 140, 0.7)'); 
      gradient.addColorStop(0.85, 'rgba(130, 120, 110, 0.6)');

      // F Ring (Thin outer strand)
      gradient.addColorStop(0.90, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.92, 'rgba(200, 190, 180, 0.3)'); 
      gradient.addColorStop(0.94, 'rgba(0,0,0,0)');

      gradient.addColorStop(1.0, 'rgba(0,0,0,0)');
      
      ctxRing.fillStyle = gradient;
      ctxRing.fillRect(0, 0, 1024, 64);
      
      // Add Grain/Noise to rings for "rocky/icy" texture feel
      const imageData = ctxRing.getImageData(0,0,1024,64);
      const data = imageData.data;
      for(let i=0; i<data.length; i+=4) {
          // Only add noise to non-transparent pixels
          if (data[i+3] > 10) { 
             const noise = (Math.random() - 0.5) * 15;
             data[i] = Math.max(0, Math.min(255, data[i] + noise));     // R
             data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise)); // G
             data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise)); // B
          }
      }
      ctxRing.putImageData(imageData, 0, 0);
  }
  
  return {
      saturnBodyUrl: canvasBody.toDataURL(),
      saturnRingUrl: canvasRing.toDataURL()
  };
})();

// --- Component: Realistic Saturn ---
const RealisticSaturn = ({ radius }: { radius: number }) => {
    const bodyRef = useRef<THREE.Mesh>(null);
    const ringsGeometryRef = useRef<THREE.RingGeometry>(null);

    const [saturnMap, ringMap] = useLoader(TextureLoader, [saturnBodyUrl, saturnRingUrl]);

    // Custom UV Mapping for Rings to stretch the texture radially
    useLayoutEffect(() => {
        if (ringsGeometryRef.current) {
            const geometry = ringsGeometryRef.current;
            const pos = geometry.attributes.position;
            const uv = geometry.attributes.uv;
            const v3 = new THREE.Vector3();
            
            // Inner and Outer radius match the geometry args below
            const innerRadius = radius * 1.4;
            const outerRadius = radius * 2.8;

            for (let i = 0; i < pos.count; i++) {
                v3.fromBufferAttribute(pos, i);
                const len = v3.length();
                // Map radius to U coordinate (0 to 1)
                const u = (len - innerRadius) / (outerRadius - innerRadius);
                // V coordinate is constant 0.5 (center of the texture strip)
                uv.setXY(i, u, 0.5);
            }
            geometry.attributes.uv.needsUpdate = true;
        }
    }, [radius]);

    return (
        // Saturn Tilt (~27 degrees)
        <group rotation={[0.45, 0, 0]}> 
            {/* Body */}
            <mesh ref={bodyRef}>
                <sphereGeometry args={[radius, 64, 64]} />
                <meshStandardMaterial 
                    map={saturnMap} 
                    roughness={0.5}
                />
            </mesh>
            
            {/* Rings */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry ref={ringsGeometryRef} args={[radius * 1.4, radius * 2.8, 128]} />
                <meshBasicMaterial 
                    map={ringMap}
                    side={THREE.DoubleSide}
                    transparent={true}
                    opacity={0.9}
                    color="#ffffff"
                />
            </mesh>

            {/* Subtle atmospheric glow */}
            <GlowSphere radius={radius * 1.1} color="#C5AB6E" power={2.0} opacity={0.3} />
        </group>
    );
};

const Planet = ({ 
  distance, 
  radius, 
  color, 
  speed, 
  orbitColor,
  rotationOffset = 0,
  manualRotation,
  children,
  variant = 'particle'
}: { 
  distance: number; 
  radius: number; 
  color: string; 
  speed: number; 
  orbitColor: string;
  rotationOffset?: number;
  manualRotation?: { x: number, y: number };
  children?: React.ReactNode;
  variant?: 'particle' | 'earth' | 'saturn';
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const planetBodyRef = useRef<THREE.Group>(null);
  const zoomLevel = useStore(state => state.zoomLevel);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.getElapsedTime() * speed * 0.2 + rotationOffset;
      if (zoomLevel > 1.0) {
          const expansion = (zoomLevel - 1.0) * 20.0;
          groupRef.current.position.setLength(distance + expansion);
      } else {
          groupRef.current.position.setLength(distance);
      }
    }
    // Apply manual rotation to the planet body if provided
    if (planetBodyRef.current && manualRotation) {
        // Lerp for smooth rotation
        planetBodyRef.current.rotation.x = THREE.MathUtils.lerp(planetBodyRef.current.rotation.x, manualRotation.x, 0.1);
        planetBodyRef.current.rotation.z = THREE.MathUtils.lerp(planetBodyRef.current.rotation.z, manualRotation.y, 0.1);
    }
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[distance - 0.1, distance + 0.1, 128]} />
        <meshBasicMaterial color={orbitColor} transparent opacity={0.15} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <group ref={groupRef}>
        <group position={[distance, 0, 0]} ref={planetBodyRef}>
           {variant === 'earth' && <RealisticEarth radius={radius} />}
           {variant === 'saturn' && <RealisticSaturn radius={radius} />}
           {variant === 'particle' && (
             <ParticleSphere count={2000} radius={radius} color={color} size={0.6} />
           )}
           {children}
        </group>
      </group>
    </group>
  );
};

export const SolarSystem: React.FC = () => {
  const zoomLevel = useStore(state => state.zoomLevel);
  const focusTarget = useStore(state => state.focusTarget);
  const saturnRotation = useStore(state => state.saturnRotation);
  
  const sceneRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    // --- Camera Logic ---
    const time = state.clock.getElapsedTime();

    if (focusTarget === 'SATURN') {
        const angle = time * 0.4 * 0.2 + 5;
        const dist = 42; 
        const saturnX = Math.cos(angle) * dist;
        const saturnZ = -Math.sin(angle) * dist; 
        
        // Adjust camera to look slightly down at the rings
        const targetPos = new THREE.Vector3(saturnX + 5, 4, saturnZ + 9);
        const lookAtPos = new THREE.Vector3(saturnX, 0, saturnZ);

        state.camera.position.lerp(targetPos, 0.05);
        state.camera.lookAt(lookAtPos);
    } 
    else if (focusTarget === 'EARTH') {
        const angle = time * 1.0 * 0.2 + 2;
        const dist = 18; 
        const earthX = Math.cos(angle) * dist;
        const earthZ = -Math.sin(angle) * dist;
        
        const targetPos = new THREE.Vector3(earthX + 2, 1, earthZ + 4);
        const lookAtPos = new THREE.Vector3(earthX, 0, earthZ);

        state.camera.position.lerp(targetPos, 0.05);
        state.camera.lookAt(lookAtPos);
    }
    else if (focusTarget === 'MOON') {
        // Earth Logic
        const earthAngle = time * 1.0 * 0.2 + 2;
        const earthDist = 18;
        const earthX = Math.cos(earthAngle) * earthDist;
        const earthZ = -Math.sin(earthAngle) * earthDist;

        // Moon Logic (Relative to Earth)
        const moonAngle = time * 0.5; // Matches RealisticMoon animation
        const moonDist = 3.5; // Matches RealisticMoon distance
        const moonX = Math.cos(moonAngle) * moonDist;
        const moonZ = -Math.sin(moonAngle) * moonDist;
        
        // Absolute Moon Position
        const absMoonX = earthX + moonX;
        const absMoonZ = earthZ + moonZ;

        // Camera close to Moon
        const targetPos = new THREE.Vector3(absMoonX + 1, 0.5, absMoonZ + 2);
        const lookAtPos = new THREE.Vector3(absMoonX, 0, absMoonZ);

        state.camera.position.lerp(targetPos, 0.05);
        state.camera.lookAt(lookAtPos);
    }
    else {
        // Standard Solar System View
        let zPos = 60;
        if (zoomLevel < 0) {
            zPos = 60 + (Math.abs(zoomLevel) / 0.5) * 30;
        } else {
            zPos = THREE.MathUtils.lerp(60, 4, zoomLevel);
        }
        
        const targetPos = new THREE.Vector3(0, 20, zPos);
        state.camera.position.lerp(targetPos, 0.05);
        
        const currentLookAt = new THREE.Vector3(0,0,-1).applyQuaternion(state.camera.quaternion).add(state.camera.position);
        const targetLookAt = new THREE.Vector3(0,0,0);
        const lerpedLookAt = currentLookAt.lerp(targetLookAt, 0.05);
        state.camera.lookAt(lerpedLookAt);
    }
  });

  return (
    <group ref={sceneRef}>
      <Stars radius={200} depth={100} count={20000} factor={5} saturation={0.5} fade speed={2} />
      <Sparkles count={3000} scale={200} size={3} speed={0.5} opacity={0.7} noise={0.2} color="#ffffff" />
      
      {/* SUN COMPLEX */}
      <group>
        <GlowSphere radius={4.2} color="#FFF5CC" power={1.5} opacity={1.0} />
        <GlowSphere radius={6.0} color="#FFD700" power={2.5} opacity={0.7} />
        <GlowSphere radius={11.0} color="#FF6600" power={4.5} opacity={0.4} />
        <SunHalo />
        <pointLight position={[0,0,0]} intensity={5.0} color="#FFD700" distance={200} decay={1} />
      </group>

      {/* PLANETS */}
      <Planet distance={10} radius={0.8} color="#A57C1B" speed={1.5} orbitColor="#666" rotationOffset={0} /> 
      <Planet distance={14} radius={1.2} color="#E3BB76" speed={1.2} orbitColor="#666" rotationOffset={1} /> 
      
      {/* EARTH - Realistic Mode + Moon Child */}
      <Planet 
        distance={18} 
        radius={1.3} 
        color="#4F4CB0" 
        speed={1.0} 
        orbitColor="#4F4CB0" 
        rotationOffset={2} 
        variant="earth"
      >
        <RealisticMoon radius={0.35} distance={3.5} />
      </Planet> 
      
      <Planet distance={22} radius={1.0} color="#E27B58" speed={0.8} orbitColor="#E27B58" rotationOffset={3} /> 
      <Planet distance={32} radius={2.8} color="#C88B3A" speed={0.5} orbitColor="#C88B3A" rotationOffset={4} /> 
      
      {/* SATURN - Realistic Mode + Manual Rotation */}
      <Planet 
        distance={42} 
        radius={2.4} 
        color="#C5AB6E" 
        speed={0.4} 
        orbitColor="#C5AB6E" 
        rotationOffset={5}
        manualRotation={focusTarget === 'SATURN' ? saturnRotation : undefined}
        variant="saturn"
      />
      
      <Planet distance={52} radius={2.0} color="#4FD0E7" speed={0.3} orbitColor="#4FD0E7" rotationOffset={6} /> 
      <Planet distance={60} radius={2.0} color="#4B70DD" speed={0.2} orbitColor="#4B70DD" rotationOffset={7} /> 
    </group>
  );
};