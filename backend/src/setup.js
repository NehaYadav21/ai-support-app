const { Pool } = require('pg');

async function setupDatabase() {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'agent' CHECK (role IN ('admin', 'agent', 'customer')),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        category VARCHAR(100),
        ai_summary TEXT,
        ai_suggested_reply TEXT,
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        email_thread_id VARCHAR(255),
        auto_resolved BOOLEAN DEFAULT FALSE,
        assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
        due_at TIMESTAMP,
        ai_confidence INTEGER,
        tone VARCHAR(50) DEFAULT 'formal',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        is_internal BOOLEAN DEFAULT FALSE,
        is_email BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
        direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
        from_email VARCHAR(255),
        to_email VARCHAR(255),
        subject VARCHAR(500),
        body TEXT,
        message_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS ticket_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
        action VARCHAR(255) NOT NULL,
        performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
        uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        filename VARCHAR(255) NOT NULL,
        filepath VARCHAR(500) NOT NULL,
        filesize INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Database tables created successfully!');
    await db.end();
  } catch (err) {
    console.error('Database setup error:', err.message);
    await db.end();
  }
}

module.exports = setupDatabase;