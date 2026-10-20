/* =============================================================================
   E-BARANGAY PORTAL
   -----------------------------------------------------------------------------
   SETUP
   1. Create a Supabase project and run supabase-setup.sql in the SQL Editor.
   2. Paste your Project URL and anon key into CONFIG below.
   3. Create staff accounts: sign up as a resident, then promote that user with
      the UPDATE statement at the bottom of supabase-setup.sql.

   DEMO MODE
   While the placeholders below are unchanged, the app runs against browser
   localStorage so you can click through every screen without a backend.
   Sample accounts:  resident@barangay.demo / resident123
                     admin@barangay.demo    / admin123

   AI ANALYSIS
   analyzeSubmission() simulates Gemini with a keyword-based classifier and
   returns the same JSON shape a real model would:
     { sentiment, category, priority, summary }
   To use real Gemini, deploy an Edge Function named "analyze-submission" that
   calls the Gemini API server-side (never put a Gemini key in this file),
   then set aiMode to 'edge-function'. Sketch of that function (Deno):

     const { type, title, description, imageUrl } = await req.json();
     const parts = [{ text: `Classify this barangay ${type}. Title: ${title}. Details: ${description}` }];
     if (imageUrl) {
       const img = await fetch(imageUrl);
       const b64 = btoa(String.fromCharCode(...new Uint8Array(await img.arrayBuffer())));
       parts.push({ inline_data: { mime_type: img.headers.get('content-type'), data: b64 } });
     }
     const res = await fetch(
       'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
       { method: 'POST',
         headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') },
         body: JSON.stringify({
           contents: [{ parts }],
           generationConfig: {
             responseMimeType: 'application/json',
             responseSchema: { type: 'OBJECT', required: ['sentiment','category','priority','summary'],
               properties: {
                 sentiment: { type: 'STRING', enum: ['Urgent','Frustrated','Concerned','Neutral','Constructive','Positive'] },
                 category:  { type: 'STRING', enum: ['Infrastructure','Sanitation','Safety','Health','Noise','Community Services','General'] },
                 priority:  { type: 'STRING', enum: ['High','Medium','Low'] },
                 summary:   { type: 'STRING' } } } } }) });
     const out = await res.json();
     return new Response(out.candidates[0].content.parts[0].text, { headers: { 'Content-Type': 'application/json' } });
   ============================================================================= */

(() => {
'use strict';

/* ------------------------------------------------------------------ CONFIG */
const CONFIG = {
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseKey: 'YOUR_SUPABASE_ANON_KEY',
  storageBucket: 'submission-images',
  barangayName: 'Barangay San Isidro',
  aiMode: 'mock' // 'mock' | 'edge-function'
};

const hasKeys = CONFIG.supabaseUrl && !CONFIG.supabaseUrl.startsWith('YOUR_') &&
                CONFIG.supabaseKey && !CONFIG.supabaseKey.startsWith('YOUR_');
const DEMO = !hasKeys || !window.supabase;
const supabase = DEMO ? null : window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

/* --------------------------------------------------------------- CONSTANTS */
const SENTIMENTS = ['Urgent', 'Frustrated', 'Concerned', 'Neutral', 'Constructive', 'Positive'];
const CATEGORIES = ['Infrastructure', 'Sanitation', 'Safety', 'Health', 'Noise', 'Community Services', 'General'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const STATUSES = ['Pending', 'In Progress', 'Resolved'];
const ANNOUNCEMENT_CATEGORIES = ['General', 'Public Safety', 'Health', 'Utilities', 'Sanitation', 'Events'];

const SENTIMENT_STYLE = {
  Urgent: 'bg-red-50 text-red-700 ring-red-200',
  Frustrated: 'bg-orange-50 text-orange-700 ring-orange-200',
  Concerned: 'bg-amber-50 text-amber-800 ring-amber-200',
  Neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  Constructive: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Positive: 'bg-sky-50 text-sky-700 ring-sky-200'
};
const PRIORITY_STYLE = {
  High: { badge: 'bg-red-600 text-white ring-red-600', bar: 'bg-red-500' },
  Medium: { badge: 'bg-amber-100 text-amber-800 ring-amber-200', bar: 'bg-amber-400' },
  Low: { badge: 'bg-slate-100 text-slate-600 ring-slate-200', bar: 'bg-slate-300' }
};
const STATUS_STYLE = {
  Pending: 'bg-slate-50 text-slate-700 border-slate-300',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-300',
  Resolved: 'bg-emerald-50 text-emerald-700 border-emerald-300'
};
const ANNOUNCEMENT_STYLE = {
  'Public Safety': 'bg-red-50 text-red-700 ring-red-200',
  Health: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Utilities: 'bg-amber-50 text-amber-800 ring-amber-200',
  Sanitation: 'bg-teal-50 text-teal-700 ring-teal-200',
  Events: 'bg-violet-50 text-violet-700 ring-violet-200',
  General: 'bg-slate-100 text-slate-700 ring-slate-200'
};

/* ----------------------------------------------------------------- HELPERS */
const $ = (sel, root = document) => root.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^(https?:|data:image\/)/i.test(u) ? u : '');
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
const formatBytes = (b) => (b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB');
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  const m = s / 60; if (m < 60) return `${Math.floor(m)} min ago`;
  const h = m / 60; if (h < 24) return `${Math.floor(h)} hr ago`;
  const d = h / 24; if (d < 7) return `${Math.floor(d)} day${Math.floor(d) > 1 ? 's' : ''} ago`;
  return fmtDate(iso);
}

const ICONS = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>'
};
const icon = (name, cls = 'h-5 w-5') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const SPINNER = '<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>';

function toast(msg, kind = 'success') {
  const el = document.createElement('div');
  el.className = `toast pointer-events-auto flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${kind === 'error' ? 'bg-red-600' : 'bg-slate-900'}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${SPINNER}<span>${esc(label)}</span>`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) { btn.innerHTML = btn.dataset.label; delete btn.dataset.label; }
  }
}
function friendlyError(err) {
  const m = (err && err.message) || 'Something went wrong. Try again.';
  if (/invalid login credentials/i.test(m)) return 'That email and password don\u2019t match. Check them and try again.';
  if (/already registered|already been registered/i.test(m)) return 'An account with this email already exists. Sign in instead.';
  if (/password should be at least/i.test(m)) return 'Use a password with at least 6 characters.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.';
  return m;
}

/* ===================================================================
   AI ANALYSIS (Gemini simulation)
   =================================================================== */
const CATEGORY_WORDS = {
  Infrastructure: ['road', 'pothole', 'bridge', 'drainage', 'drain', 'flood', 'streetlight', 'street light', 'lamp post', 'pavement', 'sidewalk', 'footpath', 'water pipe', 'water supply', 'broken', 'cracked', 'electric', 'power outage', 'cable', 'construction'],
  Sanitation: ['garbage', 'trash', 'basura', 'waste', 'dump', 'smell', 'odor', 'sewage', 'canal', 'rats', 'rodent', 'mosquito', 'dirty', 'clogged', 'toilet', 'segregation', 'collection'],
  Safety: ['theft', 'robbery', 'snatch', 'crime', 'drunk', 'fight', 'gun', 'threat', 'fire', 'accident', 'dark', 'unsafe', 'tanod', 'curfew', 'drug', 'harass', 'danger', 'stray dog', 'holdup'],
  Health: ['clinic', 'medicine', 'vaccin', 'health', 'sick', 'fever', 'dengue', 'hospital', 'checkup', 'nurse', 'midwife', 'outbreak', 'rabies'],
  Noise: ['karaoke', 'videoke', 'noise', 'noisy', 'loud', 'barking', 'disturb', 'speaker', 'midnight'],
  'Community Services': ['certificate', 'clearance', 'permit', 'barangay id', 'document', 'program', 'livelihood', 'scholarship', 'senior', 'pwd', 'youth', 'sports', 'basketball', 'court', 'workshop', 'park', 'library', 'training']
};
const URGENT_WORDS = ['urgent', 'emergency', 'immediately', 'asap', 'life-threatening', 'exposed wire', 'electrocut', 'injured', 'collapsed', 'collapse', 'sunog', 'knee-deep', 'waist-deep', 'children', 'right now', 'gas leak', 'as soon as possible'];
const FRUSTRATED_WORDS = ['again', 'still', 'nothing', 'ignored', 'weeks', 'months', 'tired of', 'fed up', 'unacceptable', 'disappointed', 'useless', 'nobody', 'no action', 'several times', 'many times', 'always', 'never'];
const CONCERN_WORDS = ['worried', 'afraid', 'concern', 'scared', 'risk', 'unsafe', 'hazard', 'getting worse', 'could cause'];
const CONSTRUCTIVE_WORDS = ['suggest', 'propose', 'recommend', 'should', 'could', 'improve', 'would be great', 'idea', 'initiative', 'would help', 'consider', 'install', 'organize', 'request'];
const POSITIVE_WORDS = ['thank', 'appreciate', 'great job', 'well done', 'salamat', 'happy with', 'grateful'];

function heuristicAnalysis({ type, title, description, imageUrl }) {
  const text = `${title}. ${description}`.toLowerCase();
  const count = (words) => words.filter((w) => new RegExp('\\b' + escapeRx(w)).test(text)).length;
  const isComplaint = type === 'complaint';

  let category = 'General', best = 0;
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    const s = count(words);
    if (s > best) { best = s; category = cat; }
  }
  const urgent = count(URGENT_WORDS);
  const frustrated = count(FRUSTRATED_WORDS) + ((description.match(/!/g) || []).length >= 3 ? 1 : 0);
  const concerned = count(CONCERN_WORDS);
  const constructive = count(CONSTRUCTIVE_WORDS);
  const positive = count(POSITIVE_WORDS);

  let sentiment;
  if (urgent && (isComplaint || category === 'Safety')) sentiment = 'Urgent';
  else if (!isComplaint) sentiment = positive && !constructive ? 'Positive' : 'Constructive';
  else if (frustrated) sentiment = 'Frustrated';
  else if (concerned) sentiment = 'Concerned';
  else sentiment = 'Neutral';

  let score = urgent * 3;
  if (isComplaint) {
    score += frustrated + concerned * 0.5 + ({ Safety: 2, Health: 1.5, Infrastructure: 1, Sanitation: 1 }[category] || 0);
  } else if (category === 'Safety') {
    score += 1;
  }
  if (imageUrl && isComplaint) score += 0.5; // a photo suggests the reporter documented a real problem
  const priority = score >= 3 ? 'High' : score >= 1 ? 'Medium' : 'Low';

  return { sentiment, category, priority, summary: summarize(type, category, title, description) };
}

function summarize(type, category, title, description) {
  const sentences = (description.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || []).map((s) => s.trim()).filter(Boolean);
  let out = sentences[0] || title;
  if (out.length > 170) out = out.slice(0, 167).replace(/\s+\S*$/, '') + '\u2026';
  if (sentences[1] && out.length + sentences[1].length < 210) out += ' ' + sentences[1];
  const lead = type === 'complaint' ? 'Complaint' : 'Suggestion';
  return category === 'General' ? `${lead}: ${out}` : `${lead} about ${category.toLowerCase()}: ${out}`;
}

function normalizeAnalysis(a) {
  const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
  return {
    sentiment: pick(a && a.sentiment, SENTIMENTS, 'Neutral'),
    category: pick(a && a.category, CATEGORIES, 'General'),
    priority: pick(a && a.priority, PRIORITIES, 'Medium'),
    summary: String((a && a.summary) || '').trim().slice(0, 400) || 'No summary available.'
  };
}

/* Takes description text + image URL and returns structured JSON metadata. */
async function analyzeSubmission(payload) {
  await sleep(900 + Math.random() * 600); // simulate model latency
  if (CONFIG.aiMode === 'edge-function' && !DEMO) {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-submission', { body: payload });
      if (error) throw error;
      return normalizeAnalysis(data);
    } catch (err) {
      console.warn('Edge function failed, using local classifier instead.', err);
    }
  }
  return normalizeAnalysis(heuristicAnalysis(payload));
}

/* ===================================================================
   DATA LAYER: Supabase implementation
   =================================================================== */
const supabaseApi = {
  async restore() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    return { user: session.user, profile: await supabaseApi.getProfile(session.user) };
  },
  async getProfile(user) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data || { id: user.id, full_name: user.user_metadata?.full_name || user.email, purok: '', role: 'citizen' };
  },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: data.user, profile: await supabaseApi.getProfile(data.user) };
  },
  async signUp({ email, password, fullName, purok }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, purok } } // copied into profiles by a database trigger
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  },
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  async listAnnouncements() {
    const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async createAnnouncement(row) {
    const { data, error } = await supabase.from('announcements').insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async deleteAnnouncement(id) {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw error;
  },
  async listSubmissions() {
    // Row Level Security returns only the caller's rows for residents, and all rows for admins.
    const { data, error } = await supabase
      .from('submissions')
      .select('*, profiles(full_name, purok)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async createSubmission(row) {
    const { data, error } = await supabase.from('submissions').insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async updateStatus(id, status) {
    const { error } = await supabase.from('submissions').update({ status }).eq('id', id);
    if (error) throw error;
  },
  async uploadImage(file, userId) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(CONFIG.storageBucket)
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from(CONFIG.storageBucket).getPublicUrl(path);
    return data.publicUrl;
  }
};

/* ===================================================================
   DATA LAYER: Demo implementation (localStorage)
   =================================================================== */
const memory = {};
let canPersist = true;
try { localStorage.setItem('ebp:test', '1'); localStorage.removeItem('ebp:test'); } catch { canPersist = false; }
const store = {
  get(key, fallback) {
    try {
      const raw = canPersist ? localStorage.getItem('ebp:' + key) : memory[key];
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    if (!canPersist) { memory[key] = raw; return; }
    try { localStorage.setItem('ebp:' + key, raw); }
    catch { throw new Error('Browser storage is full. Remove some photos or use smaller ones.'); }
  }
};
const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);
const publicProfile = (u) => ({ id: u.id, full_name: u.full_name, purok: u.purok, role: u.role });

function sampleImage(label, bg, fg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="${bg}"/><path d="M0 300 L160 210 L280 270 L420 170 L640 300 V420 H0Z" fill="${fg}" opacity=".35"/><text x="24" y="394" font-family="sans-serif" font-size="20" fill="${fg}">Sample attachment: ${label}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function compressImage(file, max = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image.'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function seedDemo() {
  if (store.get('seeded', false)) return;
  const ago = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
  const users = [
    { id: 'u-admin', email: 'admin@barangay.demo', password: 'admin123', full_name: 'Kagawad Ramon Dela Cruz', purok: '', role: 'admin' },
    { id: 'u-maria', email: 'resident@barangay.demo', password: 'resident123', full_name: 'Maria Santos', purok: 'Purok 3', role: 'citizen' },
    { id: 'u-jose', email: 'jose@barangay.demo', password: 'resident123', full_name: 'Jose Reyes', purok: 'Purok 5', role: 'citizen' },
    { id: 'u-ana', email: 'ana@barangay.demo', password: 'resident123', full_name: 'Ana Villanueva', purok: 'Purok 1', role: 'citizen' }
  ];
  const announcements = [
    { id: uid(), title: 'Water interruption this Saturday', category: 'Utilities', author_name: 'Kagawad Ramon Dela Cruz', created_at: ago(5),
      body: 'The water district will shut off supply from 8:00 AM to 3:00 PM this Saturday for pipe replacement along the main road.\nPlease store enough water in advance. A water truck will be stationed at the barangay hall.' },
    { id: uid(), title: 'Free anti-rabies vaccination for pets', category: 'Health', author_name: 'Barangay Health Office', created_at: ago(30),
      body: 'Bring your dogs and cats to the covered court next Wednesday, 9:00 AM to 12:00 NN. Pets must be on a leash or in a carrier.' },
    { id: uid(), title: 'Barangay assembly on October 18', category: 'Events', author_name: 'Office of the Punong Barangay', created_at: ago(72), image_urls: [sampleImage('assembly hall', '#dbeafe', '#1e3a8a'), sampleImage('stage setup', '#e0e7ff', '#312e81'), sampleImage('seating area', '#e2e8f0', '#0f172a'), sampleImage('registration table', '#cffafe', '#155e75')],
      body: 'All residents are invited to the quarterly barangay assembly at the covered court at 4:00 PM. We will present the budget report and take questions on ongoing projects.' }
  ];
  const raw = [
    { user_id: 'u-maria', type: 'complaint', title: 'Flooded street near the covered court', location: 'Mabini St., Purok 3', status: 'Pending', created_at: ago(2),
      description: 'The drainage along Mabini Street near the covered court is clogged again and water has been knee-deep every time it rains. Several children walk through it on the way to school. Please send a team to clear it as soon as possible.',
      image_url: sampleImage('flooded street', '#cbd5e1', '#1e3a8a') },
    { user_id: 'u-jose', type: 'complaint', title: 'Garbage not collected for two weeks', location: 'Rizal Extension', status: 'In Progress', created_at: ago(20),
      description: 'Garbage along Rizal Extension has not been collected for two weeks. The smell is getting worse and there are rats near the canal. We have reported this several times and nothing has happened.',
      image_url: sampleImage('uncollected garbage', '#e2e8f0', '#334155') },
    { user_id: 'u-ana', type: 'suggestion', title: 'Solar streetlights for the Purok 1 footpath', location: 'Purok 1', status: 'Pending', created_at: ago(26),
      description: 'I suggest installing solar-powered streetlights along the Purok 1 footpath. It is very dark at night and residents feel unsafe walking home. This would also lower our electricity costs.', image_url: '' },
    { user_id: 'u-maria', type: 'complaint', title: 'Loud videoke past midnight', location: 'Corner of Luna St.', status: 'Resolved', created_at: ago(96),
      description: 'A neighbor has been running videoke until 1 AM on weeknights. The noise makes it hard for the elderly and children to sleep. A reminder from the tanod would help.', image_url: '' },
    { user_id: 'u-jose', type: 'suggestion', title: 'Weekend livelihood workshops for parents', location: '', status: 'In Progress', created_at: ago(120),
      description: 'It would be great if the barangay could organize weekend livelihood workshops such as food processing or sewing. Many parents are looking for extra income. Thank you for considering this.', image_url: '' }
  ];
  const submissions = raw.map((r) => {
    const a = normalizeAnalysis(heuristicAnalysis(r));
    return { id: uid(), ...r, ai_sentiment: a.sentiment, ai_category: a.category, ai_priority: a.priority, ai_summary: a.summary };
  });
  store.set('users', users);
  store.set('announcements', announcements);
  store.set('submissions', submissions);
  store.set('seeded', true);
}

const demoApi = {
  async restore() {
    await sleep(120);
    const id = store.get('session', null);
    const u = id && store.get('users', []).find((x) => x.id === id);
    return u ? { user: { id: u.id, email: u.email }, profile: publicProfile(u) } : null;
  },
  async signIn(email, password) {
    await sleep(450);
    const u = store.get('users', []).find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u || u.password !== password) throw new Error('Invalid login credentials');
    store.set('session', u.id);
    return { user: { id: u.id, email: u.email }, profile: publicProfile(u) };
  },
  async signUp({ email, password, fullName, purok }) {
    await sleep(450);
    const users = store.get('users', []);
    if (users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw new Error('User already registered');
    if (password.length < 6) throw new Error('Password should be at least 6 characters.');
    users.push({ id: uid(), email, password, full_name: fullName, purok, role: 'citizen' });
    store.set('users', users);
    return { needsConfirmation: false };
  },
  async signOut() { store.set('session', null); },
  async listAnnouncements() { await sleep(200); return store.get('announcements', []).sort(byNewest); },
  async createAnnouncement(row) {
    await sleep(300);
    const list = store.get('announcements', []);
    const item = { id: uid(), created_at: new Date().toISOString(), ...row };
    list.push(item);
    store.set('announcements', list);
    return item;
  },
  async deleteAnnouncement(id) {
    await sleep(200);
    store.set('announcements', store.get('announcements', []).filter((a) => a.id !== id));
  },
  async listSubmissions() {
    await sleep(250);
    const me = state.profile;
    const users = store.get('users', []);
    return store.get('submissions', [])
      .filter((s) => me.role === 'admin' || s.user_id === me.id)
      .map((s) => {
        const u = users.find((x) => x.id === s.user_id);
        return { ...s, profiles: u ? { full_name: u.full_name, purok: u.purok } : null };
      })
      .sort(byNewest);
  },
  async createSubmission(row) {
    await sleep(300);
    const list = store.get('submissions', []);
    const item = { id: uid(), status: 'Pending', created_at: new Date().toISOString(), ...row };
    list.push(item);
    store.set('submissions', list);
    return item;
  },
  async updateStatus(id, status) {
    await sleep(150);
    const list = store.get('submissions', []);
    const item = list.find((s) => s.id === id);
    if (item) item.status = status;
    store.set('submissions', list);
  },
  async uploadImage(file) { return compressImage(file, 800, 0.65); }
};

const api = DEMO ? demoApi : supabaseApi;

/* ===================================================================
   STATE
   =================================================================== */
const state = {
  user: null,
  profile: null,
  portal: 'citizen',     // auth screen: 'citizen' | 'admin'
  authMode: 'login',     // resident portal: 'login' | 'signup'
  notice: '',
  tab: null,
  menuOpen: false,
  loading: false,
  announcements: [],
  submissions: [],
  filters: { q: '', type: 'all', priority: 'all', status: 'all', sort: 'priority' },
  pendingFile: null,
  pendingPhotos: [], // announcement photos: [{ file, url }]
  previewUrl: null,
  confirmDelete: null
};
const isAdmin = () => state.profile && state.profile.role === 'admin';
const app = $('#app');

/* ===================================================================
   SHARED UI PIECES
   =================================================================== */
const INPUT = 'block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20';
const BTN = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white hover:bg-blue-700`;
const BTN_SECONDARY = `${BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
const H1 = 'font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl';

const badge = (text, cls) => `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}">${esc(text)}</span>`;
const typeChip = (type) => type === 'complaint'
  ? `<span class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">${icon('alert', 'h-3.5 w-3.5')}Complaint</span>`
  : `<span class="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">${icon('lightbulb', 'h-3.5 w-3.5')}Suggestion</span>`;
const opts = (pairs, cur) => pairs.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');

function field({ label, name, type = 'text', required = true, placeholder = '', autocomplete = '', minlength = '', maxlength = '' }) {
  return `
    <div>
      <label for="f-${name}" class="mb-1.5 block text-sm font-medium text-slate-700">${esc(label)}${required ? '' : ' <span class="font-normal text-slate-400">(optional)</span>'}</label>
      <input id="f-${name}" name="${name}" type="${type}" class="${INPUT}" ${required ? 'required' : ''}
        ${placeholder ? `placeholder="${esc(placeholder)}"` : ''} ${autocomplete ? `autocomplete="${autocomplete}"` : ''}
        ${minlength ? `minlength="${minlength}"` : ''} ${maxlength ? `maxlength="${maxlength}"` : ''}>
    </div>`;
}

function brand(light = false) {
  return `
    <div class="flex items-center gap-3">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">${icon('shield', 'h-5 w-5')}</span>
      <span class="leading-tight">
        <span class="block font-display text-lg font-bold ${light ? 'text-white' : 'text-slate-900'}">E-Barangay Portal</span>
        <span class="block text-xs ${light ? 'text-slate-400' : 'text-slate-500'}">${esc(CONFIG.barangayName)}</span>
      </span>
    </div>`;
}

function skeleton() {
  return `<div class="space-y-4" aria-busy="true" aria-label="Loading">
    <div class="h-8 w-64 animate-pulse rounded-lg bg-slate-200"></div>
    <div class="h-40 animate-pulse rounded-xl bg-slate-200"></div>
    <div class="h-40 animate-pulse rounded-xl bg-slate-200"></div>
  </div>`;
}

/* ===================================================================
   AUTH VIEW
   =================================================================== */
function sampleTriage() {
  return `
    <div class="rounded-2xl bg-white p-5 text-slate-800 shadow-xl" aria-hidden="true">
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-semibold text-slate-900">Flooded street near the covered court</span>
        ${badge('High priority', PRIORITY_STYLE.High.badge)}
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        ${badge('Urgent', SENTIMENT_STYLE.Urgent)}
        ${badge('Infrastructure', 'bg-blue-50 text-blue-700 ring-blue-200')}
      </div>
      <div class="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3.5">
        <p class="flex items-center gap-1.5 text-xs font-semibold text-blue-700">${icon('sparkles', 'h-3.5 w-3.5')} AI summary</p>
        <p class="mt-1 text-sm text-slate-800">Clogged drainage on Mabini Street floods knee-deep after rain, and schoolchildren wade through it.</p>
      </div>
    </div>`;
}

function authView() {
  const admin = state.portal === 'admin';
  const signup = !admin && state.authMode === 'signup';
  const seg = (id, label, iconName) => `
    <button type="button" data-action="portal" data-portal="${id}" aria-pressed="${state.portal === id}"
      class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${state.portal === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
      ${icon(iconName, 'h-4 w-4')}${label}
    </button>`;

  const residentFields = signup
    ? `${field({ label: 'Full name', name: 'full_name', autocomplete: 'name', placeholder: 'Juan Dela Cruz' })}
       ${field({ label: 'Purok or street', name: 'purok', required: false, placeholder: 'Purok 3, Mabini St.' })}`
    : '';

  return `
  <main class="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <aside class="hidden bg-slate-900 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
      ${brand(true)}
      <div class="my-12 max-w-xl">
        <h1 class="font-display text-4xl font-bold leading-tight xl:text-5xl">Every concern reaches the right desk, in the right order.</h1>
        <p class="mt-5 text-lg leading-relaxed text-slate-300">Residents send a report once. Barangay staff see it sorted by urgency, topic, and tone, with a short summary ready to act on.</p>
      </div>
      <div>${sampleTriage()}</div>
    </aside>

    <section class="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 lg:min-h-0">
      <div class="w-full max-w-md">
        <div class="mb-8 lg:hidden">${brand(false)}</div>

        <div class="flex rounded-xl bg-slate-200/70 p-1" role="group" aria-label="Choose portal">
          ${seg('citizen', 'Resident', 'inbox')}
          ${seg('admin', 'Barangay staff', 'shield')}
        </div>

        <div class="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 class="font-display text-2xl font-bold text-slate-900">${admin ? 'Staff sign in' : signup ? 'Create your resident account' : 'Welcome back'}</h2>
          <p class="mt-1 text-sm text-slate-600">${admin
            ? 'For barangay officials and staff. Accounts are issued by the barangay office.'
            : signup ? 'Register once to send reports and read official announcements.'
            : 'Sign in to read announcements and send reports.'}</p>

          ${state.notice ? `<div class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800" role="status">${esc(state.notice)}</div>` : ''}
          <div id="auth-error" class="mt-4 hidden rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert"></div>

          <form class="mt-5 space-y-4" data-form="auth" data-mode="${signup ? 'signup' : 'login'}" data-portal="${state.portal}" novalidate>
            ${residentFields}
            ${field({ label: 'Email', name: 'email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com' })}
            ${field({ label: 'Password', name: 'password', type: 'password', autocomplete: signup ? 'new-password' : 'current-password', minlength: signup ? 6 : '' })}
            <button type="submit" class="${BTN_PRIMARY} w-full">${admin ? 'Sign in as staff' : signup ? 'Create account' : 'Sign in'}</button>
          </form>

          ${admin ? '' : `
          <p class="mt-5 text-center text-sm text-slate-600">
            ${signup ? 'Already registered?' : 'New to the portal?'}
            <button type="button" data-action="auth-mode" data-mode="${signup ? 'login' : 'signup'}" class="font-semibold text-blue-600 hover:text-blue-700">${signup ? 'Sign in' : 'Create an account'}</button>
          </p>`}
        </div>

        ${DEMO ? `
        <div class="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p class="font-semibold">Demo mode</p>
          <p class="mt-1 text-blue-800">No Supabase keys are set, so data stays in this browser. Try a sample account:</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" data-action="fill-demo" data-role="citizen" class="${BTN_SECONDARY} !py-1.5">Resident account</button>
            <button type="button" data-action="fill-demo" data-role="admin" class="${BTN_SECONDARY} !py-1.5">Staff account</button>
          </div>
        </div>` : ''}
      </div>
    </section>
  </main>`;
}

/* ===================================================================
   APP SHELL
   =================================================================== */
function navItems() {
  if (isAdmin()) {
    return [
      { id: 'announcements', label: 'Announcements', icon: 'megaphone' },
      { id: 'submissions', label: 'Submissions', icon: 'inbox' }
    ];
  }
  return [
    { id: 'home', label: 'Announcements', icon: 'megaphone' },
    { id: 'complaint', label: 'Complaint', icon: 'alert' },
    { id: 'suggestion', label: 'Suggestion', icon: 'lightbulb' },
    { id: 'mine', label: 'My submissions', icon: 'inbox' }
  ];
}

function navButton(item, mobile) {
  const active = state.tab === item.id;
  const pending = isAdmin() && item.id === 'submissions'
    ? state.submissions.filter((s) => s.status === 'Pending').length : 0;
  return `
    <button type="button" data-action="nav" data-tab="${item.id}" ${active ? 'aria-current="page"' : ''}
      class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mobile ? 'w-full' : ''}
      ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}">
      ${icon(item.icon, 'h-4 w-4')}${item.label}
      ${pending ? `<span class="rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white" aria-label="${pending} pending">${pending}</span>` : ''}
    </button>`;
}

function shell(inner) {
  const p = state.profile;
  const items = navItems();
  const roleLabel = isAdmin() ? 'Staff' : 'Resident';
  return `
  ${DEMO ? `<div class="bg-slate-900 px-4 py-1.5 text-center text-xs text-slate-300">Demo mode: data is saved in this browser only. Add your Supabase keys to go live.</div>` : ''}
  <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
      ${brand(false)}
      <nav class="hidden items-center gap-1 md:flex" aria-label="Main">${items.map((i) => navButton(i, false)).join('')}</nav>
      <div class="hidden items-center gap-3 md:flex">
        <div class="flex items-center gap-2.5">
          <span class="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white" aria-hidden="true">${esc(initials(p.full_name))}</span>
          <span class="leading-tight">
            <span class="block max-w-[10rem] truncate text-sm font-semibold text-slate-900">${esc(p.full_name || 'Account')}</span>
            <span class="block text-xs text-slate-500">${roleLabel}</span>
          </span>
        </div>
        <button type="button" data-action="logout" class="${BTN_SECONDARY} !px-3 !py-2" aria-label="Sign out">${icon('logout', 'h-4 w-4')}Sign out</button>
      </div>
      <button type="button" data-action="toggle-menu" class="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
        aria-expanded="${state.menuOpen}" aria-controls="mobile-menu" aria-label="${state.menuOpen ? 'Close menu' : 'Open menu'}">
        ${icon(state.menuOpen ? 'x' : 'menu', 'h-6 w-6')}
      </button>
    </div>
    <div id="mobile-menu" class="${state.menuOpen ? '' : 'hidden'} border-t border-slate-200 bg-white px-4 py-3 md:hidden">
      <nav class="space-y-1" aria-label="Mobile">${items.map((i) => navButton(i, true)).join('')}</nav>
      <div class="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white" aria-hidden="true">${esc(initials(p.full_name))}</span>
          <span class="min-w-0 leading-tight">
            <span class="block truncate text-sm font-semibold text-slate-900">${esc(p.full_name || 'Account')}</span>
            <span class="block text-xs text-slate-500">${roleLabel}</span>
          </span>
        </div>
        <button type="button" data-action="logout" class="${BTN_SECONDARY} !px-3 !py-2">${icon('logout', 'h-4 w-4')}Sign out</button>
      </div>
    </div>
  </header>
  <main id="main" class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">${inner}</main>`;
}

/* ===================================================================
   CITIZEN VIEWS
   =================================================================== */
function announcementImages(a) {
  const list = Array.isArray(a.image_urls) ? a.image_urls.filter(Boolean) : [];
  if (!list.length && a.image_url) list.push(a.image_url); // older posts saved a single photo
  return list.map(safeUrl).filter(Boolean);
}

function announcementGallery(a) {
  const imgs = announcementImages(a);
  const n = imgs.length;
  if (!n) return '';
  const tile = (i, cls, extra = '') => `
    <button type="button" data-action="lightbox" data-gallery="${esc(a.id)}" data-index="${i}"
      class="relative block overflow-hidden bg-slate-100 ${cls}" aria-label="View photo ${i + 1} of ${n} for ${esc(a.title)}">
      <img src="${esc(imgs[i])}" alt="Photo ${i + 1} of ${n} for ${esc(a.title)}" class="h-full w-full object-cover" loading="lazy">${extra}
    </button>`;
  if (n === 1) return tile(0, 'h-48 w-full sm:h-64');
  if (n === 2) return `<div class="grid h-56 grid-cols-2 gap-0.5 sm:h-72">${tile(0, 'h-full')}${tile(1, 'h-full')}</div>`;
  const more = n - 3;
  const overlay = more > 0
    ? `<span class="absolute inset-0 grid place-items-center bg-slate-900/60 font-display text-2xl font-bold text-white">+${more}</span>` : '';
  return `<div class="grid h-56 grid-cols-3 grid-rows-2 gap-0.5 sm:h-72">
    ${tile(0, 'col-span-2 row-span-2 h-full')}${tile(1, 'h-full')}${tile(2, 'h-full', overlay)}
  </div>`;
}

function announcementCard(a, { admin = false } = {}) {
  const confirming = state.confirmDelete === a.id;
  const count = announcementImages(a).length;
  return `
  <article class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    ${announcementGallery(a)}
    <div class="p-5 sm:p-6">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          ${badge(a.category || 'General', ANNOUNCEMENT_STYLE[a.category] || ANNOUNCEMENT_STYLE.General)}
          ${count > 1 ? `<span class="inline-flex items-center gap-1 text-xs font-medium text-slate-500">${icon('image', 'h-3.5 w-3.5')}${count} photos</span>` : ''}
        </div>
        <time class="text-sm text-slate-500" datetime="${esc(a.created_at)}">${fmtDate(a.created_at)}</time>
      </div>
      <h2 class="mt-3 font-display text-xl font-semibold text-slate-900">${esc(a.title)}</h2>
      <p class="mt-2 max-w-prose whitespace-pre-line leading-relaxed text-slate-600">${esc(a.body)}</p>
      <div class="mt-4 flex items-center justify-between gap-3">
        <p class="text-sm text-slate-500">Posted by ${esc(a.author_name || 'Barangay Office')}</p>
        ${admin ? `<button type="button" data-action="delete-announcement" data-id="${esc(a.id)}"
          class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${confirming ? 'bg-red-600 text-white hover:bg-red-700' : 'text-slate-500 hover:bg-red-50 hover:text-red-700'}">
          ${icon('trash', 'h-4 w-4')}${confirming ? 'Confirm delete' : 'Delete'}</button>` : ''}
      </div>
    </div>
  </article>`;
}
function homeView() {
  const first = (state.profile.full_name || 'neighbor').split(' ')[0];
  const list = state.announcements;
  return `
  <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 class="${H1}">Magandang araw, ${esc(first)}</h1>
      <p class="mt-1 text-slate-600">The latest from the barangay office.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" data-action="nav" data-tab="complaint" class="${BTN_SECONDARY}">File a complaint</button>
      <button type="button" data-action="nav" data-tab="suggestion" class="${BTN_PRIMARY}">Share a suggestion</button>
    </div>
  </div>
  <div class="mt-8 space-y-4">
    ${list.length ? list.map((a) => announcementCard(a)).join('') : `
      <div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <p class="font-display text-lg font-semibold text-slate-900">No announcements yet</p>
        <p class="mt-1 text-sm text-slate-600">Official posts from the barangay will appear here.</p>
      </div>`}
  </div>`;
}

const MAX_PHOTOS = 10;

function multiPhotoPicker() {
  return `
      <div>
        <div class="mb-1.5 flex items-baseline justify-between gap-3">
          <span class="text-sm font-medium text-slate-700">Event photos <span class="font-normal text-slate-400">(optional)</span></span>
          <span id="photo-count" class="text-xs text-slate-500" aria-live="polite">0 of ${MAX_PHOTOS}</span>
        </div>
        <div id="photo-grid" class="mb-3 hidden grid-cols-3 gap-2 sm:grid-cols-4"></div>
        <label id="photo-add" for="f-photos" data-multi-dropzone
          class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-blue-500 hover:bg-blue-50/40 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
          <span class="text-slate-400">${icon('upload', 'h-7 w-7')}</span>
          <span id="photo-add-title" class="text-sm font-semibold text-slate-800">Choose photos or drag them here</span>
          <span class="text-xs text-slate-500">Up to ${MAX_PHOTOS} photos. JPG, PNG, or WebP, 5 MB each</span>
          <input id="f-photos" name="photos" type="file" accept="image/*" multiple class="sr-only" data-files>
        </label>
      </div>`;
}

function renderPhotoGrid() {
  const grid = $('#photo-grid');
  if (!grid) return;
  const photos = state.pendingPhotos;
  const n = photos.length;
  grid.innerHTML = photos.map((p, i) => `
    <div class="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <img src="${p.url}" alt="Selected photo ${i + 1}" class="h-full w-full object-cover">
      <button type="button" data-action="remove-photo" data-index="${i}" aria-label="Remove photo ${i + 1}"
        class="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-slate-900/80 text-white hover:bg-slate-900">${icon('x', 'h-3.5 w-3.5')}</button>
      ${i === 0 ? '<span class="absolute bottom-1 left-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>' : ''}
    </div>`).join('');
  grid.classList.toggle('hidden', n === 0);
  grid.classList.toggle('grid', n > 0);
  $('#photo-count').textContent = `${n} of ${MAX_PHOTOS}`;
  $('#photo-add').classList.toggle('hidden', n >= MAX_PHOTOS);
  $('#photo-add-title').textContent = n ? 'Add more photos' : 'Choose photos or drag them here';
}

function addPhotos(fileList) {
  let skipped = 0, tooMany = false;
  for (const f of Array.from(fileList || [])) {
    if (state.pendingPhotos.length >= MAX_PHOTOS) { tooMany = true; break; }
    if (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) { skipped++; continue; }
    state.pendingPhotos.push({ file: f, url: URL.createObjectURL(f) });
  }
  if (tooMany) toast(`You can add up to ${MAX_PHOTOS} photos. Extra files were left out.`, 'error');
  else if (skipped) toast(`${skipped} file${skipped > 1 ? 's were' : ' was'} skipped. Use images under 5 MB.`, 'error');
  renderPhotoGrid();
}

function removePhoto(index) {
  const [removed] = state.pendingPhotos.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.url);
  renderPhotoGrid();
}

function clearPhotos() {
  state.pendingPhotos.forEach((p) => URL.revokeObjectURL(p.url));
  state.pendingPhotos = [];
  renderPhotoGrid();
}

function photoPicker(label = 'Photo', hint = 'JPG, PNG, or WebP, up to 5 MB') {
  return `
      <div>
        <span class="mb-1.5 block text-sm font-medium text-slate-700">${esc(label)} <span class="font-normal text-slate-400">(optional)</span></span>
        <div id="dropzone" data-dropzone>
          <label for="f-photo" class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:border-blue-500 hover:bg-blue-50/40 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
            <span class="text-slate-400">${icon('upload', 'h-7 w-7')}</span>
            <span class="text-sm font-semibold text-slate-800">Choose a photo or drag it here</span>
            <span class="text-xs text-slate-500">${esc(hint)}</span>
            <input id="f-photo" name="photo" type="file" accept="image/*" class="sr-only" data-file>
          </label>
        </div>
        <div id="preview" class="mt-1 hidden items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <img id="preview-img" src="" alt="Selected photo preview" class="h-20 w-20 shrink-0 rounded-lg object-cover">
          <div class="min-w-0 flex-1">
            <p id="preview-name" class="truncate text-sm font-semibold text-slate-900"></p>
            <p id="preview-size" class="text-xs text-slate-500"></p>
          </div>
          <button type="button" data-action="remove-image" class="${BTN_SECONDARY} !px-3 !py-1.5">Remove</button>
        </div>
      </div>`;
}

function submitView(type) {
  const complaint = type === 'complaint';
  return `
  <div class="mx-auto max-w-2xl">
    <h1 class="${H1}">${complaint ? 'File a complaint' : 'Share a suggestion'}</h1>
    <p class="mt-1 text-slate-600">${complaint
      ? 'Describe the problem and add a photo if you can. Reports are sorted so urgent ones are seen first.'
      : 'Tell us how the barangay can serve you better. Every suggestion is read by the office.'}</p>

    <form class="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" data-form="submission" data-type="${type}" novalidate>
      ${field({ label: 'Subject', name: 'subject', maxlength: 120, placeholder: complaint ? 'Short title, e.g. Broken streetlight on Luna St.' : 'Short title, e.g. Weekend livelihood workshops' })}
      ${field({ label: 'Location', name: 'location', required: false, maxlength: 120, placeholder: 'Purok, street, or landmark' })}
      <div>
        <label for="f-description" class="mb-1.5 block text-sm font-medium text-slate-700">Details</label>
        <textarea id="f-description" name="description" rows="6" maxlength="1500" required data-count class="${INPUT} resize-y"
          placeholder="${complaint ? 'What happened, where, and since when?' : 'What would you like to see, and how would it help?'}"></textarea>
        <p class="mt-1 text-right text-xs text-slate-500"><span id="desc-count">0</span>/1500</p>
      </div>
      ${photoPicker('Photo')}
      <div class="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <button type="button" data-action="nav" data-tab="home" class="${BTN_SECONDARY}">Cancel</button>
        <button type="submit" class="${BTN_PRIMARY}">${complaint ? 'Send complaint' : 'Send suggestion'}</button>
      </div>
    </form>
  </div>`;
}

function mineView() {
  const list = state.submissions;
  return `
  <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 class="${H1}">My submissions</h1>
      <p class="mt-1 text-slate-600">Track what you've sent and see when the office acts on it.</p>
    </div>
    <button type="button" data-action="refresh" class="${BTN_SECONDARY} self-start">${icon('refresh', 'h-4 w-4')}Refresh</button>
  </div>
  <div class="mt-8 space-y-4">
    ${list.length ? list.map((s) => {
      const img = safeUrl(s.image_url);
      return `
      <article class="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        ${img ? `<img src="${esc(img)}" alt="Your attachment" class="h-20 w-20 shrink-0 rounded-lg object-cover sm:h-24 sm:w-24" loading="lazy">` : ''}
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            ${typeChip(s.type)}
            <time class="text-sm text-slate-500" datetime="${esc(s.created_at)}">${timeAgo(s.created_at)}</time>
          </div>
          <h2 class="mt-2 font-display text-lg font-semibold text-slate-900">${esc(s.title)}</h2>
          <p class="mt-1 line-clamp-2 text-sm text-slate-600">${esc(s.description)}</p>
          <div class="mt-3"><span class="inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_STYLE[s.status] || STATUS_STYLE.Pending}">${esc(s.status)}</span></div>
        </div>
      </article>`;
    }).join('') : `
      <div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <p class="font-display text-lg font-semibold text-slate-900">Nothing sent yet</p>
        <p class="mt-1 text-sm text-slate-600">Your complaints and suggestions will show up here with their status.</p>
        <div class="mt-5 flex justify-center gap-2">
          <button type="button" data-action="nav" data-tab="complaint" class="${BTN_SECONDARY}">File a complaint</button>
          <button type="button" data-action="nav" data-tab="suggestion" class="${BTN_PRIMARY}">Share a suggestion</button>
        </div>
      </div>`}
  </div>`;
}

/* ===================================================================
   ADMIN VIEWS
   =================================================================== */
function adminAnnouncementsView() {
  return `
  <div>
    <h1 class="${H1}">Announcements</h1>
    <p class="mt-1 text-slate-600">Publish official posts. Residents see them at the top of their home feed.</p>
  </div>
  <div class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
    <form class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" data-form="announcement" novalidate>
      <h2 class="font-display text-lg font-semibold text-slate-900">New announcement</h2>
      ${field({ label: 'Title', name: 'title', maxlength: 120, placeholder: 'e.g. Garbage collection schedule update' })}
      <div>
        <label for="f-category" class="mb-1.5 block text-sm font-medium text-slate-700">Category</label>
        <select id="f-category" name="category" class="${INPUT}">${opts(ANNOUNCEMENT_CATEGORIES.map((c) => [c, c]), 'General')}</select>
      </div>
      <div>
        <label for="f-body" class="mb-1.5 block text-sm font-medium text-slate-700">Message</label>
        <textarea id="f-body" name="body" rows="6" maxlength="2000" required class="${INPUT} resize-y" placeholder="Write what residents need to know: what, when, and where."></textarea>
      </div>
      ${multiPhotoPicker()}
      <button type="submit" class="${BTN_PRIMARY} w-full">${icon('megaphone', 'h-4 w-4')}Publish announcement</button>
    </form>
    <div class="space-y-4">
      ${state.announcements.length ? state.announcements.map((a) => announcementCard(a, { admin: true })).join('') : `
        <div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p class="font-display text-lg font-semibold text-slate-900">Nothing published yet</p>
          <p class="mt-1 text-sm text-slate-600">Your first announcement will appear here.</p>
        </div>`}
    </div>
  </div>`;
}

function filteredSubmissions() {
  const f = state.filters;
  const q = f.q.trim().toLowerCase();
  const rank = { High: 0, Medium: 1, Low: 2 };
  const list = state.submissions.filter((s) =>
    (f.type === 'all' || s.type === f.type) &&
    (f.priority === 'all' || s.ai_priority === f.priority) &&
    (f.status === 'all' || s.status === f.status) &&
    (!q || [s.title, s.description, s.ai_summary, s.ai_category, s.ai_sentiment, s.profiles?.full_name, s.location].join(' ').toLowerCase().includes(q))
  );
  list.sort((a, b) => {
    if (f.sort === 'newest') return byNewest(a, b);
    if (f.sort === 'oldest') return byNewest(b, a);
    return (a.status === 'Resolved') - (b.status === 'Resolved') ||
      (rank[a.ai_priority] ?? 3) - (rank[b.ai_priority] ?? 3) || byNewest(a, b);
  });
  return list;
}

function adminSubmissionCard(s) {
  const p = PRIORITY_STYLE[s.ai_priority] || PRIORITY_STYLE.Low;
  const img = safeUrl(s.image_url);
  const who = s.profiles?.full_name || 'Resident';
  const long = (s.description || '').length > 170;
  return `
  <article class="relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:flex-row">
    <span class="absolute inset-x-0 top-0 z-10 h-1.5 md:inset-y-0 md:right-auto md:h-auto md:w-1.5 ${p.bar}" aria-hidden="true"></span>
    ${img
      ? `<button type="button" data-action="lightbox" data-src="${esc(img)}" class="relative block h-48 w-full shrink-0 overflow-hidden bg-slate-100 md:h-auto md:w-56" aria-label="View attachment full size">
           <img src="${esc(img)}" alt="Attachment for ${esc(s.title)}" class="h-full w-full object-cover" loading="lazy">
         </button>`
      : `<div class="flex h-14 w-full shrink-0 items-center justify-center gap-2 bg-slate-50 text-slate-400 md:h-auto md:w-56 md:flex-col">
           ${icon('image', 'h-5 w-5 md:h-7 md:w-7')}<span class="text-xs">No attachment</span>
         </div>`}
    <div class="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-500">
        ${typeChip(s.type)}
        <span class="font-medium text-slate-700">${esc(who)}${s.profiles?.purok ? `, ${esc(s.profiles.purok)}` : ''}</span>
        <time datetime="${esc(s.created_at)}" title="${esc(fmtDateTime(s.created_at))}">${timeAgo(s.created_at)}</time>
        ${s.location ? `<span class="inline-flex items-center gap-1">${icon('pin', 'h-3.5 w-3.5')}${esc(s.location)}</span>` : ''}
      </div>
      <div>
        <h3 class="font-display text-lg font-semibold text-slate-900">${esc(s.title)}</h3>
        <p class="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">${esc(s.description)}</p>
        ${long ? `<button type="button" data-action="expand" class="mt-1 text-sm font-semibold text-blue-600 hover:text-blue-700">Show more</button>` : ''}
      </div>
      <div class="flex flex-wrap gap-2">
        ${badge(`${s.ai_priority || 'Unrated'} priority`, p.badge)}
        ${badge(s.ai_sentiment || 'Neutral', SENTIMENT_STYLE[s.ai_sentiment] || SENTIMENT_STYLE.Neutral)}
        ${badge(s.ai_category || 'General', 'bg-blue-50 text-blue-700 ring-blue-200')}
      </div>
      <div class="rounded-lg border border-blue-100 bg-blue-50/60 p-3.5">
        <p class="flex items-center gap-1.5 text-xs font-semibold text-blue-700">${icon('sparkles', 'h-3.5 w-3.5')} AI summary</p>
        <p class="mt-1 text-sm text-slate-800">${esc(s.ai_summary || 'No summary available.')}</p>
      </div>
      <div class="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <label for="status-${esc(s.id)}" class="text-sm font-medium text-slate-600">Status</label>
        <select id="status-${esc(s.id)}" data-action="status" data-id="${esc(s.id)}"
          class="rounded-lg border px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600/20 ${STATUS_STYLE[s.status] || STATUS_STYLE.Pending}">
          ${opts(STATUSES.map((x) => [x, x]), s.status)}
        </select>
      </div>
    </div>
  </article>`;
}

function submissionListHtml() {
  const list = filteredSubmissions();
  if (!list.length) {
    return `<div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <p class="font-display text-lg font-semibold text-slate-900">${state.submissions.length ? 'No matches' : 'No submissions yet'}</p>
      <p class="mt-1 text-sm text-slate-600">${state.submissions.length ? 'Adjust or clear the filters to see more reports.' : 'Complaints and suggestions from residents will appear here.'}</p>
    </div>`;
  }
  return list.map(adminSubmissionCard).join('');
}
function submissionCountText() {
  return `Showing ${filteredSubmissions().length} of ${state.submissions.length}`;
}
function renderSubmissionList() {
  const el = $('#sub-list');
  if (!el) return;
  el.innerHTML = submissionListHtml();
  $('#sub-count').textContent = submissionCountText();
}

function adminSubmissionsView() {
  const subs = state.submissions;
  const f = state.filters;
  const urgentOpen = subs.filter((s) => s.ai_priority === 'High' && s.status !== 'Resolved').length;
  const cell = (n, label, tone = '') => `
    <div class="bg-white p-4">
      <p class="font-display text-2xl font-bold ${tone || 'text-slate-900'}">${n}</p>
      <p class="text-sm text-slate-600">${label}</p>
    </div>`;
  return `
  <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 class="${H1}">Submissions</h1>
      <p class="mt-1 text-slate-600">Complaints and suggestions, sorted by AI priority.</p>
    </div>
    <button type="button" data-action="refresh" class="${BTN_SECONDARY} self-start">${icon('refresh', 'h-4 w-4')}Refresh</button>
  </div>

  <div class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm sm:grid-cols-4">
    ${cell(urgentOpen, 'High priority, open', urgentOpen ? 'text-red-600' : '')}
    ${cell(subs.filter((s) => s.status === 'Pending').length, 'Pending')}
    ${cell(subs.filter((s) => s.status === 'In Progress').length, 'In progress')}
    ${cell(subs.filter((s) => s.status === 'Resolved').length, 'Resolved')}
  </div>

  <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[minmax(0,1fr)_repeat(4,auto)]">
    <div class="col-span-2 sm:col-span-4 lg:col-span-1">
      <label for="flt-q" class="sr-only">Search submissions</label>
      <input id="flt-q" type="search" data-filter="q" value="${esc(f.q)}" placeholder="Search by keyword, name, or category" class="${INPUT}">
    </div>
    <select aria-label="Filter by type" data-filter="type" class="${INPUT}">${opts([['all', 'All types'], ['complaint', 'Complaints'], ['suggestion', 'Suggestions']], f.type)}</select>
    <select aria-label="Filter by priority" data-filter="priority" class="${INPUT}">${opts([['all', 'All priorities'], ...PRIORITIES.map((x) => [x, x])], f.priority)}</select>
    <select aria-label="Filter by status" data-filter="status" class="${INPUT}">${opts([['all', 'All statuses'], ...STATUSES.map((x) => [x, x])], f.status)}</select>
    <select aria-label="Sort order" data-filter="sort" class="${INPUT}">${opts([['priority', 'AI priority'], ['newest', 'Newest first'], ['oldest', 'Oldest first']], f.sort)}</select>
  </div>
  <p id="sub-count" class="mt-4 text-sm text-slate-500" aria-live="polite">${submissionCountText()}</p>
  <div id="sub-list" class="mt-3 space-y-4">${submissionListHtml()}</div>`;
}

/* ===================================================================
   RENDER + ROUTING
   =================================================================== */
function viewFor() {
  if (state.loading) return skeleton();
  const t = state.tab;
  if (isAdmin()) return t === 'submissions' ? adminSubmissionsView() : adminAnnouncementsView();
  if (t === 'complaint' || t === 'suggestion') return submitView(t);
  return t === 'mine' ? mineView() : homeView();
}

const DRAFT_IDS = ['f-title', 'f-category', 'f-body'];
function render() {
  const y = window.scrollY;
  const view = state.user ? (state.loading ? 'loading' : state.tab) : 'auth';
  // Re-rendering the same screen (menu toggle, delete confirm) shouldn't wipe a half-written announcement.
  const draft = app.dataset.view === view
    ? DRAFT_IDS.map((id) => [id, $('#' + id)?.value]).filter(([, v]) => v != null) : [];
  app.innerHTML = state.user ? shell(viewFor()) : authView();
  app.dataset.view = view;
  draft.forEach(([id, v]) => { const el = $('#' + id); if (el) el.value = v; });
  renderPhotoGrid();
  window.scrollTo(0, y);
}

async function loadData() {
  try {
    const [announcements, submissions] = await Promise.all([
      api.listAnnouncements(),
      api.listSubmissions()
    ]);
    state.announcements = announcements;
    state.submissions = submissions;
  } catch (err) {
    toast(friendlyError(err), 'error');
  }
}

async function go(tab) {
  setPendingFile(null, { silent: true });
  clearPhotos();
  state.tab = tab;
  state.menuOpen = false;
  state.confirmDelete = null;
  state.loading = true;
  render();
  window.scrollTo(0, 0);
  await loadData();
  state.loading = false;
  render();
}

function defaultTab() { return isAdmin() ? 'announcements' : 'home'; }

function resetSession() {
  state.user = null; state.profile = null; state.tab = null; state.menuOpen = false;
  state.announcements = []; state.submissions = [];
  state.filters = { q: '', type: 'all', priority: 'all', status: 'all', sort: 'priority' };
  state.portal = 'citizen'; state.authMode = 'login'; state.notice = '';
}

/* ===================================================================
   FORM HANDLERS
   =================================================================== */
function showAuthError(msg) {
  const el = $('#auth-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

async function handleAuth(form) {
  const mode = form.dataset.mode;
  const portal = form.dataset.portal;
  const fd = new FormData(form);
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const btn = form.querySelector('button[type="submit"]');
  showAuthError('');

  if (!/^\S+@\S+\.\S+$/.test(email)) return showAuthError('Enter a valid email address.');
  if (!password) return showAuthError('Enter your password.');
  if (mode === 'signup') {
    if (!String(fd.get('full_name') || '').trim()) return showAuthError('Enter your full name.');
    if (password.length < 6) return showAuthError('Use a password with at least 6 characters.');
  }

  setBusy(btn, true, mode === 'signup' ? 'Creating account' : 'Signing in');
  try {
    if (mode === 'signup') {
      const res = await api.signUp({
        email, password,
        fullName: String(fd.get('full_name')).trim(),
        purok: String(fd.get('purok') || '').trim()
      });
      if (res.needsConfirmation) {
        state.authMode = 'login';
        state.notice = 'Account created. Open the confirmation email we sent, then sign in.';
        render();
        return;
      }
    }
    const { user, profile } = await api.signIn(email, password);

    // Role-based routing: each portal only admits its own role.
    if (portal === 'admin' && profile.role !== 'admin') {
      await api.signOut();
      throw new Error('This account doesn\u2019t have staff access. Use the Resident portal instead.');
    }
    if (portal === 'citizen' && profile.role === 'admin') {
      await api.signOut();
      throw new Error('Staff accounts sign in through the Barangay staff portal.');
    }
    state.user = user;
    state.profile = profile;
    state.notice = '';
    await go(defaultTab());
  } catch (err) {
    setBusy(btn, false);
    showAuthError(friendlyError(err));
  }
}

async function handleSubmission(form) {
  const type = form.dataset.type;
  const title = form.elements['subject'].value.trim();
  const location = form.elements['location'].value.trim();
  const description = form.elements['description'].value.trim();
  const btn = form.querySelector('button[type="submit"]');

  if (title.length < 3) return toast('Add a subject so staff know what this is about.', 'error');
  if (description.length < 20) return toast('Add a few more details. Use at least 20 characters.', 'error');

  try {
    let imageUrl = '';
    if (state.pendingFile) {
      setBusy(btn, true, 'Uploading photo');
      imageUrl = await api.uploadImage(state.pendingFile, state.profile.id);
    }
    setBusy(btn, true, 'Analyzing report');
    const ai = await analyzeSubmission({ type, title, description, location, imageUrl });

    setBusy(btn, true, 'Sending');
    await api.createSubmission({
      user_id: state.profile.id,
      type, title, description,
      location: location || null,
      image_url: imageUrl || null,
      ai_sentiment: ai.sentiment,
      ai_category: ai.category,
      ai_priority: ai.priority,
      ai_summary: ai.summary
    });
    toast(type === 'complaint' ? 'Complaint sent' : 'Suggestion sent');
    await go('mine');
  } catch (err) {
    setBusy(btn, false);
    toast(friendlyError(err), 'error');
  }
}

async function handleAnnouncement(form) {
  const title = form.elements['title'].value.trim();
  const body = form.elements['body'].value.trim();
  const category = form.elements['category'].value;
  const btn = form.querySelector('button[type="submit"]');
  if (title.length < 3) return toast('Add a title for the announcement.', 'error');
  if (body.length < 10) return toast('Write a message of at least 10 characters.', 'error');

  const photos = state.pendingPhotos.map((p) => p.file);
  setBusy(btn, true, photos.length ? `Uploading photo 1 of ${photos.length}` : 'Publishing');
  try {
    const imageUrls = [];
    for (let i = 0; i < photos.length; i++) {
      setBusy(btn, true, `Uploading photo ${i + 1} of ${photos.length}`);
      imageUrls.push(await api.uploadImage(photos[i], state.profile.id));
    }
    setBusy(btn, true, 'Publishing');
    await api.createAnnouncement({
      title, body, category,
      image_urls: imageUrls,
      author_id: state.profile.id,
      author_name: state.profile.full_name || 'Barangay Office'
    });
    state.announcements = await api.listAnnouncements();
    form.reset();
    clearPhotos();
    toast(photos.length > 1 ? `Announcement published with ${photos.length} photos` : 'Announcement published');
    render();
  } catch (err) {
    setBusy(btn, false);
    toast(friendlyError(err), 'error');
  }
}

/* ===================================================================
   IMAGE PICKER
   =================================================================== */
function setPendingFile(file, { silent = false } = {}) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.pendingFile = file;
  state.previewUrl = file ? URL.createObjectURL(file) : null;
  if (silent) return;
  const pv = $('#preview'), dz = $('#dropzone');
  if (!pv || !dz) return;
  if (file) {
    $('#preview-img').src = state.previewUrl;
    $('#preview-name').textContent = file.name;
    $('#preview-size').textContent = formatBytes(file.size);
    pv.classList.remove('hidden'); pv.classList.add('flex');
    dz.classList.add('hidden');
  } else {
    pv.classList.add('hidden'); pv.classList.remove('flex');
    dz.classList.remove('hidden');
    const input = $('#f-photo');
    if (input) input.value = '';
  }
}

function acceptFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Choose an image file (JPG, PNG, or WebP).', 'error'); return setPendingFile(null); }
  if (file.size > 5 * 1024 * 1024) { toast('That photo is over 5 MB. Choose a smaller one.', 'error'); return setPendingFile(null); }
  setPendingFile(file);
}

/* ===================================================================
   EVENTS (delegated)
   =================================================================== */
const lightbox = { urls: [], index: 0 };

function showLightbox() {
  const { urls, index } = lightbox;
  const multi = urls.length > 1;
  const img = $('#lightbox-img');
  img.src = urls[index];
  img.alt = multi ? `Photo ${index + 1} of ${urls.length}` : 'Attachment, full size';
  $('#lightbox-prev').classList.toggle('hidden', !multi);
  $('#lightbox-next').classList.toggle('hidden', !multi);
  const count = $('#lightbox-count');
  count.classList.toggle('hidden', !multi);
  count.textContent = `${index + 1} / ${urls.length}`;
  const lb = $('#lightbox');
  lb.classList.remove('hidden'); lb.classList.add('flex');
}
function openLightbox(urls, index = 0) {
  lightbox.urls = urls; lightbox.index = index;
  showLightbox();
}
function stepLightbox(delta) {
  const n = lightbox.urls.length;
  if (n < 2) return;
  lightbox.index = (lightbox.index + delta + n) % n;
  showLightbox();
}
function closeLightbox() {
  const lb = $('#lightbox');
  lb.classList.add('hidden'); lb.classList.remove('flex');
  $('#lightbox-img').src = '';
  lightbox.urls = [];
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'portal':
      state.portal = el.dataset.portal; state.notice = ''; render(); break;
    case 'auth-mode':
      state.authMode = el.dataset.mode; state.notice = ''; render(); break;
    case 'fill-demo': {
      state.portal = el.dataset.role; state.authMode = 'login'; state.notice = ''; render();
      const admin = el.dataset.role === 'admin';
      $('#f-email').value = admin ? 'admin@barangay.demo' : 'resident@barangay.demo';
      $('#f-password').value = admin ? 'admin123' : 'resident123';
      break;
    }
    case 'toggle-menu':
      state.menuOpen = !state.menuOpen; render(); break;
    case 'nav':
      if (state.tab !== el.dataset.tab || state.menuOpen) await go(el.dataset.tab); break;
    case 'logout':
      try { await api.signOut(); } catch (err) { toast(friendlyError(err), 'error'); }
      resetSession(); render(); break;
    case 'refresh':
      state.loading = true; render(); await loadData(); state.loading = false; render(); break;
    case 'remove-image':
      setPendingFile(null); break;
    case 'lightbox': {
      if (el.dataset.gallery) {
        const a = state.announcements.find((x) => x.id === el.dataset.gallery);
        const urls = a ? announcementImages(a) : [];
        if (urls.length) openLightbox(urls, Number(el.dataset.index) || 0);
      } else {
        openLightbox([el.dataset.src]);
      }
      break;
    }
    case 'lightbox-prev': stepLightbox(-1); break;
    case 'lightbox-next': stepLightbox(1); break;
    case 'remove-photo': removePhoto(Number(el.dataset.index)); break;
    case 'close-lightbox':
      if (e.target === el || el.tagName === 'BUTTON') closeLightbox(); break;
    case 'expand': {
      const p = el.previousElementSibling;
      const clamped = p.classList.toggle('line-clamp-3');
      el.textContent = clamped ? 'Show more' : 'Show less';
      break;
    }
    case 'delete-announcement': {
      const id = el.dataset.id;
      if (state.confirmDelete !== id) { state.confirmDelete = id; render(); break; }
      try {
        await api.deleteAnnouncement(id);
        state.announcements = state.announcements.filter((a) => a.id !== id);
        state.confirmDelete = null;
        toast('Announcement deleted');
      } catch (err) { toast(friendlyError(err), 'error'); }
      render();
      break;
    }
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'auth') handleAuth(form);
  else if (kind === 'submission') handleSubmission(form);
  else if (kind === 'announcement') handleAnnouncement(form);
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.matches('input[data-file]')) return acceptFile(t.files[0]);
  if (t.matches('input[data-files]')) { addPhotos(t.files); t.value = ''; return; }
  if (t.matches('select[data-filter]')) {
    state.filters[t.dataset.filter] = t.value;
    return renderSubmissionList();
  }
  if (t.matches('select[data-action="status"]')) {
    const id = t.dataset.id, status = t.value;
    const item = state.submissions.find((s) => s.id === id);
    const previous = item ? item.status : 'Pending';
    if (item) item.status = status;
    try {
      await api.updateStatus(id, status);
      toast(`Status set to ${status}`);
    } catch (err) {
      if (item) item.status = previous;
      toast(friendlyError(err), 'error');
    }
    render();
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches('input[data-filter="q"]')) {
    state.filters.q = t.value;
    renderSubmissionList();
  } else if (t.matches('textarea[data-count]')) {
    const c = $('#desc-count');
    if (c) c.textContent = t.value.length;
  }
});

document.addEventListener('keydown', (e) => {
  const open = !$('#lightbox').classList.contains('hidden');
  if (open && e.key === 'ArrowLeft') return stepLightbox(-1);
  if (open && e.key === 'ArrowRight') return stepLightbox(1);
  if (e.key !== 'Escape') return;
  if (open) return closeLightbox();
  if (state.menuOpen) { state.menuOpen = false; render(); }
});

// Swipe left/right inside the photo viewer on touch screens
let touchStartX = null;
$('#lightbox').addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
$('#lightbox').addEventListener('touchend', (e) => {
  if (touchStartX == null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  touchStartX = null;
  if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
});

// Drag and drop for the photo picker
document.addEventListener('dragover', (e) => {
  if (e.target.closest('[data-dropzone], [data-multi-dropzone]')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  if (e.target.closest('[data-multi-dropzone]')) {
    e.preventDefault();
    addPhotos(e.dataTransfer.files);
    return;
  }
  if (!e.target.closest('[data-dropzone]')) return;
  e.preventDefault();
  acceptFile(e.dataTransfer.files[0]);
});

/* ===================================================================
   INIT
   =================================================================== */
async function init() {
  if (DEMO) seedDemo();
  else {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && state.user) { resetSession(); render(); }
    });
  }
  try {
    const session = await api.restore();
    if (session) {
      state.user = session.user;
      state.profile = session.profile;
      await go(defaultTab());
      return;
    }
  } catch (err) {
    console.warn('Could not restore session', err);
  }
  render();
}

init();
})();
