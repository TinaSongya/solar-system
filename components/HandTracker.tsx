import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useStore } from '../store';

export const HandTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  
  const { decreaseZoom, increaseZoom, setGestureStatus, gestureStatus, setFocusTarget, setSaturnRotation } = useStore();

  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let animationFrameId: number;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });

        startWebcam();
      } catch (error) {
        console.error("Error loading MediaPipe:", error);
      }
    };

    const startWebcam = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: 320,
              height: 240
            }
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.addEventListener("loadeddata", predictWebcam);
            setIsCameraReady(true);
          }
        } catch (err) {
          console.error("Webcam error:", err);
        }
      }
    };

    const predictWebcam = () => {
      if (!handLandmarker || !videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if(video.videoWidth === 0 || video.videoHeight === 0) {
         animationFrameId = requestAnimationFrame(predictWebcam);
         return;
      }

      // Drawing setup
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const startTimeMs = performance.now();
      const results = handLandmarker.detectForVideo(video, startTimeMs);

      // Clear previous drawings
      ctx?.clearRect(0, 0, canvas.width, canvas.height);

      if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];
        
        // --- Geometry Helpers ---
        const wrist = landmarks[0];

        // Function to determine if a finger is extended based on distance from wrist
        // An extended finger's tip is significantly further from the wrist than its PIP joint.
        const isExtended = (tipIdx: number, pipIdx: number) => {
             const tip = landmarks[tipIdx];
             const pip = landmarks[pipIdx];
             
             const dTip = (tip.x - wrist.x)**2 + (tip.y - wrist.y)**2;
             const dPip = (pip.x - wrist.x)**2 + (pip.y - wrist.y)**2;
             
             // 1.1 factor acts as a robust threshold (Tip needs to be 10% further out)
             return dTip > (dPip * 1.1); 
        };

        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        
        // 1. Check Finger States
        const indexOpen = isExtended(8, 6);
        const middleOpen = isExtended(12, 10);
        const ringOpen = isExtended(16, 14);
        const pinkyOpen = isExtended(20, 18);

        // 2. Pinch Detection (Thumb + Index distance)
        const pinchDist = Math.sqrt((thumbTip.x - indexTip.x)**2 + (thumbTip.y - indexTip.y)**2);
        const isPinch = pinchDist < 0.05;

        // 3. Gesture Recognition Logic
        // Priority: Three > Two > Point > Open > Pinch
        // We use exclusive checks to prevent cross-recognition (e.g., Two being recognized as Point)
        
        let detectedGesture: 'IDLE' | 'POINT' | 'PINCH' | 'TWO' | 'THREE' | 'OPEN' = 'IDLE';

        if (indexOpen && middleOpen && ringOpen && !pinkyOpen) {
            detectedGesture = 'THREE';
            setFocusTarget('MOON');
        } 
        else if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) {
            detectedGesture = 'TWO';
            setFocusTarget('EARTH');
        } 
        else if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
            detectedGesture = 'POINT';
            setFocusTarget('SATURN');
            
            // Map index tip position to rotation
            const rotY = (indexTip.x - 0.5) * 4.0; 
            const rotX = (indexTip.y - 0.5) * 4.0;
            setSaturnRotation(rotX, rotY);
        } 
        else if (indexOpen && middleOpen && ringOpen && pinkyOpen) {
            detectedGesture = 'OPEN';
            increaseZoom(0.015);
        }
        else {
            // Fallback for Pinch
            // If gestures above are NOT matched (e.g. Index is curled/pinched), check pinch distance
            if (isPinch) {
                detectedGesture = 'PINCH';
                setFocusTarget('NONE');
                decreaseZoom(0.015);
            } else {
                detectedGesture = 'IDLE';
            }
        }
        
        setGestureStatus(detectedGesture);

        // --- Visualization removed as requested ---
        // (No drawing commands here)

      } else {
        setGestureStatus('IDLE');
      }

      animationFrameId = requestAnimationFrame(predictWebcam);
    };

    setupMediaPipe();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      handLandmarker?.close();
    };
  }, [decreaseZoom, increaseZoom, setGestureStatus, setFocusTarget, setSaturnRotation]);

  return (
    <div className="absolute bottom-4 right-4 z-50 overflow-hidden rounded-xl border-2 border-white/20 bg-black/50 shadow-2xl w-48 h-36">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-60 transform -scale-x-100" 
      />
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
      />
      
      {!isCameraReady && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-xs">
          Init Camera...
        </div>
      )}
      
      <div className="absolute bottom-1 left-1 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white font-mono">
        {gestureStatus === 'POINT' ? 'POINT (SATURN)' : 
         gestureStatus === 'TWO' ? 'PEACE (EARTH)' : 
         gestureStatus === 'THREE' ? 'THREE (MOON)' : 
         gestureStatus === 'OPEN' ? 'OPEN (ZOOM IN)' :
         gestureStatus === 'PINCH' ? 'PINCH (ZOOM OUT)' :
         gestureStatus}
      </div>
    </div>
  );
};