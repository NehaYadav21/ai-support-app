const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

function getDueAt(priority) {
  const hours = { low: 48, medium: 24, high: 12, urgent: 2 };
  const h = hours[priority] || 24;
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

async function logAction(db, ticketId, action, userId) {
  try {
    await db.query(
      'INSERT INTO ticket_logs (ticket_id, action, performed_by) VALUES ($1,$2,$3)',
      [ticketId, action, userId]
    );
  } catch (err) {
    console.error('logAction error:', err.message);
  }
}

router.get('/', async (req, res) => {
  const db = req.app.get('db');
  const { status, priority, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = [], params = [];
  if (status) { params.push(status); where.push(`t.status=$${params.length}`); }
  if (priority) { params.push(priority); where.push(`t.priority=$${params.length}`); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  params.push(limit, offset);
  try {
    const result = await db.query(`
      SELECT t.*,
        u.name as assigned_name,
        c.name as creator_name,
        a.name as agent_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users c ON t.created_by = c.id
      LEFT JOIN users a ON t.assigned_agent_id = a.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const countResult = await db.query(
      `SELECT COUNT(*) FROM tickets t ${whereClause}`,
      params.slice(0, -2)
    );
    res.json({
      tickets: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  const db = req.app.get('db');
  try {
    const ticket = await db.query(`
      SELECT t.*,
        u.name as assigned_name,
        c.name as creator_name,
        c.email as creator_email,
        a.name as agent_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users c ON t.created_by = c.id
      LEFT JOIN users a ON t.assigned_agent_id = a.id
      WHERE t.id=$1`, [req.params.id]);
    if (!ticket.rows.length) return res.status(404).json({ error: 'Ticket not found' });

    const messages = await db.query(
      'SELECT m.*, u.name as author_name, u.role as author_role FROM messages m LEFT JOIN users u ON m.user_id=u.id WHERE m.ticket_id=$1 ORDER BY m.created_at',
      [req.params.id]
    );

    const logs = await db.query(
      'SELECT l.*, u.name as performed_by_name FROM ticket_logs l LEFT JOIN users u ON l.performed_by=u.id WHERE l.ticket_id=$1 ORDER BY l.created_at DESC LIMIT 10',
      [req.params.id]
    );

    let pastTickets = { rows: [] };
    if (ticket.rows[0].created_by) {
      pastTickets = await db.query(
        'SELECT id, title, status, created_at FROM tickets WHERE created_by=$1 AND id!=$2 ORDER BY created_at DESC LIMIT 5',
        [ticket.rows[0].created_by, req.params.id]
      );
    }

    res.json({
      ticket: ticket.rows[0],
      messages: messages.rows,
      logs: logs.rows,
      pastTickets: pastTickets.rows
    });
  } catch (err) {
    console.error('GET ticket error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  const db = req.app.get('db');
  const io = req.app.get('io');
  const { title, description, priority = 'medium', category, assigned_to } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
  const due_at = getDueAt(priority);
  try {
    const result = await db.query(`
      INSERT INTO tickets (title, description, priority, category, assigned_to, created_by, due_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, description, priority, category, assigned_to, req.user.id, due_at]
    );
    const ticket = result.rows[0];
    await logAction(db, ticket.id, `Ticket created by ${req.user.email}`, req.user.id);
    const { classifyTicket } = require('../services/aiService');
    classifyTicket(db, ticket.id, title, description).catch(console.error);
    io.emit('ticket:created', ticket);
    res.status(201).json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', async (req, res) => {
  const db = req.app.get('db');
  const io = req.app.get('io');
  const { status, priority, assigned_to, title, description, tone } = req.body;
  const fields = [], params = [];
  if (status) { params.push(status); fields.push(`status=$${params.length}`); }
  if (priority) { params.push(priority); fields.push(`priority=$${params.length}`); }
  if (assigned_to !== undefined) { params.push(assigned_to); fields.push(`assigned_to=$${params.length}`); }
  if (title) { params.push(title); fields.push(`title=$${params.length}`); }
  if (description) { params.push(description); fields.push(`description=$${params.length}`); }
  if (tone) { params.push(tone); fields.push(`tone=$${params.length}`); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(new Date(), req.params.id);
  try {
    const result = await db.query(
      `UPDATE tickets SET ${fields.join(',')}, updated_at=$${params.length - 1} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    if (status) await logAction(db, req.params.id, `Status changed to ${status}`, req.user.id);
    if (priority) await logAction(db, req.params.id, `Priority changed to ${priority}`, req.user.id);
    io.to(`ticket_${req.params.id}`).emit('ticket:updated', result.rows[0]);
    io.emit('ticket:updated', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/assign', async (req, res) => {
  const db = req.app.get('db');
  const io = req.app.get('io');
  const { agent_id } = req.body;
  try {
    const result = await db.query(
      'UPDATE tickets SET assigned_agent_id=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [agent_id, req.params.id]
    );
    await logAction(db, req.params.id, `Ticket assigned to agent`, req.user.id);
    io.emit('ticket:updated', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/escalate', async (req, res) => {
  const db = req.app.get('db');
  const io = req.app.get('io');
  try {
    const due_at = getDueAt('urgent');
    const result = await db.query(
      `UPDATE tickets SET priority='urgent', due_at=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [due_at, req.params.id]
    );
    await logAction(db, req.params.id, `Ticket escalated to urgent`, req.user.id);
    io.emit('ticket:updated', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authorize('admin'), async (req, res) => {
  const db = req.app.get('db');
  try {
    await db.query('DELETE FROM tickets WHERE id=$1', [req.params.id]);
    req.app.get('io').emit('ticket:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/messages', async (req, res) => {
  const db = req.app.get('db');
  const io = req.app.get('io');
  const { content, is_internal = false } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  try {
    const result = await db.query(
      'INSERT INTO messages (ticket_id, user_id, content, is_internal) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, req.user.id, content, is_internal]
    );
    await logAction(db, req.params.id, `Message sent`, req.user.id);
    io.to(`ticket_${req.params.id}`).emit('message:new', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/logs', async (req, res) => {
  const db = req.app.get('db');
  try {
    const logs = await db.query(
      'SELECT l.*, u.name as performed_by_name FROM ticket_logs l LEFT JOIN users u ON l.performed_by=u.id WHERE l.ticket_id=$1 ORDER BY l.created_at DESC LIMIT 10',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
