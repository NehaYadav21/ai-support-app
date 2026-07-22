const Bull = require('bull');
const { autoResolveCommonIssue } = require('../services/aiService');

let autoResolveQueue;

function initQueues(db, io) {
  autoResolveQueue = new Bull('auto-resolve', process.env.REDIS_URL);

  autoResolveQueue.process(async (job) => {
    const { ticketId } = job.data;
    console.log(`Processing auto-resolve job for ticket: ${ticketId}`);

    const t = await db.query('SELECT * FROM tickets WHERE id=$1', [ticketId]);
    if (!t.rows.length) return;
    const ticket = t.rows[0];

    const resolution = await autoResolveCommonIssue(ticket.title, ticket.description);

    if (resolution) {
      await db.query(
        `UPDATE tickets SET status='resolved', auto_resolved=true, ai_suggested_reply=$1 WHERE id=$2`,
        [resolution, ticketId]
      );
      await db.query(
        `INSERT INTO messages (ticket_id, content, is_internal) VALUES ($1, $2, false)`,
        [ticketId, `[Auto-resolved by AI]\n\n${resolution}`]
      );
      io.emit('ticket:updated', { id: ticketId, status: 'resolved', auto_resolved: true });
      io.emit('ticket:auto_resolved', { ticketId, resolution });
      console.log(`Ticket ${ticketId} auto-resolved successfully`);
    } else {
      console.log(`Ticket ${ticketId} could not be auto-resolved, escalating`);
    }
  });

  autoResolveQueue.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  autoResolveQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
  });

  console.log('✅ Background job queues initialized');
}

function addAutoResolveJob(ticketId) {
  if (!autoResolveQueue) {
    console.warn('Queue not initialized yet');
    return;
  }
  autoResolveQueue.add(
    { ticketId },
    {
      delay: 2000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );
  console.log(`Auto-resolve job added for ticket: ${ticketId}`);
}

module.exports = { initQueues, addAutoResolveJob };