import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

const API = axios.create({ baseURL: 'http://localhost:4000/api' });
API.interceptors.request.use(cfg => {
  const t = localStorage.getItem('token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const AuthCtx = createContext();
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } });
  const login = (token, u) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(u)); setUser(u); };
  const logout = () => { localStorage.clear(); setUser(null); };
  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault(); setErr('');
    try {
      const { data } = await API.post('/auth/login', form);
      login(data.token, data.user);
      nav('/dashboard');
    } catch (e) { setErr(e.response?.data?.error || 'Login failed'); }
  };
  return (
    <div style={styles.center}>
      <div style={styles.card}>
        <h2 style={styles.heading}>🎫 SupportAI</h2>
        <p style={styles.sub}>Sign in to your account</p>
        {err && <div style={styles.error}>{err}</div>}
        <input style={styles.input} placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} type="email"/>
        <input style={styles.input} placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} type="password"/>
        <button style={styles.btn} onClick={submit}>Sign In</button>
        <p style={{textAlign:'center',marginTop:12,fontSize:13,color:'#666'}}>No account? <Link to="/register">Register</Link></p>
      </div>
    </div>
  );
}

function Register() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault(); setErr('');
    try {
      const { data } = await API.post('/auth/register', form);
      login(data.token, data.user);
      nav('/dashboard');
    } catch (e) { setErr(e.response?.data?.error || 'Registration failed'); }
  };
  return (
    <div style={styles.center}>
      <div style={styles.card}>
        <h2 style={styles.heading}>Create Account</h2>
        {err && <div style={styles.error}>{err}</div>}
        <input style={styles.input} placeholder="Full name" value={form.name} onChange={e => setForm({...form, name: e.target.value})}/>
        <input style={styles.input} placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} type="email"/>
        <input style={styles.input} placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} type="password"/>
        <button style={styles.btn} onClick={submit}>Register</button>
        <p style={{textAlign:'center',marginTop:12,fontSize:13,color:'#666'}}>Have account? <Link to="/login">Login</Link></p>
      </div>
    </div>
  );
}

function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({ open: 0, inProgress: 0, resolved: 0 });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = io('http://localhost:4000');
    socket.on('ticket:created', t => setTickets(prev => [t, ...prev]));
    socket.on('ticket:updated', updated => setTickets(prev => prev.map(t => t.id === updated.id ? {...t, ...updated} : t)));
    socket.on('ticket:deleted', ({ id }) => setTickets(prev => prev.filter(t => t.id !== id)));
    fetchTickets();
    return () => socket.disconnect();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/tickets');
      setTickets(data.tickets);
      setStats({
        open: data.tickets.filter(t => t.status === 'open').length,
        inProgress: data.tickets.filter(t => t.status === 'in_progress').length,
        resolved: data.tickets.filter(t => t.status === 'resolved').length,
      });
    } finally { setLoading(false); }
  };

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);
  const priorityColor = p => ({ urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' }[p] || '#888');
  const statusColor = s => ({ open: '#3b82f6', in_progress: '#8b5cf6', resolved: '#22c55e', closed: '#6b7280' }[s] || '#888');

  const isOverdue = t => t.due_at && new Date(t.due_at) < new Date() && t.status !== 'resolved' && t.status !== 'closed';

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={{fontWeight:700,fontSize:18}}>🎫 SupportAI</span>
        <div style={{display:'flex',gap:12,alignItems:'center'}}>
          <span style={{fontSize:13,color:'#888'}}>Hi, {user?.name}</span>
          <button style={styles.btnSm} onClick={() => nav('/tickets/new')}>+ New Ticket</button>
          <button style={{...styles.btnSm, background:'#fee2e2',color:'#ef4444'}} onClick={() => { logout(); nav('/login'); }}>Logout</button>
        </div>
      </header>

      <div style={styles.statRow}>
        {[['🔵 Open', stats.open, '#3b82f6'], ['🟣 In Progress', stats.inProgress, '#8b5cf6'], ['🟢 Resolved', stats.resolved, '#22c55e']].map(([label, val, color]) => (
          <div key={label} style={{...styles.statCard, borderLeft: `4px solid ${color}`}}>
            <div style={{fontSize:28,fontWeight:700,color}}>{val}</div>
            <div style={{fontSize:13,color:'#888',marginTop:2}}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {['all','open','in_progress','resolved','closed'].map(f => (
          <button key={f} style={{...styles.filterBtn, ...(filter===f ? styles.filterActive : {})}} onClick={() => setFilter(f)}>
            {f.replace('_',' ')}
          </button>
        ))}
      </div>

      {loading ? <div style={styles.loading}>Loading tickets…</div> : (
        <div style={styles.ticketList}>
          {filtered.map(ticket => (
            <div key={ticket.id} style={{...styles.ticketRow, border: isOverdue(ticket) ? '1px solid #ef4444' : '1px solid transparent'}} onClick={() => nav(`/tickets/${ticket.id}`)}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:15,marginBottom:3}}>
                  {isOverdue(ticket) && <span style={{color:'#ef4444',marginRight:6}}>⚠️ OVERDUE</span>}
                  {ticket.title}
                </div>
                <div style={{fontSize:12,color:'#888'}}>
                  {ticket.category || 'Uncategorized'} · {ticket.creator_name || 'Unknown'} · {new Date(ticket.created_at).toLocaleDateString()}
                  {ticket.due_at && <span style={{marginLeft:8,color: isOverdue(ticket) ? '#ef4444' : '#888'}}>Due: {new Date(ticket.due_at).toLocaleString()}</span>}
                </div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                {ticket.auto_resolved && <span style={styles.aiBadge}>🤖 Auto</span>}
                {ticket.ai_confidence && <span style={{...styles.aiBadge, background:'#f0fdf4', color:'#16a34a'}}>{ticket.ai_confidence}% confident</span>}
                <span style={{...styles.badge, background: priorityColor(ticket.priority)+'22', color: priorityColor(ticket.priority)}}>{ticket.priority}</span>
                <span style={{...styles.badge, background: statusColor(ticket.status)+'22', color: statusColor(ticket.status)}}>{ticket.status.replace('_',' ')}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={styles.empty}>No tickets found</div>}
        </div>
      )}
    </div>
  );
}

function NewTicket() {
  const nav = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const { data } = await API.post('/tickets', form);
      nav(`/tickets/${data.id}`);
    } catch (e) { setErr(e.response?.data?.error || 'Failed'); } finally { setLoading(false); }
  };
  return (
    <div style={styles.page}>
      <div style={{maxWidth:640,margin:'0 auto'}}>
        <button style={styles.back} onClick={() => nav('/dashboard')}>← Back</button>
        <h2 style={styles.heading}>New Support Ticket</h2>
        {err && <div style={styles.error}>{err}</div>}
        <input style={styles.input} placeholder="Title" value={form.title} onChange={e => setForm({...form, title: e.target.value})}/>
        <textarea style={{...styles.input, minHeight:120, resize:'vertical'}} placeholder="Describe your issue..." value={form.description} onChange={e => setForm({...form, description: e.target.value})}/>
        <select style={styles.input} value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
          {['low','medium','high','urgent'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button style={{...styles.btn, opacity: loading ? 0.6 : 1}} onClick={submit} disabled={loading}>
          {loading ? 'Creating…' : 'Create Ticket'}
        </button>
      </div>
    </div>
  );
}

function StatusBanner({ status }) {
  const config = {
    open: { color: '#3b82f6', bg: '#eff6ff', label: '🔵 Open' },
    in_progress: { color: '#8b5cf6', bg: '#f5f3ff', label: '🟣 In Progress' },
    resolved: { color: '#22c55e', bg: '#f0fdf4', label: '🟢 Resolved' },
    closed: { color: '#6b7280', bg: '#f9fafb', label: '🔴 Closed' },
  };
  const c = config[status] || config.open;
  return (
    <div style={{background: c.bg, borderLeft: `4px solid ${c.color}`, padding:'10px 16px', borderRadius:8, marginBottom:16, fontWeight:600, color: c.color, fontSize:14}}>
      {c.label}
    </div>
  );
}

function TicketDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pastTickets, setPastTickets] = useState([]);
  const [agents, setAgents] = useState([]);
  const [reply, setReply] = useState('');
  const [tone, setTone] = useState('formal');
  const [ai, setAi] = useState({ summary: '', nextStep: '' });
  const [aiLoading, setAiLoading] = useState({});
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    fetchTicket();
    fetchAgents();
    const socket = io('http://localhost:4000');
    socket.emit('join_ticket', id);
    socket.on('message:new', m => setMessages(prev => [...prev, m]));
    socket.on('ticket:updated', t => { if (t.id === id) setTicket(prev => ({...prev, ...t})); });
    return () => socket.disconnect();
  }, [id]);

  const fetchTicket = async () => {
    const { data } = await API.get(`/tickets/${id}`);
    setTicket(data.ticket);
    setMessages(data.messages);
    setLogs(data.logs || []);
    setPastTickets(data.pastTickets || []);
    if (data.ticket.ai_summary) setAi(prev => ({...prev, summary: data.ticket.ai_summary}));
  };

  const fetchAgents = async () => {
    try {
      const { data } = await API.get('/ai/agents');
      setAgents(data);
    } catch {}
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    await API.post(`/tickets/${id}/messages`, { content: reply });
    setReply('');
  };

  const doAI = async (action) => {
    setAiLoading(prev => ({...prev, [action]: true}));
    try {
      if (action === 'summarize') {
        const { data } = await API.post(`/ai/summarize/${id}`);
        setAi({ summary: data.summary, nextStep: data.nextStep });
      } else if (action === 'suggest') {
        const { data } = await API.post(`/ai/suggest-reply/${id}`, { tone });
        setReply(data.suggestion);
      } else if (action === 'polish') {
        const { data } = await API.post('/ai/polish-reply', { draft: reply, context: ticket?.title, tone });
        setReply(data.polished);
      }
    } catch (e) { alert('AI error: ' + (e.response?.data?.error || e.message)); }
    finally { setAiLoading(prev => ({...prev, [action]: false})); }
  };

  const updateStatus = async (status) => {
    await API.patch(`/tickets/${id}`, { status });
    setTicket(prev => ({...prev, status}));
  };

  const escalate = async () => {
    await API.patch(`/tickets/${id}/escalate`);
    setTicket(prev => ({...prev, priority: 'urgent'}));
    alert('Ticket escalated to urgent!');
  };

  const assignAgent = async (agentId) => {
    await API.patch(`/tickets/${id}/assign`, { agent_id: agentId });
    alert('Agent assigned successfully!');
  };

  const roleColor = role => ({ admin: '#ef4444', agent: '#3b82f6', customer: '#22c55e' }[role] || '#888');

  if (!ticket) return <div style={styles.loading}>Loading…</div>;

  const isOverdue = ticket.due_at && new Date(ticket.due_at) < new Date() && ticket.status !== 'resolved';

  return (
    <div style={styles.page}>
      <button style={styles.back} onClick={() => nav('/dashboard')}>← All Tickets</button>

      <StatusBanner status={ticket.status} />

      {isOverdue && (
        <div style={{background:'#fef2f2', border:'1px solid #ef4444', padding:'10px 16px', borderRadius:8, marginBottom:16, color:'#ef4444', fontWeight:600}}>
          ⚠️ This ticket is overdue! Due was: {new Date(ticket.due_at).toLocaleString()}
        </div>
      )}

      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>

        {/* Main Content */}
        <div style={{flex:2,minWidth:300}}>
          <h2 style={{marginTop:0,marginBottom:4}}>{ticket.title}</h2>
          <div style={{fontSize:12,color:'#888',marginBottom:16}}>
            #{ticket.id.slice(0,8)} · {ticket.category || 'uncategorized'} · Created {new Date(ticket.created_at).toLocaleString()}
            {ticket.auto_resolved && <span style={styles.aiBadge}> 🤖 Auto-resolved</span>}
            {ticket.ai_confidence && <span style={{...styles.aiBadge, background:'#f0fdf4', color:'#16a34a', marginLeft:6}}> {ticket.ai_confidence}% confident</span>}
          </div>

          <div style={styles.descBox}>{ticket.description}</div>

          {/* AI Summary + Next Step */}
          {ai.summary && (
            <div style={styles.aiBox}>
              <strong>🤖 AI Summary</strong>
              <p style={{margin:'6px 0 0',fontSize:14}}>{ai.summary}</p>
              {ai.nextStep && (
                <div style={{marginTop:10, padding:'8px 12px', background:'#fef9c3', borderRadius:6, fontSize:13}}>
                  <strong>💡 Suggested Next Step:</strong> {ai.nextStep}
                </div>
              )}
            </div>
          )}

          {/* Conversation Timeline */}
          <h4 style={{marginBottom:8}}>Conversation ({messages.length})</h4>
          <div style={styles.msgList}>
            {messages.length === 0 && <div style={{color:'#bbb',fontSize:13,padding:'12px 0'}}>No messages yet</div>}
            {messages.map(m => (
              <div key={m.id} style={{
                ...styles.msgBubble,
                background: m.user_id === user?.id ? '#eff6ff' : m.user_id === null ? '#faf5ff' : '#f9fafb',
                borderLeft: m.is_internal ? '3px solid #f59e0b' : m.user_id === null ? '3px solid #8b5cf6' : 'none',
                marginLeft: m.user_id === user?.id ? '20%' : '0',
                marginRight: m.user_id === user?.id ? '0' : '20%',
              }}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:11,fontWeight:600,color: roleColor(m.author_role)}}>
                    {m.user_id === null ? '🤖 AI' : m.author_name || 'Unknown'}
                    {m.author_role && <span style={{fontWeight:400,color:'#888',marginLeft:4}}>({m.author_role})</span>}
                    {m.is_internal && <span style={{color:'#f59e0b',marginLeft:4}}>· Internal</span>}
                  </span>
                  <span style={{fontSize:11,color:'#aaa'}}>{new Date(m.created_at).toLocaleTimeString()}</span>
                </div>
                <div style={{fontSize:14,whiteSpace:'pre-wrap'}}>{m.content}</div>
              </div>
            ))}
          </div>

          {/* Tone Selector */}
          <div style={{display:'flex',gap:8,alignItems:'center',marginTop:12,marginBottom:8}}>
            <span style={{fontSize:13,color:'#888'}}>Tone:</span>
            {['formal','friendly','apologetic'].map(t => (
              <button key={t} style={{...styles.filterBtn, ...(tone===t ? styles.filterActive : {}), padding:'4px 10px', fontSize:12}} onClick={() => setTone(t)}>
                {t}
              </button>
            ))}
          </div>

          <textarea style={{...styles.input, minHeight:80, resize:'vertical'}} placeholder="Write a reply..." value={reply} onChange={e => setReply(e.target.value)}/>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
            <button style={styles.btn} onClick={sendReply}>Send Reply</button>
            <button style={styles.btnAi} onClick={() => doAI('suggest')} disabled={aiLoading.suggest}>{aiLoading.suggest ? '…' : '✨ Suggest'}</button>
            <button style={styles.btnAi} onClick={() => doAI('polish')} disabled={!reply || aiLoading.polish}>{aiLoading.polish ? '…' : '✨ Polish'}</button>
          </div>

          {/* Audit Log */}
          <div style={{marginTop:20}}>
            <button style={{...styles.btnSm, marginBottom:8}} onClick={() => setShowLogs(!showLogs)}>
              {showLogs ? '▼' : '▶'} Audit Log ({logs.length})
            </button>
            {showLogs && (
              <div style={{background:'#f9fafb',borderRadius:8,padding:12}}>
                {logs.length === 0 && <div style={{color:'#bbb',fontSize:13}}>No logs yet</div>}
                {logs.map(log => (
                  <div key={log.id} style={{fontSize:12,padding:'4px 0',borderBottom:'1px solid #e5e7eb',color:'#555'}}>
                    <span style={{color:'#888'}}>{new Date(log.timestamp).toLocaleString()}</span>
                    {' · '}{log.action}
                    {log.performed_by_name && <span style={{color:'#3b82f6'}}> by {log.performed_by_name}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={{flex:1,minWidth:220,display:'flex',flexDirection:'column',gap:12}}>

          {/* Actions */}
          <div style={styles.sideCard}>
            <h4 style={{margin:'0 0 12px'}}>Status</h4>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {['open','in_progress','resolved','closed'].map(s => (
                <button key={s} style={{...styles.btnSm, background: ticket.status===s ? '#3b82f6' : '#f3f4f6', color: ticket.status===s ? '#fff' : '#333', textAlign:'left'}} onClick={() => updateStatus(s)}>
                  {s.replace('_',' ')}
                </button>
              ))}
            </div>
            <hr style={{margin:'12px 0',border:'none',borderTop:'1px solid #e5e7eb'}}/>
            <button style={{...styles.btnAi, width:'100%', marginBottom:8}} onClick={() => doAI('summarize')} disabled={aiLoading.summarize}>
              {aiLoading.summarize ? '…' : '🤖 AI Summarize'}
            </button>
            <button style={{...styles.btnSm, width:'100%', background:'#fef2f2', color:'#ef4444', marginBottom:8}} onClick={escalate}>
              🚨 Escalate to Urgent
            </button>
            <div style={{fontSize:12,color:'#888',marginTop:4}}>Priority: <strong style={{color: ticket.priority==='urgent'?'#ef4444':ticket.priority==='high'?'#f97316':'#333'}}>{ticket.priority}</strong></div>
            {ticket.due_at && <div style={{fontSize:12,color: isOverdue?'#ef4444':'#888',marginTop:4}}>Due: <strong>{new Date(ticket.due_at).toLocaleString()}</strong></div>}
          </div>

          {/* Assign Agent */}
          <div style={styles.sideCard}>
            <h4 style={{margin:'0 0 12px'}}>Assign Agent</h4>
            <select style={{...styles.input, marginBottom:8}} onChange={e => e.target.value && assignAgent(e.target.value)}>
              <option value="">Select agent...</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {ticket.agent_name && <div style={{fontSize:12,color:'#888'}}>Currently: <strong>{ticket.agent_name}</strong></div>}
          </div>

          {/* Customer Info */}
          <div style={styles.sideCard}>
            <h4 style={{margin:'0 0 12px'}}>Customer Info</h4>
            <div style={{fontSize:13}}>
              <div style={{marginBottom:4}}>👤 <strong>{ticket.creator_name || 'Unknown'}</strong></div>
              <div style={{color:'#888',fontSize:12,marginBottom:8}}>Created {new Date(ticket.created_at).toLocaleDateString()}</div>
              {pastTickets.length > 0 && (
                <>
                  <div style={{fontWeight:600,fontSize:12,marginBottom:6,color:'#555'}}>Past Tickets ({pastTickets.length})</div>
                  {pastTickets.map(pt => (
                    <div key={pt.id} style={{fontSize:12,padding:'4px 8px',background:'#f9fafb',borderRadius:6,marginBottom:4,cursor:'pointer'}} onClick={() => window.open(`/tickets/${pt.id}`, '_blank')}>
                      <div style={{fontWeight:500}}>{pt.title.slice(0,30)}...</div>
                      <div style={{color:'#888'}}>{pt.status} · {new Date(pt.created_at).toLocaleDateString()}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Ticket Info */}
          <div style={styles.sideCard}>
            <h4 style={{margin:'0 0 12px'}}>Ticket Info</h4>
            <div style={{fontSize:12,color:'#888',display:'flex',flexDirection:'column',gap:4}}>
              <div>ID: <strong>#{ticket.id.slice(0,8)}</strong></div>
              <div>Category: <strong>{ticket.category || 'uncategorized'}</strong></div>
              <div>Priority: <strong>{ticket.priority}</strong></div>
              <div>Status: <strong>{ticket.status}</strong></div>
              {ticket.ai_confidence && <div>AI Confidence: <strong style={{color:'#16a34a'}}>{ticket.ai_confidence}%</strong></div>}
              {ticket.auto_resolved && <div style={{color:'#7c3aed'}}>🤖 Auto-resolved by AI</div>}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui,sans-serif', background: '#f0f4ff', minHeight: '100vh' },
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  card: { background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 20px 60px #0002', width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 },
  heading: { margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: '#1e1b4b' },
  sub: { margin: '0 0 8px', color: '#888', fontSize: 14 },
  input: { padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', transition: 'border 0.2s', background: '#fafafa' },
  btn: { padding: '11px 20px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14, boxShadow: '0 4px 15px #667eea44' },
  btnSm: { padding: '6px 14px', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#444' },
  btnAi: { padding: '8px 14px', background: 'linear-gradient(135deg, #faf5ff, #ede9fe)', color: '#7c3aed', border: '1px solid #e9d5ff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px #7c3aed22' },
  error: { background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, border: '1px solid #fecaca' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #e0e7ff', background: '#fff', padding: '16px 24px', borderRadius: 14, boxShadow: '0 2px 12px #0001', marginBottom: 20 },
  statRow: { display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 120, background: '#fff', padding: '20px 24px', borderRadius: 14, boxShadow: '0 2px 12px #0001' },
  filterBtn: { padding: '7px 16px', border: '1.5px solid #e0e7ff', borderRadius: 20, cursor: 'pointer', fontSize: 13, background: '#fff', color: '#555', fontWeight: 500 },
  filterActive: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', borderColor: 'transparent', boxShadow: '0 2px 8px #667eea44' },
  ticketList: { display: 'flex', flexDirection: 'column', gap: 10 },
  ticketRow: { background: '#fff', padding: '16px 20px', borderRadius: 12, boxShadow: '0 2px 8px #0001', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center', transition: 'box-shadow 0.2s', border: '1.5px solid transparent' },
  badge: { padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.3 },
  aiBadge: { padding: '3px 10px', borderRadius: 20, background: '#faf5ff', color: '#7c3aed', fontSize: 11, fontWeight: 700, border: '1px solid #e9d5ff' },
  loading: { padding: 60, textAlign: 'center', color: '#888', fontSize: 15 },
  empty: { padding: 60, textAlign: 'center', color: '#bbb', fontSize: 15 },
  back: { background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', fontSize: 14, padding: '0 0 16px', fontWeight: 600 },
  descBox: { background: '#f8faff', padding: '14px 16px', borderRadius: 10, fontSize: 14, marginBottom: 16, whiteSpace: 'pre-wrap', border: '1.5px solid #e0e7ff', lineHeight: 1.6 },
  aiBox: { background: 'linear-gradient(135deg, #faf5ff, #ede9fe)', border: '1px solid #e9d5ff', padding: '14px 16px', borderRadius: 10, marginBottom: 16, fontSize: 14, boxShadow: '0 2px 8px #7c3aed11' },
  msgList: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 450, overflowY: 'auto', padding: '4px 0' },
  msgBubble: { padding: '12px 14px', borderRadius: 12, fontSize: 14, boxShadow: '0 1px 4px #0001' },
  sideCard: { background: '#fff', padding: 18, borderRadius: 14, boxShadow: '0 2px 12px #0001', border: '1px solid #f0f0f0' },
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/tickets/new" element={<ProtectedRoute><NewTicket /></ProtectedRoute>} />
          <Route path="/tickets/:id" element={<ProtectedRoute><TicketDetail /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}