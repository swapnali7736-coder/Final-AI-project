import asyncHandler from "express-async-handler";
import Result from "../models/resultModel.js";
import Question from "../models/quesModel.js";
import CodingQuestion from "../models/codingQuestionModel.js";
import CodingSubmission from "../models/codingSubmissionModel.js";

// @desc    Save exam result
// @route   POST /api/results
// @access  Private
const saveResult = asyncHandler(async (req, res) => {
  const { examId, answers } = req.body;

  if (!examId || !answers) {
    res.status(400);
    throw new Error("Please provide examId and answers");
  }

  // Check if result already exists for this user and exam
  const existingResult = await Result.findOne({
    examId,
    userId: req.user._id,
  });

  if (existingResult) {
    res.status(400);
    throw new Error("You have already submitted this exam.");
  }

  // Get all questions for this exam to calculate marks
  const questions = await Question.find({ examId });

  // Calculate marks
  let totalMarks = 0;
  let correctAnswers = 0;

  for (const question of questions) {
    const userAnswer = answers[question._id.toString()];
    if (userAnswer) {
      const correctOption = question.options.find((opt) => opt.isCorrect);
      if (correctOption && correctOption._id.toString() === userAnswer) {
        totalMarks += question.ansmarks || 1;
        correctAnswers++;
      }
    }
  }

  // Calculate percentage
  const totalQuestions = questions.length;
  const percentage =
    totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

  const result = await Result.create({
    examId,
    userId: req.user._id,
    answers: new Map(Object.entries(answers)),
    totalMarks,
    percentage,
    showToStudent: false, // Default to false, teacher can change this
  });

  res.status(201).json({
    success: true,
    data: result,
  });
});

// @desc    Get results for a specific exam (for teachers)
// @route   GET /api/results/exam/:examId
// @access  Private
const getResultsByExamId = asyncHandler(async (req, res) => {
  const { examId } = req.params;

  // Get MCQ results
  const results = await Result.find({ examId })
    .populate("userId", "name email")
    .sort({ createdAt: -1 });

  // Get coding submissions for this exam
  const codingSubmissions = await CodingSubmission.find({ examId }).populate("questionId");

  // Combine MCQ and coding results
  const combinedResults = results.map((result) => {
    const studentCodingSubmissions = codingSubmissions
      .filter((sub) => sub.userId.toString() === result.userId._id.toString())
      .map((sub) => ({
        question: sub.questionId?.question || "Unknown Question",
        code: sub.code,
        language: sub.language,
        status: sub.status,
        executionTime: sub.executionTime,
      }));

    return {
      ...result.toObject(),
      codingSubmissions: studentCodingSubmissions,
    };
  });

  res.status(200).json({
    success: true,
    data: combinedResults,
  });
});

// @desc    Get results for current user
// @route   GET /api/results/user
// @access  Private
const getUserResults = asyncHandler(async (req, res) => {
  const results = await Result.find({
    userId: req.user._id,
    showToStudent: true, // Only show results that are marked as visible
  }).sort({
    createdAt: -1,
  });

  // Get coding submissions for each exam
  const resultsWithCoding = await Promise.all(
    results.map(async (result) => {
      const submissions = await CodingSubmission.find({
        examId: result.examId,
        userId: req.user._id,
      }).populate("questionId");

      return {
        ...result.toObject(),
        codingSubmissions: submissions.map((sub) => ({
          question: sub.questionId?.question || "Unknown Question",
          code: sub.code,
          language: sub.language,
          status: sub.status,
        })),
      };
    })
  );

  res.status(200).json({
    success: true,
    data: resultsWithCoding,
  });
});

// @desc    Toggle showToStudent for a result
// @route   PUT /api/results/:resultId/toggle-visibility
// @access  Private (Teacher only)
const toggleResultVisibility = asyncHandler(async (req, res) => {
  const { resultId } = req.params;

  const result = await Result.findById(resultId);
  if (!result) {
    res.status(404);
    throw new Error("Result not found");
  }

  result.showToStudent = !result.showToStudent;
  await result.save();

  res.status(200).json({
    success: true,
    data: result,
  });
});

// @desc    Get all results (for teachers)
// @route   GET /api/results/all
// @access  Private (Teacher only)
const getAllResults = asyncHandler(async (req, res) => {
  // Check if user is a teacher
  if (req.user.role !== "teacher") {
    res.status(403);
    throw new Error("Not authorized to view all results");
  }

  const results = await Result.find()
    .populate("userId", "name email")
    .sort({ createdAt: -1 });

  // Get all coding submissions
  const codingSubmissions = await CodingSubmission.find().populate("questionId");

  // Combine MCQ and coding results
  const combinedResults = results.map((result) => {
    const studentCodingSubmissions = codingSubmissions
      .filter((sub) => sub.userId.toString() === result.userId._id.toString())
      .map((sub) => ({
        question: sub.questionId?.question || "Unknown Question",
        code: sub.code,
        language: sub.language,
        status: sub.status,
        executionTime: sub.executionTime,
      }));

    return {
      ...result.toObject(),
      codingSubmissions: studentCodingSubmissions,
    };
  });

  res.status(200).json({
    success: true,
    data: combinedResults,
  });
});

// @desc    Check if current user has already attempted an exam
// @route   GET /api/results/check/:examId
// @access  Private
const checkAttempt = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const result = await Result.findOne({
    examId,
    userId: req.user._id,
  });

  res.status(200).json({
    hasAttempted: !!result,
    result: result || null,
  });
});

export {
  saveResult,
  getResultsByExamId,
  getUserResults,
  toggleResultVisibility,
  getAllResults,
  checkAttempt,
};
