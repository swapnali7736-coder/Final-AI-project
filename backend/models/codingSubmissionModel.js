import mongoose from "mongoose";

const codingSubmissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CodingQuestion",
      required: true,
    },
    examId: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "passed", "failed", "error"],
      default: "pending",
    },
    executionTime: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure a user can only have one submission per question
codingSubmissionSchema.index({ userId: 1, questionId: 1 }, { unique: true });

const CodingSubmission = mongoose.model("CodingSubmission", codingSubmissionSchema);

export default CodingSubmission;
