import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useStore } from '../store';

export const HandTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  
  const { decreaseZoom, increaseZoom, setGestureStatus, gestureStatus, setFocusTarget, setSaturnRotation } = useStore();

  // Helper to detect pinch
  const getDistance = (p1: any, p2: any) => {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) + 
      Math.pow(p1.y - p2.y, 2)
    );
  };

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

      ctx?.clearRect(0, 0, canvas.width, canvas.height);

      if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];
        
        // --- Gesture Logic ---
        
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const indexPip = landmarks[6]; // Proximal Interphalangeal Joint
        const middleTip = landmarks[12];
        const middlePip = landmarks[10];
        const ringTip = landmarks[16];
        const ringPip = landmarks[14];
        const pinkyTip = landmarks[20];
        const pinkyPip = landmarks[18];

        // 1. Pinch Detection (Thumb + Index close)
        const pinchDist = getDistance(thumbTip, indexTip);
        const PINCH_THRESHOLD = 0.05;
        
        // Safety buffer: To be considered pointing/open, fingers must be this far from pinch position
        const GESTURE_SAFETY_THRESHOLD = 0.1; 

        // 2. Finger States (Extended vs Curled)
        // Y increases downwards (Screen coords: 0 at top, 1 at bottom)
        const isIndexExtended = indexTip.y < indexPip.y;
        const isMiddleExtended = middleTip.y < middlePip.y;
        const isRingExtended = ringTip.y < ringPip.y;
        const isPinkyExtended = pinkyTip.y < pinkyPip.y;

        const isMiddleCurled = middleTip.y > middlePip.y;
        const isRingCurled = ringTip.y > ringPip.y;
        const isPinkyCurled = pinkyTip.y > pinkyPip.y;

        // Gestures Definitions
        // We removed pinch checks from specific gestures to prioritize shape over thumb position.

        // Gesture: "Three" (Index, Middle, Ring Up, Pinky Down)
        const isThree = isIndexExtended && isMiddleExtended && isRingExtended && isPinkyCurled;

        // Gesture: "Two" / "Peace" (Index Up, Middle Up, others Down)
        const isTwo = isIndexExtended && isMiddleExtended && isRingCurled && isPinkyCurled;

        // Gesture: "Point" (Index Up, Middle Down)
        const isPointing = isIndexExtended && isMiddleCurled && isRingCurled && isPinkyCurled;

        // Gesture: "Open Hand" (All Extended)
        const isOpenHand = isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended;

        // State Logic Priority: Specific Shapes > Generic Pinch
        let detectedGesture: 'IDLE' | 'POINT' | 'PINCH' | 'TWO' | 'THREE' | 'OPEN' = 'IDLE';

        if (isThree) {
            detectedGesture = 'THREE';
            setFocusTarget('MOON');
        } else if (isTwo) {
            detectedGesture = 'TWO';
            setFocusTarget('EARTH');
        } else if (isPointing) {
            detectedGesture = 'POINT';
            setFocusTarget('SATURN');
            const rotY = (indexTip.x - 0.5) * 4.0; 
            const rotX = (indexTip.y - 0.5) * 4.0;
            setSaturnRotation(rotX, rotY);
        } else if (isOpenHand) {
            detectedGesture = 'OPEN';
            increaseZoom(0.015);
        } else if (pinchDist < PINCH_THRESHOLD) {
            // Only consider it a pinch if it wasn't one of the gestures above
            detectedGesture = 'PINCH';
            setFocusTarget('NONE');
            decreaseZoom(0.015);
        } else {
            detectedGesture = 'IDLE';
        }
        
        setGestureStatus(detectedGesture);

        // Visualize landmarks & Feedback
        if (ctx) {
            ctx.fillStyle = '#00FF00';
            for(const point of landmarks) {
                ctx.beginPath();
                ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // Color code the skeleton based on detected gesture
            if (detectedGesture === 'THREE') ctx.strokeStyle = '#CCCCCC'; // Moon/Silver
            else if (detectedGesture === 'TWO') ctx.strokeStyle = '#4FD0E7';
            else if (detectedGesture === 'POINT') ctx.strokeStyle = 'cyan';
            else if (detectedGesture === 'OPEN') ctx.strokeStyle = 'yellow';
            else if (detectedGesture === 'PINCH') ctx.strokeStyle = 'red';
            else ctx.strokeStyle = 'white';

            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(thumbTip.x * canvas.width, thumbTip.y * canvas.height);
            ctx.lineTo(indexTip.x * canvas.width, indexTip.y * canvas.height);
            ctx.stroke();
        }

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