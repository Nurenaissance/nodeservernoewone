import express from 'express';
import { messageQueue } from '../queues/workerQueues.js';

const router = express.Router();

router.get("/job-status/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const job = await messageQueue.getJob(jobId);

    if (!job) {
      return res.status(404).send({ status: 404, message: "Job not found" });
    }

    const state = await job.getState();
    const result = job.returnvalue;
    const error = job.failedReason;

    // Get message ID from either result or job data
    let messageID = null;
    if (result && result.messageID) {
      messageID = result.messageID;
    } else if (job.data && job.data.messageID) {
      messageID = job.data.messageID;
    }

    return res.status(200).send({
      status: 200,
      jobId,
      state,
      messageID,
      contact: job.data.contact,
      templateName: job.data.templateData?.name,
      error: error || null,
      completed: state === 'completed'
    });

  } catch (error) {
    console.error("Error in /job-status:", error.message);
    res.status(500).send({ status: 500, message: "Internal server error" });
  }
});

export default router;