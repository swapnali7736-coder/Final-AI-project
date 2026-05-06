import {
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  Radio,
  Stack,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import { uniqueId } from 'lodash';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useGetQuestionsQuery } from 'src/slices/examApiSlice';
import IdentityVerification from './Components/IdentityVerification';
import { useSelector } from 'react-redux';
import { useCheatingLog } from 'src/context/CheatingLogContext';
import axiosInstance from 'src/axios';

function Copyright(props) {
  return (
    <Typography variant="body2" color="text.secondary" align="center" {...props}>
      {'Copyright © '}
      <Link color="inherit" href="https://mui.com/">
        Your Website
      </Link>{' '}
      {new Date().getFullYear()}
      {'.'}
    </Typography>
  );
}



const DescriptionAndInstructions = () => {
  const navigate = useNavigate();
  const { userInfo } = useSelector((state) => state.auth);

  const { examId } = useParams();
  const { data: questions, isLoading } = useGetQuestionsQuery(examId); // Fetch questions using examId
  // const { data: questions, isLoading } = useGetQuestionsQuery({ examId });

  // fech exam data from backend
  // pass testUnique id on start button
  const testId = uniqueId();
  // accetp
  const [certify, setCertify] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [hasAlreadyAttempted, setHasAlreadyAttempted] = useState(false);
  const [checkingAttempt, setCheckingAttempt] = useState(true);

  const { resetCheatingLog } = useCheatingLog();

  // Check if current user has already submitted this exam
  useEffect(() => {
    const verifyAttempt = async () => {
      if (examId) {
        try {
          setCheckingAttempt(true);
          const response = await axiosInstance.get(`/api/users/results/check/${examId}`);
          if (response.data.hasAttempted) {
            setHasAlreadyAttempted(true);
          }
        } catch (err) {
          console.error("Error checking exam attempt:", err);
        } finally {
          setCheckingAttempt(false);
        }
      }
    };
    verifyAttempt();
  }, [examId]);

  const handleCertifyChange = () => {
    setCertify(!certify);
  };
  const handleTest = () => {
    // Check if the test date is valid here
    const isValid = true; // Replace with your date validation logic
    console.log('Test link');
    if (isValid && isVerified) {
      // Reset the cheating log for a fresh start of the exam
      resetCheatingLog(examId);
      
      // Replace 'examid' and 'TestId' with the actual values
      navigate(`/exam/${examId}/${testId}`);
    } else if (!isVerified) {
      toast.error('Please verify your identity first.');
    } else {
      // Display an error message or handle invalid date
      toast.error('Test date is not valid.');
    }
  };

  const handleIdentityVerify = (status) => {
    setIsVerified(status);
  };

  return (
    <Card>
      <CardContent>
        {!isVerified ? (
          <IdentityVerification
            onVerify={handleIdentityVerify}
            profileImage={userInfo?.profileImage}
          />
        ) : (
          <>
            <Typography variant="h2" mb={3}>
              Description
            </Typography>
            <Typography>
              This practice test will allow you to measure your skills at the beginner level by
              the way of various multiple choice questions. We recommend you to score at least 75% in
              this test before moving to the next level questionnaire. It will help you in identifying
              your strength and development areas. Based on the same you can plan your next steps in
              learning skills and preparing for job placements.
            </Typography>



            <>
              <Typography variant="h3" mb={3} mt={3}>
                Test Instructions
              </Typography>
              <List>
                <ol>
                  <li>
                    <ListItemText>
                      <Typography variant="body1">
                        This Practice Test consists of only <strong>MCQ questions.</strong>
                      </Typography>
                    </ListItemText>
                  </li>

                  <li>
                    <ListItemText>
                      <Typography variant="body1">
                        There is <strong>No Negative Marking</strong> for wrong answers.
                      </Typography>
                    </ListItemText>
                  </li>
                  <li>
                    <ListItemText>
                      <Typography variant="body1">
                        <strong>Do Not switch tabs </strong> while taking the test.
                        <strong> Switching Tabs will Block / End the test automatically.</strong>
                      </Typography>
                    </ListItemText>
                  </li>
                  <li>
                    <ListItemText>
                      <Typography variant="body1">
                        The test will only run in <strong>full screen mode.</strong> Do not switch
                        back to tab mode. Test will end automatically.
                      </Typography>
                    </ListItemText>
                  </li>
                  <li>
                    <ListItemText>
                      <Typography variant="body1">
                        You may need to use blank sheets for rough work. Please arrange for blank
                        sheets before starting.
                      </Typography>
                    </ListItemText>
                  </li>
                  <li>
                    <ListItemText>
                      <Typography variant="body1">
                        Clicking on Next will save the answer.
                      </Typography>
                    </ListItemText>
                  </li>
                  <li>
                    <ListItemText>
                      <Typography variant="body1">
                        Questions can be reattempted till the time test is running.
                      </Typography>
                    </ListItemText>
                  </li>
                  <li>
                    <ListItemText>
                      <Typography variant="body1">
                        Click on the finish test once you are done with the test.
                      </Typography>
                    </ListItemText>
                  </li>
                  <li>
                    <ListItemText>
                      <Typography variant="body1">
                        You will be able to view the scores once your faculty publishes the result.
                      </Typography>
                    </ListItemText>
                  </li>
                </ol>
              </List>
            </>
            <Typography variant="h3" mb={3} mt={3}>
              Confirmation
            </Typography>
            <Typography mb={3}>
              Your actions shall be proctored and any signs of wrongdoing may lead to suspension or
              cancellation of your test.
            </Typography>
            <Stack direction="column" alignItems="center" spacing={3}>
              <FormControlLabel
                control={
                  <Checkbox checked={certify} onChange={handleCertifyChange} color="primary" />
                }
                label="I certify that I have carefully read and agree to all of the instructions mentioned above"
              />
              <div style={{ display: 'flex', padding: '2px', margin: '10px' }}>
                {hasAlreadyAttempted ? (
                  <Typography variant="h5" color="error" fontWeight="bold">
                    You have already submitted this exam and cannot take it again.
                  </Typography>
                ) : checkingAttempt ? (
                  <Button variant="contained" disabled>Checking Status...</Button>
                ) : (
                  <Button variant="contained" color="primary" disabled={!certify} onClick={handleTest}>
                    Start Test
                  </Button>
                )}
              </div>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const imgUrl =
  'https://images.unsplash.com/photo-1542831371-29b0f74f9713?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80';

export default function ExamDetails() {
  return (
    <>
      <Grid container sx={{ height: '100vh' }}>
        <Grid
          item
          xs={false}
          sm={4}
          md={7}
          sx={{
            backgroundImage: `url(${imgUrl})`, // 'url(https://source.unsplash.com/random?wallpapers)',
            backgroundRepeat: 'no-repeat',
            backgroundColor: (t) =>
              t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.grey[900],
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <Grid item xs={12} sm={8} md={5} component={Paper} elevation={6} square>
          <DescriptionAndInstructions />
        </Grid>
      </Grid>
    </>
  );
}
