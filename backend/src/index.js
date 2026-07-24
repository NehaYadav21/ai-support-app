require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
const setupDatabase = require('./setup');

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const userRoutes = require('./routes/users');
const emailRoutes = require('./routes/email');
const aiRoutes = require('./routes/ai');
const { initQueues } = require('./jobs/queue');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL, methods: ['GET', 'POST'] }
});

const db = new Pool({ connectionString: process.env.DATABASE_URL });
app.set('db', db);
app.set('io', io);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/ai', aiRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('join_ticket', (ticketId) => socket.join(`ticket_${ticketId}`));
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

initQueues(db, io);

const PORT = process.env.PORT || 4000;
setupDatabase().then(() => {
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});