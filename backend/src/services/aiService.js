const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function chat(prompt, maxTokens = 500) {
  const result = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
  });
  return result.choices[0].message.content.trim();
}

async function classifyTicket(db, ticketId, title, description) {
  try {
    const text = await chat(`Classify this support ticket.
Title: ${title}
Description: ${description}
Respond ONLY in JSON format (no other text, no markdown):
{"category": "technical|billing|account|shipping|general", "priority": "low|medium|high|urgent", "auto_resolvable": true|false, "confidence": 85}`);
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    await db.query(
      'UPDATE tickets SET category=$1, priority=$2, ai_confidence=$3 WHERE id=$4',
      [parsed.category, parsed.priority, parsed.confidence || 80, ticketId]
    );
    if (parsed.auto_resolvable && (parsed.confidence || 80) >= 80) {
      const { addAutoResolveJob } = require('../jobs/queue');
      addAutoResolveJob(ticketId);
    }
    return parsed;
  } catch (err) {
    console.error('classifyTicket error:', err.message);
  }
}

async function summarizeTicket(title, description, messages = []) {
  const conversation = messages
    .map(m => `${m.author_name || 'User'}: ${m.content}`)
    .join('\n');
  return await chat(`Summarize this support ticket in 2-3 sentences for an agent.
Title: ${title}
Description: ${description}
${conversation ? `Conversation:\n${conversation}` : ''}

Also suggest ONE next troubleshooting step the agent should take.
Format your response as:
SUMMARY: [your summary here]
NEXT STEP: [one specific action to take]`);
}

async function polishReply(draftReply, ticketContext, tone = 'formal') {
  const toneGuide = {
    formal: 'professional and formal',
    friendly: 'warm, friendly and conversational',
    apologetic: 'deeply apologetic, empathetic and understanding'
  };
  return await chat(`Polish this customer support reply to be ${toneGuide[tone] || 'professional'}.

Ticket context: ${ticketContext}
Draft reply: ${draftReply}

Return ONLY the polished reply, nothing else.`);
}

async function suggestReply(title, description, messages = [], tone = 'formal') {
  const toneGuide = {
    formal: 'professional and formal',
    friendly: 'warm and friendly',
    apologetic: 'apologetic and empathetic'
  };
  const conversation = messages
    .slice(-6)
    .map(m => `${m.author_name || 'User'}: ${m.content}`)
    .join('\n');
  return await chat(`You are a customer support agent. Write a ${toneGuide[tone] || 'professional'} reply.
Title: ${title}
Description: ${description}
${conversation ? `Recent messages:\n${conversation}` : ''}
Write a helpful reply under 150 words.`);
}

async function autoResolveCommonIssue(title, description) {
  const text = await chat(`This is a support ticket. Write a complete self-service resolution.
Title: ${title}
Description: ${description}
If you cannot resolve it confidently, respond with exactly: ESCALATE
Otherwise write the resolution reply.`);
  return text === 'ESCALATE' ? null : text;
}

module.exports = {
  classifyTicket,
  summarizeTicket,
  polishReply,
  suggestReply,
  autoResolveCommonIssue
};