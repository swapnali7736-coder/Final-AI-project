import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  toggleResultVisibility,
  getAllResults,
  checkAttempt,
  saveResult,
  getResultsByExamId,
  getUserResults,
} from "../controllers/resultController.js";

const resultRoutes = express.Router();

// All routes are protected
resultRoutes.use(protect);

// Save result
resultRoutes.post("/results", saveResult);

// Get all results (for teachers)
resultRoutes.get("/results/all", getAllResults);

// Get results for a specific exam (for teachers)
resultRoutes.get("/results/exam/:examId", getResultsByExamId);

// Get results for current user
resultRoutes.get("/results/user", getUserResults);

// Check if current user has already attempted an exam
resultRoutes.get("/results/check/:examId", checkAttempt);

// Toggle result visibility
resultRoutes.put(
  "/results/:resultId/toggle-visibility",
  toggleResultVisibility
);

export default resultRoutes;
