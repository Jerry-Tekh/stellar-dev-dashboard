import express from 'express';
import cors from 'cors';
import {
  getSnapshot,
  getFlakyTests,
  updateFlakyTestStatus,
  getSelfHealingLogs,
  generateTestCases,
  triggerTestRun,
  getRunLogs,
  getTestRuns
} from './engine.js';

const app = express();
const port = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'qa-service', timestamp: new Date().toISOString() });
});

// Snapshot metrics
app.get('/api/v1/qa/snapshot', (req, res) => {
  res.json(getSnapshot());
});

// Flaky tests
app.get('/api/v1/qa/flaky', (req, res) => {
  res.json(getFlakyTests());
});

// Update flaky test status (quarantine / restore)
app.put('/api/v1/qa/flaky/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status || !['active', 'quarantined'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be "active" or "quarantined"' });
  }
  const updated = updateFlakyTestStatus(id, status);
  if (!updated) {
    return res.status(404).json({ error: 'Flaky test not found' });
  }
  res.json(updated);
});

// Self-healing logs
app.get('/api/v1/qa/self-healing', (req, res) => {
  res.json(getSelfHealingLogs());
});

// AI test generation
app.post('/api/v1/qa/generate', (req, res) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'filePath parameter is required' });
  }
  try {
    const result = generateTestCases(filePath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Launch new test run
app.post('/api/v1/qa/runs', (req, res) => {
  const { trigger } = req.body;
  const newRun = triggerTestRun(trigger || 'manual');
  res.status(202).json(newRun);
});

// Get test runs list
app.get('/api/v1/qa/runs', (req, res) => {
  res.json(getTestRuns());
});

// Get run logs
app.get('/api/v1/qa/runs/:id/logs', (req, res) => {
  const { id } = req.params;
  const logs = getRunLogs(id);
  if (logs === 'Run not found') {
    return res.status(404).send(logs);
  }
  res.type('text/plain').send(logs);
});

app.listen(port, () => {
  console.log(`QA Service running on port ${port}`);
});
