const express = require('express');
const nodemailer = require('nodemailer');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY
  }
});

router.post('/send', authenticate, async (req, res) => {
  const db = req.app.get('db');
  const { ticketId, to, subject, body } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject and body are required' });
  }
  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to,
      subject,
      text: body,
      html: `<div style="font-family:sans-serif;max-width:600px">${body.replace(/\n/g, '<br>')}</div>`
    });
    await db.query(
      'INSERT INTO email_logs (ticket_id, direction, from_email, to_email, subject, body) VALUES ($1,$2,$3,$4,$5,$6)',
      [ticketId, 'outbound', process.env.FROM_EMAIL, to, subject, body]
    );
    await db.query(
      'INSERT INTO messages (ticket_id, user_id, content, is_email) VALUES ($1,$2,$3,true)',
      [ticketId, req.user.id, `Email sent to ${to}: ${body}`]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Email failed: ' + err.message });
  }
});

router.post('/inbound', async (req, res) => {
  const db = req.app.get('db');
  const io = req.app.get('io');
  const { from, subject, text, headers } = req.body;
  try {
    const result = await db.query(`
      INSERT INTO tickets (title, description, email_thread_id, status, priority)
      VALUES ($1, $2, $3, 'open', 'medium') RETURNING *`,
      [subject || 'Email Support Request', text || '', headers?.['Message-ID'] || null]
    );
    const ticket = result.rows[0];
    await db.query(
      'INSERT INTO email_logs (ticket_id, direction, from_email, subject, body) VALUES ($1,$2,$3,$4,$5)',
      [ticket.id, 'inbound', from, subject, text]
    );
    io.emit('ticket:created', ticket);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

module.exports = router;