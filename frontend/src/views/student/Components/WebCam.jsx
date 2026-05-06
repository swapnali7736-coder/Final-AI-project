import React, { useRef, useState, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
import Webcam from 'react-webcam';
import { drawRect } from './utilities';
import { Box, Card } from '@mui/material';
import swal from 'sweetalert';
import { UploadClient } from '@uploadcare/upload-client';
import { useSelector } from 'react-redux';
import { useCheatingLog } from 'src/context/CheatingLogContext';

const client = new UploadClient({ publicKey: 'e69ab6e5db6d4a41760b' });

export default function Home({ onViolation, enableVoiceProctoring = false, questions = [] }) {
  const {
    cheatingLog,
    updateCheatingLog,
    isAIReady: globalAIReady,
    cocoNet: globalCocoNet,
    faceapiReady: globalFaceapiReady
  } = useCheatingLog();

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const { userInfo } = useSelector((state) => state.auth);
  const [lastDetectionTime, setLastDetectionTime] = useState({});
  const [screenshots, setScreenshots] = useState([]);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [isFaceMatcherReady, setIsFaceMatcherReady] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const detectIntervalRef = useRef(null);

  // Use refs to escape stale closures within setInterval
  const isReadyRef = useRef(false);
  const isDetectingRef = useRef(false);
  const lastDetectionTimeRef = useRef({});
  const consecutiveViolationsRef = useRef({ multipleFace: 0, cellPhone: 0, identityMismatch: 0 });
  const cheatingLogRef = useRef(cheatingLog);
  const faceMatcherRef = useRef(faceMatcher);
  const onViolationRef = useRef(onViolation);

  // Sync latest props/state to refs continuously
  useEffect(() => { cheatingLogRef.current = cheatingLog; }, [cheatingLog]);
  useEffect(() => { faceMatcherRef.current = faceMatcher; }, [faceMatcher]);
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);

  // Audio proctoring state
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamSourceRef = useRef(null);
  const animationFrameRef = useRef(null);

  const startProctoringLoop = (net) => {
    setIsReady(true);
    isReadyRef.current = true;
    console.log('🛡️ AI proctoring active');

    if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
    detectIntervalRef.current = setInterval(() => {
      if (webcamRef.current) {
        detect(net);
      }
    }, 1000); // 1-second interval loops just like the original X codebase
  };

  // Initialize identity matcher using global face-api
  useEffect(() => {
    if (globalFaceapiReady && userInfo?.profileImage && !faceMatcher) {
      const initializeMatcher = async () => {
        try {
          console.log('Initializing Identity Matcher...');
          const referenceImg = await new Promise((resolve, reject) => {
            const img = new Image();
            // Do NOT set crossOrigin for base64 data: URLs — it breaks loading
            if (!userInfo.profileImage.startsWith('data:')) {
              img.crossOrigin = 'anonymous';
            }
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Profile image load failed'));
            img.src = userInfo.profileImage;
          });

          const detection = await faceapi
            .detectSingleFace(referenceImg, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            // CRITICAL: must use LabeledFaceDescriptors, not raw detection
            const labeled = new faceapi.LabeledFaceDescriptors(
              'registered_user',
              [detection.descriptor]
            );
            // 0.5 is a strict threshold. Ensures fake persons are caught, though sensitive to lighting.
            setFaceMatcher(new faceapi.FaceMatcher([labeled], 0.5));
            setIsFaceMatcherReady(true);
            console.log('Identity Matcher Ready');
          } else {
            console.warn('No face found in profile image — identity matching disabled');
          }
        } catch (err) {
          console.error('Matcher init error:', err);
        }
      };
      initializeMatcher();
    }
  }, [globalFaceapiReady, userInfo?.profileImage, faceMatcher]);

  // Start proctoring loop when global AI is ready
  useEffect(() => {
    if (globalAIReady && globalCocoNet) {
      startProctoringLoop(globalCocoNet);
    }
    return () => {
      if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
    };
  }, [globalAIReady, globalCocoNet]);

  const captureScreenshotAndUpload = async (type) => {
    const video = webcamRef.current?.video;

    if (
      !video ||
      video.readyState !== 4 || // ensure video is ready
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      console.warn('Video not ready for screenshot');
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Compress the image to keep base64 size extremely small (~30kb) and save directly into MongoDB without failure
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

    const screenshot = {
      url: dataUrl,
      type: type,
      detectedAt: new Date()
    };

    // Update local screenshots state
    setScreenshots(prev => [...prev, screenshot]);
    console.log('✅ Screenshot captured and saved directly as Base64');

    return screenshot;
  };

  const captureBase64 = () => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState !== 4) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.6);
  };

  const handleDetection = async (type) => {
    const now = Date.now();
    const lastTime = lastDetectionTimeRef.current[type] || 0;

    // Balanced Cooldown: 5 seconds.
    // This gives students time to correct their behavior without instant disqualification.
    const waitTime = type === 'identityMismatch' ? 10000 : 5000;

    if (now - lastTime >= waitTime) {
      lastDetectionTimeRef.current[type] = now;
      setLastDetectionTime({ ...lastDetectionTimeRef.current });

      updateCheatingLog((prev) => {
        const screenshot = {
          url: webcamRef.current?.video ? captureBase64() : null,
          type: type,
          detectedAt: new Date()
        };

        const newCount = (prev[`${type}Count`] || 0) + 1;
        const newLog = {
          ...prev,
          [`${type}Count`]: newCount,
          screenshots: screenshot.url ? [...(prev.screenshots || []), screenshot] : (prev.screenshots || [])
        };

        console.log(`🛡️ Proctoring Violation [${type}]: ${newCount}/15`);
        
        // Pass the updated log directly to parent for immediate feedback
        if (onViolationRef.current) {
          onViolationRef.current(type, newLog);
        }

        return newLog;
      });
    }
  };

  // Start Voice Proctoring (Smart Transcript Version)
  useEffect(() => {
    if (isReady && enableVoiceProctoring) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        console.warn("Speech Recognition API not supported in this browser.");
        toast.error("Voice Proctoring is not supported in this browser. Please use Chrome.");
        return;
      }

      console.log("🎤 Initializing Voice Proctoring...");
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log("🎤 Voice Proctoring: Mic is now listening.");
      };

      recognition.onresult = (event) => {
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"");

        if (transcript.trim().length > 0) {
          console.log("🎤 Speech detected:", transcript);

          // 1. Check for explicit cheating phrases
          const suspiciousPhrases = [
            "google", "siri", "alexa", "chatgpt", "answer", "what is", "tell me", "help me", "which option",
            "option a", "option b", "option c", "option d", "solve", "search", "mobile", "phone"
          ];
          const hasSuspiciousPhrase = suspiciousPhrases.some(phrase => transcript.includes(phrase));

          // 2. Check if the person is just reading the question text
          let isReadingQuestion = false;
          let spokenWords = [];

          if (questions && questions.length > 0) {
            // Combine all question text and option text into one giant string for comparison
            const allExamText = questions.map(q => {
              let text = (q.question || "") + " " + (q.description || "");
              if (q.options) {
                text += " " + q.options.map(o => o.optionText).join(" ");
              }
              return text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"");
            }).join(" ");

            // Extract meaningful words from their speech (longer than 2 letters)
            spokenWords = transcript.split(/\s+/).filter(w => w.length > 3);

            let matchedWords = 0;
            spokenWords.forEach(word => {
              if (allExamText.includes(word)) {
                matchedWords++;
              }
            });

            // Increased threshold to 40% to be less aggressive in ignoring violations
            if (spokenWords.length > 0 && (matchedWords / spokenWords.length) >= 0.40) {
              isReadingQuestion = true;
            }
          }

          // 3. Final Decision Logic
          if (hasSuspiciousPhrase) {
            console.warn("🚨 Voice Violation: Suspicious phrase detected.");
            handleDetection('voiceDetected');
          } else if (spokenWords.length >= 3 && !isReadingQuestion) {
            // More than 3 significant words that aren't on the exam paper
            console.warn("🚨 Voice Violation: Continuous conversation detected.");
            handleDetection('voiceDetected');
          } else {
            console.log("✅ Voice Ignored: Utterance was too short or matches exam text.");
          }
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          toast.error("Microphone access denied. Voice proctoring will not work.");
        } else if (event.error !== 'no-speech') {
          console.error("Speech recognition error:", event.error);
        }
      };

      recognition.onend = () => {
        // Automatically restart if still in exam mode
        if (isReadyRef.current && enableVoiceProctoring) {
          try { recognition.start(); } catch (e) { }
        }
      };

      try {
        recognition.start();
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
      }

      return () => {
        recognition.onend = null;
        recognition.stop();
      };
    }
  }, [isReady, enableVoiceProctoring, questions]);

  const detect = async (net) => {
    if (isDetectingRef.current || !isReadyRef.current) return;

    const video = webcamRef.current?.video;
    if (video && video.readyState === 4) {
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      if (videoWidth === 0 || videoHeight === 0 || !canvasRef.current) return;

      isDetectingRef.current = true;
      setIsDetecting(true);

      try {
        // Force exact hardware sizes to the DOM element so TF.js scales boxes perfectly
        video.width = videoWidth;
        video.height = videoHeight;
        canvasRef.current.width = videoWidth;
        canvasRef.current.height = videoHeight;

        // 1. Run COCO-SSD (Object Detection)
        const obj = await net.detect(video);

        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        drawRect(obj, ctx);

        let person_count = 0;
        let faceDetected = false;
        let cellPhoneDetected = false;
        let prohibitedObjectDetected = false;

        obj.forEach((element) => {
          const detectedClass = element.class;
          if (detectedClass === 'cell phone') cellPhoneDetected = true;
          if (detectedClass === 'book' || detectedClass === 'laptop')
            prohibitedObjectDetected = true;
          if (detectedClass === 'person') {
            faceDetected = true;
            person_count++;
          }
        });

        // --- Critical Violation Checks with Smoothing (require 2 detections) ---
        if (cellPhoneDetected) {
          consecutiveViolationsRef.current.cellPhone = (consecutiveViolationsRef.current.cellPhone || 0) + 1;
          if (consecutiveViolationsRef.current.cellPhone >= 2) handleDetection('cellPhone');
        } else {
          consecutiveViolationsRef.current.cellPhone = 0;
        }

        if (prohibitedObjectDetected) {
          consecutiveViolationsRef.current.prohibitedObject = (consecutiveViolationsRef.current.prohibitedObject || 0) + 1;
          if (consecutiveViolationsRef.current.prohibitedObject >= 2) handleDetection('prohibitedObject');
        } else {
          consecutiveViolationsRef.current.prohibitedObject = 0;
        }

        if (!faceDetected) {
          handleDetection('noFace');
        } else if (person_count > 1) {
          consecutiveViolationsRef.current.multipleFace = (consecutiveViolationsRef.current.multipleFace || 0) + 1;
          // Immediate for multiple people as it's a clear violation
          if (consecutiveViolationsRef.current.multipleFace >= 1) handleDetection('multipleFace');
        } else {
          consecutiveViolationsRef.current.multipleFace = 0;
        }

        // 2. Short pause to let WebGL breathe
        await new Promise(r => setTimeout(r, 200));

        // 3. Run Face-API (Identity Match & Multi-Face Detection)
        if (globalFaceapiReady && faceMatcherRef.current && webcamRef.current?.video) {
          const currentVideo = webcamRef.current.video;
          if (currentVideo.readyState === 4) {
            const detections = await faceapi
              .detectAllFaces(currentVideo, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
              .withFaceLandmarks()
              .withFaceDescriptors();

            if (detections.length > 1) {
              handleDetection('multipleFace');
            } else if (detections.length === 1) {
              const detection = detections[0];
              const match = faceMatcherRef.current.findBestMatch(detection.descriptor);
              
              if (match.label === 'unknown') {
                consecutiveViolationsRef.current.identityMismatch = (consecutiveViolationsRef.current.identityMismatch || 0) + 1;
                // Require 2 consecutive detections (approx 2 seconds) to be sure it's not a glitch
                if (consecutiveViolationsRef.current.identityMismatch >= 2) {
                  console.warn('🚨 Unauthorized person detected. Distance:', match.distance);
                  handleDetection('identityMismatch');
                }
              } else {
                consecutiveViolationsRef.current.identityMismatch = 0;
                // It's the registered user, check for eye gaze
                const landmarks = detection.landmarks.positions;
                if (landmarks && landmarks.length >= 68) {
                  const leftEdge = landmarks[0];
                  const rightEdge = landmarks[16];
                  const nose = landmarks[30];

                  if (leftEdge && rightEdge && nose) {
                    const leftDist = nose.x - leftEdge.x;
                    const rightDist = rightEdge.x - nose.x;

                    if (rightDist > 0 && leftDist > 0) {
                      const ratio = leftDist / rightDist;
                      if (ratio > 3.0 || ratio < 0.33) {
                        handleDetection('eyeGaze');
                      }
                    }
                  }
                }
              }
            } else if (person_count > 0 && detections.length === 0) {
              handleDetection('eyeGaze');
            }
          }
        }
      } catch (error) {
        console.error('Proctoring scan error:', error);
      } finally {
        isDetectingRef.current = false;
        setIsDetecting(false);
      }
    }
  };


  return (
    <Box>
      <Card variant="outlined" sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <div style={{ position: 'absolute', top: 5, left: 5, zIndex: 20, color: 'white', backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
          AI Proctor: {globalAIReady ? '🟢 Active' : '⏳ Loading Models...'}
        </div>
        <Webcam
          ref={webcamRef}
          audio={enableVoiceProctoring}
          muted
          screenshotFormat="image/jpeg"
          videoConstraints={{
            width: 640,
            height: 480,
            facingMode: 'user',
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 10,
          }}
        />
      </Card>
    </Box>
  );
}

// Helper to convert base64 to File
function dataURLtoFile(dataUrl, fileName) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], fileName, { type: mime });
}
