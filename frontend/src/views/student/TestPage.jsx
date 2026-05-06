import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Grid, CircularProgress } from '@mui/material';
import PageContainer from 'src/components/container/PageContainer';
import BlankCard from 'src/components/shared/BlankCard';
import MultipleChoiceQuestion from './Components/MultipleChoiceQuestion';
import NumberOfQuestions from './Components/NumberOfQuestions';
import WebCam from './Components/WebCam';
import { useGetExamsQuery, useGetQuestionsQuery } from '../../slices/examApiSlice';
import { useSaveCheatingLogMutation } from 'src/slices/cheatingLogApiSlice';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { useCheatingLog } from 'src/context/CheatingLogContext';
import swal from 'sweetalert';

const TestPage = () => {
  const { examId, testId } = useParams();
  const [selectedExam, setSelectedExam] = useState(null);
  const [examDurationInSeconds, setExamDurationInSeconds] = useState(0);
  const { data: userExamdata, isLoading: isExamsLoading } = useGetExamsQuery();
  const { userInfo } = useSelector((state) => state.auth);
  const { cheatingLog, updateCheatingLog, resetCheatingLog } = useCheatingLog();
  const [saveCheatingLogMutation] = useSaveCheatingLogMutation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMcqCompleted, setIsMcqCompleted] = useState(false);

  useEffect(() => {
    if (userExamdata) {
      const exam = userExamdata.find((exam) => exam.examId === examId);
      if (exam) {
        setSelectedExam(exam);
        // Convert duration from minutes to seconds
        setExamDurationInSeconds(exam.duration);
        console.log('Exam duration (minutes):', exam.duration);
      }
    }
  }, [userExamdata, examId]);

  const [questions, setQuestions] = useState([]);
  const { data, isLoading } = useGetQuestionsQuery(examId);
  const [score, setScore] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (data) {
      setQuestions(data);
    }
  }, [data]);

  const handleMcqCompletion = () => {
    setIsMcqCompleted(true);
    // DO NOT reset cheating log here, so MCQ violations carry over to Coding and are saved together
    navigate(`/exam/${examId}/codedetails`);
  };

  const handleTestSubmission = async (violationType = null, forcedLog = null) => {
    if (isSubmitting) return;

    // Core Fix: Prevent SyntheticEvents or answer objects from triggering false security alerts
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

    // --- BALANCED 5-STEP PROCTORING POLICY ---
    // Rule: Total of 15 violations allowed before auto-submit.
    // HOWEVER: 'multipleFace' and 'identityMismatch' are critical violations that trigger IMMEDIATE termination.
    const strikeLimit = 15;
    const isCriticalViolation = violationType === 'multipleFace' || violationType === 'identityMismatch';

    console.log(`🛡️ Proctoring Event: ${violationType} | Total Strikes: ${totalViolations}/${strikeLimit}`);

    if (totalViolations < strikeLimit && violationType && violationType !== 'exited_fullscreen' && !isCriticalViolation) {
      if (totalViolations <= 5) {
        // Violations 1-5: Warning
        swal('Security Alert', `Security Violation Detected: ${violationType} (${totalViolations}/${strikeLimit}). Please stay focused and ensure you are alone in a well-lit room.`, 'warning');
      } else if (totalViolations > 5 && totalViolations < 12) {
        // Violation 6-11: Official Warning
        swal('OFFICIAL WARNING', `Official Warning: Multiple violations (${totalViolations}/${strikeLimit}) detected. Further violations will result in automatic test submission.`, 'warning');
      } else if (totalViolations >= 12 && totalViolations < 15) {
        // Violation 12+: Final Warning
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

      // Exit fullscreen if in it
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }

      toast.success('Test submitted successfully!');
      navigate('/Success');
    } catch (error) {
      console.error('Submission error:', error);
      toast.error('Failed to submit test. Logic: ' + (error.message || 'Unknown error'));
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

    enterFullscreen();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', (e) => e.preventDefault());
    };
  }, [isSubmitting]);

  const saveUserTestScore = () => {
    setScore(score + 1);
  };

  if (isExamsLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PageContainer title="TestPage" description="This is TestPage">
      <Box pt="3rem">
        <Grid container spacing={3}>
          <Grid item xs={12} md={7} lg={7}>
            <BlankCard>
              <Box
                width="100%"
                minHeight="400px"
                boxShadow={3}
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
              >
                {isLoading ? (
                  <CircularProgress />
                ) : (
                  <MultipleChoiceQuestion
                    submitTest={isMcqCompleted ? handleTestSubmission : handleMcqCompletion}
                    questions={data || []}
                    saveUserTestScore={saveUserTestScore}
                  />
                )}
              </Box>
            </BlankCard>
          </Grid>
          <Grid item xs={12} md={5} lg={5}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <BlankCard>
                  <Box
                    maxHeight="300px"
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'start',
                      justifyContent: 'center',
                      overflowY: 'auto',
                      height: '100%',
                    }}
                  >
                    <NumberOfQuestions
                      questionLength={questions?.length || 0}
                      submitTest={isMcqCompleted ? handleTestSubmission : handleMcqCompletion}
                      examDurationInSeconds={examDurationInSeconds}
                    />
                  </Box>
                </BlankCard>
              </Grid>
              <Grid item xs={12}>
                <BlankCard>
                  <Box
                    width="300px"
                    maxHeight="180px"
                    boxShadow={3}
                    display="flex"
                    flexDirection="column"
                    alignItems="start"
                    justifyContent="center"
                  >
                    <WebCam
                      onViolation={handleTestSubmission}
                      enableVoiceProctoring={true}
                      questions={questions}
                    />
                  </Box>
                </BlankCard>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Box>
    </PageContainer>
  );
};

export default TestPage;
