const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET all users (admin only)
router.get('/', authorize('admin'), async (req, res) => {
  const db = req.app.get('db');
  try {
    const result = await db.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET current logged in user
router.get('/me', async (req, res) => {
  const db = req.app.get('db');
  try {
    const result = await db.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE current user profile
router.patch('/me', async (req, res) => {
  const db = req.app.get('db');
  const { name, email } = req.body;
  const fields = [], params = [];
  if (name) { params.push(name); fields.push(`name=$${params.length}`); }
  if (email) { params.push(email); fields.push(`email=$${params.length}`); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.user.id);
  try {
    const result = await db.query(
      `UPDATE users SET ${fields.join(',')} WHERE id=$${params.length} RETURNING id, name, email, role`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE user (admin only)
router.delete('/:id', authorize('admin'), async (req, res) => {
  const db = req.app.get('db');
  try {
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;