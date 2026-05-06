import React, { useState, useEffect, useMemo } from 'react';
import { Editor } from '@monaco-editor/react';
import axiosInstance from '../../axios';
import Webcam from '../student/Components/WebCam';
import {
  Button,
  Box,
  Grid,
  Paper,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useSaveCheatingLogMutation } from 'src/slices/cheatingLogApiSlice'; // Adjust the import path
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { useNavigate, useParams } from 'react-router';
import { useCheatingLog } from 'src/context/CheatingLogContext';
import swal from 'sweetalert';

export default function Coder() {
  const [code, setCode] = useState('// Write your code here...');
  const [language, setLanguage] = useState('javascript');
  const [output, setOutput] = useState('');
  const [questionId, setQuestionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [question, setQuestion] = useState(null);
  const { examId } = useParams();
  const navigate = useNavigate();
  const { userInfo } = useSelector((state) => state.auth);
  const { cheatingLog, updateCheatingLog } = useCheatingLog();
  const [saveCheatingLogMutation] = useSaveCheatingLogMutation();

  useEffect(() => {
    if (userInfo) {
      updateCheatingLog((prevLog) => ({
        ...prevLog,
        username: userInfo.name,
        email: userInfo.email,
      }));
    }
  }, [userInfo]);

  // Check if current user has already submitted this exam
  useEffect(() => {
    const verifyAttempt = async () => {
      try {
        setIsLoading(true);
        const response = await axiosInstance.get(`/api/coding/questions/exam/${examId}`, {
          withCredentials: true,
        });
        if (response.data.success && response.data.data) {
          const questionData = response.data.data;
          setQuestionId(questionData._id);
          setQuestion(questionData);
          
          // Load existing code if student has already worked on it
          if (questionData.userSubmission && questionData.userSubmission.code) {
            setCode(questionData.userSubmission.code);
            setLanguage(questionData.userSubmission.language || 'javascript');
          } else if (questionData.description) {
            setCode(`// ${questionData.description}\n\n// Write your code here...`);
          }
        } else {
          toast.error('No coding question found for this exam. Please contact your teacher.');
        }
      } catch (error) {
        console.error('Error fetching coding question:', error);
        toast.error(error?.response?.data?.message || 'Failed to load coding question');
      } finally {
        setIsLoading(false);
      }
    };

    if (examId) {
      verifyAttempt();
    }
  }, [examId]);

  const runCode = async () => {
    let apiUrl;
    switch (language) {
      case 'python':
        apiUrl = '/run-python';
        break;
      case 'java':
        apiUrl = '/run-java';
        break;
      case 'javascript':
        apiUrl = '/run-javascript';
        break;
      default:
        return;
    }

    try {
      const response = await axiosInstance.post(apiUrl, { code }, { withCredentials: true });
      console.log('API Response:', response.data); // Log the response for debugging
      setOutput(response.data); // Adjust based on actual response structure
    } catch (error) {
      console.error('Error running code:', error);
      setOutput('Error running code.'); // Display error message
    }
  };

  const handleTestSubmission = async (violationType = null, forcedLog = null) => {
    if (isSubmitting) return;

    if (typeof violationType === 'object' && violationType !== null) {
      violationType = null;
    }

    let finalLog = forcedLog || { ...cheatingLog };

    // Increment violation count if it's an auto-submission
    if (violationType === 'exited_fullscreen') {
      finalLog.exitedFullscreenCount = (parseInt(finalLog.exitedFullscreenCount) || 0) + 1;
    } else if (violationType === 'tab_switched') {
      finalLog.tabSwitchedCount = (parseInt(finalLog.tabSwitchedCount) || 0) + 1;
    }

    const totalViolations = 
      (parseInt(finalLog.noFaceCount) || 0) + 
      (parseInt(finalLog.multipleFaceCount) || 0) + 
      (parseInt(finalLog.cellPhoneCount) || 0) + 
      (parseInt(finalLog.prohibitedObjectCount) || 0) + 
      (parseInt(finalLog.identityMismatchCount) || 0) + 
      (parseInt(finalLog.tabSwitchedCount) || 0) + 
      (parseInt(finalLog.exitedFullscreenCount) || 0) + 
      (parseInt(finalLog.voiceDetectedCount) || 0) + 
      (parseInt(finalLog.eyeGazeCount) || 0);

    const strikeLimit = 15;
    const isCriticalViolation = violationType === 'multipleFace' || violationType === 'identityMismatch';

    console.log(`🛡️ Proctoring Event: ${violationType} | Total Strikes: ${totalViolations}/${strikeLimit}`);

    if (totalViolations < strikeLimit && violationType && violationType !== 'exited_fullscreen' && !isCriticalViolation) {
      if (totalViolations <= 5) {
        swal('Security Alert', `Security Violation Detected: ${violationType} (${totalViolations}/${strikeLimit}). Please stay focused and ensure you are alone in a well-lit room.`, 'warning');
      } else if (totalViolations > 5 && totalViolations < 12) {
        swal('OFFICIAL WARNING', `Official Warning: Multiple violations (${totalViolations}/${strikeLimit}) detected. Further violations will result in automatic test submission.`, 'warning');
      } else if (totalViolations >= 12 && totalViolations < 15) {
        swal('FINAL WARNING', `FINAL WARNING: You have ${strikeLimit - totalViolations} strikes left. If you reach ${strikeLimit}, your test will be AUTO-SUBMITTED IMMEDIATELY.`, 'error');
      }
      
      if (!forcedLog) updateCheatingLog(finalLog);
      return;
    }

    try {
      setIsSubmitting(true);
      if (violationType === 'exited_fullscreen') {
        await swal('Auto-Submitting', `Test auto-submitted because you exited full screen mode.`, 'error');
      } else if (violationType === 'multipleFace') {
        await swal('Cheating Detected', `Another person was detected in your camera feed. Test terminated for security.`, 'error');
      } else if (violationType === 'identityMismatch') {
        await swal('Identity Theft Detected', `The person attempting the exam does not match the registered student. Test terminated for security.`, 'error');
      } else if (violationType) {
        await swal('Auto-Submitting', `Auto-submitting test due to excessive security violations (${totalViolations}/${strikeLimit}).`, 'error');
      }

      // First submit the code if possible
      const codeSubmissionData = {
        code,
        language,
        questionId,
      };

      try {
        await axiosInstance.post('/api/coding/submit', codeSubmissionData, {
          withCredentials: true,
        });
      } catch (submitErr) {
        console.error('Failed to submit code during auto-submission:', submitErr);
      }

      let finalLog = forcedLog || { ...cheatingLog };

      // Increment violation count if it's an auto-submission
      if (violationType === 'exited_fullscreen') {
        finalLog.exitedFullscreenCount = (parseInt(finalLog.exitedFullscreenCount) || 0) + 1;
      } else if (violationType === 'tab_switched') {
        finalLog.tabSwitchedCount = (parseInt(finalLog.tabSwitchedCount) || 0) + 1;
      }

      // Save cheating log
      const updatedLog = {
        ...finalLog,
        username: userInfo.name,
        email: userInfo.email,
        examId: examId,
        noFaceCount: parseInt(finalLog.noFaceCount) || 0,
        multipleFaceCount: parseInt(finalLog.multipleFaceCount) || 0,
        cellPhoneCount: parseInt(finalLog.cellPhoneCount) || 0,
        prohibitedObjectCount: parseInt(finalLog.prohibitedObjectCount) || 0,
        identityMismatchCount: parseInt(finalLog.identityMismatchCount) || 0,
        tabSwitchedCount: parseInt(finalLog.tabSwitchedCount) || 0,
        exitedFullscreenCount: parseInt(finalLog.exitedFullscreenCount) || 0,
        voiceDetectedCount: parseInt(finalLog.voiceDetectedCount) || 0,
        eyeGazeCount: parseInt(finalLog.eyeGazeCount) || 0,
        screenshots: finalLog.screenshots || [],
      };

      await saveCheatingLogMutation(updatedLog).unwrap();

      if (document.fullscreenElement) {
        document.exitFullscreen();
      }

      toast.success('Test submitted successfully!');
      navigate('/success');
    } catch (error) {
      console.error('Submission error:', error);
      navigate('/success');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const enterFullscreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.error('Fullscreen request failed:', err);
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !isSubmitting) {
        handleTestSubmission('exited_fullscreen');
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !isSubmitting) {
        handleTestSubmission('tab_switched');
      }
    };

    const preventDefaultAction = (e) => e.preventDefault();

    enterFullscreen();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('contextmenu', preventDefaultAction);
    document.addEventListener('copy', preventDefaultAction);
    document.addEventListener('cut', preventDefaultAction);
    document.addEventListener('paste', preventDefaultAction);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', preventDefaultAction);
      document.removeEventListener('copy', preventDefaultAction);
      document.removeEventListener('cut', preventDefaultAction);
      document.removeEventListener('paste', preventDefaultAction);
    };
  }, [isSubmitting]);

  const handleSubmit = async () => {
    await handleTestSubmission();
  };

  const questionsArray = useMemo(() => (question ? [question] : []), [question]);

  return (
    <Box sx={{ p: 3, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {isLoading ? (
        <Box sx={{ textAlign: 'center', p: 3 }}>Loading question...</Box>
      ) : !question ? (
        <Box sx={{ textAlign: 'center', p: 3 }}>
          No coding question found for this exam. Please contact your teacher.
        </Box>
      ) : (
        <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          {/* Question Section */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h5" gutterBottom>
                {question.question}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {question.description}
              </Typography>
            </Paper>
          </Grid>

          {/* Main Content Area */}
          <Grid item xs={12} sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 200px)' }}>
            {/* Code Editor Section */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ mb: 2 }}>
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>Language</InputLabel>
                  <Select
                    value={language}
                    label="Language"
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <MenuItem value="javascript">JavaScript</MenuItem>
                    <MenuItem value="python">Python</MenuItem>
                    <MenuItem value="java">Java</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ flex: 1, minHeight: 0, height: 'calc(100% - 200px)' }}>
                <Editor
                  height="100%"
                  language={language}
                  value={code}
                  onChange={(value) => setCode(value)}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </Box>

              {/* Output Section */}
              <Paper sx={{ mt: 2, p: 2, height: '120px', overflow: 'auto' }}>
                <Typography variant="h6" gutterBottom>
                  Output:
                </Typography>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{output}</pre>
              </Paper>

              {/* Action Buttons */}
              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button variant="contained" onClick={runCode} sx={{ minWidth: 120 }}>
                  Run Code
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSubmit}
                  sx={{ minWidth: 120 }}
                >
                  Submit Test
                </Button>
              </Box>
            </Box>

            {/* Webcam Section */}
            <Box sx={{ width: '320px', height: '240px', flexShrink: 0 }}>
              <Paper sx={{ height: '100%', overflow: 'hidden' }}>
                <Webcam
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onViolation={handleTestSubmission}
                  enableVoiceProctoring={true}
                  questions={questionsArray}
                />
              </Paper>
            </Box>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
