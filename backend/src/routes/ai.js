const express = require('express');
const { authenticate } = require('../middleware/auth');
const { summarizeTicket, polishReply, suggestReply } = require('../services/aiService');
const router = express.Router();

router.use(authenticate);

// Summarize ticket + suggest next step
router.post('/summarize/:ticketId', async (req, res) => {
  const db = req.app.get('db');
  try {
    const t = await db.query('SELECT * FROM tickets WHERE id=$1', [req.params.ticketId]);
    if (!t.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    const msgs = await db.query(
      'SELECT m.*, u.name as author_name FROM messages m LEFT JOIN users u ON m.user_id=u.id WHERE m.ticket_id=$1 ORDER BY m.created_at',
      [req.params.ticketId]
    );
    const result = await summarizeTicket(
      t.rows[0].title,
      t.rows[0].description,
      msgs.rows
    );

    let summary = result;
    let nextStep = null;

    if (result.includes('SUMMARY:') && result.includes('NEXT STEP:')) {
      const parts = result.split('NEXT STEP:');
      summary = parts[0].replace('SUMMARY:', '').trim();
      nextStep = parts[1].trim();
    }

    await db.query(
      'UPDATE tickets SET ai_summary=$1 WHERE id=$2',
      [summary, req.params.ticketId]
    );

    res.json({ summary, nextStep });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI error: ' + err.message });
  }
});

// Suggest reply with tone
router.post('/suggest-reply/:ticketId', async (req, res) => {
  const db = req.app.get('db');
  const { tone = 'formal' } = req.body;
  try {
    const t = await db.query('SELECT * FROM tickets WHERE id=$1', [req.params.ticketId]);
    if (!t.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    const msgs = await db.query(
      'SELECT m.*, u.name as author_name FROM messages m LEFT JOIN users u ON m.user_id=u.id WHERE m.ticket_id=$1 ORDER BY m.created_at DESC LIMIT 6',
      [req.params.ticketId]
    );
    const suggestion = await suggestReply(
      t.rows[0].title,
      t.rows[0].description,
      msgs.rows.reverse(),
      tone
    );
    res.json({ suggestion });
  } catch (err) {
    res.status(500).json({ error: 'AI error: ' + err.message });
  }
});

// Polish reply with tone
router.post('/polish-reply', async (req, res) => {
  const { draft, context, tone = 'formal' } = req.body;
  if (!draft) return res.status(400).json({ error: 'Draft required' });
  try {
    const polished = await polishReply(draft, context || '', tone);
    res.json({ polished });
  } catch (err) {
    res.status(500).json({ error: 'AI error: ' + err.message });
  }
});

// Get agents list for assignment
router.get('/agents', async (req, res) => {
  const db = req.app.get('db');
  try {
    const result = await db.query(
      "SELECT id, name, email FROM users WHERE role IN ('agent', 'admin') ORDER BY name"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;