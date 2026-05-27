import { useState, useEffect } from "react";

// ── Fonts via Google Fonts (injected once) ────────────────────────────────────
const FontLink = () => {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
};

// ── Palette & tokens ──────────────────────────────────────────────────────────
const T = {
  cream: "#FAF8F4",
  parchment: "#F2EDE4",
  sage: "#8FAF96",
  sageDark: "#5C8068",
  sageLight: "#D4E4D8",
  dustyRose: "#C9A8A8",
  dustyRoseLight: "#F0E4E4",
  mist: "#E8EEF0",
  ink: "#2C2C2C",
  inkLight: "#6B6B6B",
  gold: "#C8A96E",
  goldLight: "#F5EDD8",
  white: "#FFFFFF",
  answered: "#8FAF96",
  answeredBg: "#E8F2EB",
};

const CAT_COLORS = {
  Family: { bg: "#EDE8F5", text: "#6B5B95" },
  Health: { bg: "#E8F2EB", text: "#4A7A5A" },
  Relationships: { bg: "#F5E8EE", text: "#8B4A6B" },
  "Work / Career": { bg: "#E8EEF5", text: "#4A5A8B" },
  "Spiritual Growth": { bg: "#F5EDD8", text: "#8B6A2A" },
  Finances: { bg: "#E8F0F0", text: "#2A6B6B" },
};

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED_PRAYERS = [
  { id: 1, title: "Mom's surgery recovery", category: "Health", note: "She goes in Tuesday. Praying for peace and a smooth procedure.", isPublic: true, status: "active", date: "2025-05-01", answeredNote: null, praying: 3 },
  { id: 2, title: "Job interview at Northlight", category: "Work / Career", note: "Final round on Friday. Been waiting for this one.", isPublic: true, status: "answered", date: "2025-04-18", answeredNote: "Got the offer! Starting June 3rd. God is so faithful.", praying: 7 },
  { id: 3, title: "Peace in our marriage", category: "Relationships", note: "We've been going through a rough patch. Asking for patience and grace for us both.", isPublic: false, status: "active", date: "2025-05-10", answeredNote: null, praying: 0 },
  { id: 4, title: "Financial breakthrough", category: "Finances", note: "Rent increase coming. Trusting God to provide.", isPublic: true, status: "active", date: "2025-05-15", answeredNote: null, praying: 2 },
  { id: 5, title: "Grow closer to God", category: "Spiritual Growth", note: "Start the year with intentional daily prayer.", isPublic: false, status: "active", date: "2025-01-01", answeredNote: null, praying: 0 },
];

const SEED_FRIENDS = [
  {
    id: 1, name: "Sarah M.", avatar: "SM", prayers: [
      { id: 101, title: "My brother's addiction", category: "Family", note: "Been praying for James for 2 years. Believe God is working.", isPublic: true, status: "active", date: "2025-03-01", praying: 12 },
      { id: 102, title: "New apartment", category: "Finances", note: "Lease is up end of June.", isPublic: true, status: "answered", date: "2025-04-20", answeredNote: "Found the perfect place under budget! Moving in June 1st.", praying: 8 },
    ]
  },
  {
    id: 2, name: "David K.", avatar: "DK", prayers: [
      { id: 201, title: "Seminary acceptance", category: "Spiritual Growth", note: "Applied to three programs. Surrendering the outcome.", isPublic: true, status: "active", date: "2025-05-05", praying: 5 },
    ]
  },
  {
    id: 3, name: "Priya R.", avatar: "PR", prayers: [
      { id: 301, title: "Dad's heart health", category: "Health", note: "Procedure scheduled for next month.", isPublic: true, status: "active", date: "2025-05-18", praying: 9 },
      { id: 302, title: "Business launch", category: "Work / Career", note: "Launching the bakery in July.", isPublic: true, status: "active", date: "2025-04-30", praying: 15 },
    ]
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const today = () => new Date().toISOString().split("T")[0];

// ── Sub-components ────────────────────────────────────────────────────────────

function CategoryPill({ cat }) {
  const c = CAT_COLORS[cat] || { bg: T.mist, text: T.inkLight };
  return (
    <span style={{ background: c.bg, color: c.text, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, letterSpacing: 0.2 }}>
      {cat}
    </span>
  );
}

function Avatar({ initials, size = 36 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: T.sageLight, display: "flex", alignItems: "center", justifyContent: "center", color: T.sageDark, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: size * 0.38, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: T.white, borderRadius: 16, padding: "16px 18px", marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", ...style }}>
      {children}
    </div>
  );
}

function Badge({ label, color = T.sage }) {
  return (
    <span style={{ background: color + "22", color, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
      {label}
    </span>
  );
}

function Btn({ children, onClick, variant = "primary", style = {}, small = false }) {
  const base = {
    border: "none", borderRadius: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500, padding: small ? "7px 14px" : "11px 20px", fontSize: small ? 13 : 14,
    transition: "opacity 0.15s", display: "inline-flex", alignItems: "center", gap: 6,
  };
  const variants = {
    primary: { background: T.sageDark, color: T.white },
    secondary: { background: T.sageLight, color: T.sageDark },
    ghost: { background: "transparent", color: T.inkLight, border: `1px solid ${T.parchment}` },
    gold: { background: T.goldLight, color: T.gold },
    rose: { background: T.dustyRoseLight, color: T.dustyRose },
    danger: { background: "#FDE8E8", color: "#C0504D" },
  };
  return <button style={{ ...base, ...variants[variant], ...style }} onClick={onClick}>{children}</button>;
}

// ── Prayer Card ───────────────────────────────────────────────────────────────
function PrayerCard({ prayer, onAnswer, onDelete, mine = true, onAddToList, myPrayingIds, onTogglePraying }) {
  const [expanded, setExpanded] = useState(false);
  const days = daysBetween(prayer.date, today());
  const isPraying = myPrayingIds?.includes(prayer.id);

  return (
    <Card style={{ borderLeft: `3px solid ${prayer.status === "answered" ? T.sage : T.gold}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <CategoryPill cat={prayer.category} />
            {prayer.status === "answered" && <Badge label="✓ Answered" color={T.sage} />}
            {mine && !prayer.isPublic && <Badge label="🔒 Private" color={T.inkLight} />}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: 17, color: T.ink, lineHeight: 1.3, marginBottom: 4 }}>{prayer.title}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{fmt(prayer.date)} · {days === 0 ? "Today" : `${days}d ago`}</div>
        </div>
        <div style={{ color: T.sageLight, fontSize: 18, paddingLeft: 8, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>{expanded ? "▲" : "▾"}</div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.parchment}` }}>
          {prayer.note && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, marginBottom: 12, lineHeight: 1.6 }}>{prayer.note}</p>}
          {prayer.status === "answered" && prayer.answeredNote && (
            <div style={{ background: T.answeredBg, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark, fontWeight: 500, marginBottom: 4 }}>🙌 What happened</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: T.ink, lineHeight: 1.5 }}>{prayer.answeredNote}</div>
            </div>
          )}

          {!mine && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn small variant={isPraying ? "secondary" : "ghost"} onClick={() => onTogglePraying(prayer.id)}>
                🙏 {isPraying ? "Praying" : "I'm Praying"} {prayer.praying > 0 && `(${prayer.praying + (isPraying ? 0 : 0)})`}
              </Btn>
              <Btn small variant="gold" onClick={() => onAddToList(prayer)}>+ My List</Btn>
            </div>
          )}

          {mine && prayer.status === "active" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn small variant="secondary" onClick={() => onAnswer(prayer)}>✓ Mark Answered</Btn>
              <Btn small variant="ghost" onClick={() => onDelete(prayer.id)}>Delete</Btn>
            </div>
          )}

          {mine && prayer.status === "answered" && (
            <Btn small variant="ghost" onClick={() => onDelete(prayer.id)}>Remove</Btn>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Add Prayer Modal ──────────────────────────────────────────────────────────
function AddPrayerModal({ onClose, onAdd }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [cat, setCat] = useState("Family");
  const [isPublic, setIsPublic] = useState(true);

  const cats = Object.keys(CAT_COLORS);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: T.cream, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: T.ink, marginBottom: 20 }}>New Prayer</div>

        <label style={labelStyle}>What are you praying for?</label>
        <input style={inputStyle} placeholder="A short title..." value={title} onChange={e => setTitle(e.target.value)} />

        <label style={labelStyle}>Notes (optional)</label>
        <textarea style={{ ...inputStyle, height: 80, resize: "none" }} placeholder="Add context, scripture, or details..." value={note} onChange={e => setNote(e.target.value)} />

        <label style={labelStyle}>Category</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{ border: `1.5px solid ${cat === c ? T.sageDark : T.parchment}`, background: cat === c ? T.sageLight : T.white, borderRadius: 20, padding: "5px 12px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: cat === c ? T.sageDark : T.inkLight, transition: "all 0.15s" }}>
              {c}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div onClick={() => setIsPublic(!isPublic)} style={{ width: 44, height: 24, borderRadius: 12, background: isPublic ? T.sage : T.parchment, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
            <div style={{ position: "absolute", top: 3, left: isPublic ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: T.white, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          </div>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight }}>{isPublic ? "Public — friends can see & pray" : "Private — just for you"}</span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Btn style={{ flex: 1 }} onClick={() => { if (title.trim()) onAdd({ title: title.trim(), note, category: cat, isPublic }); }}>Add Prayer</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Answer Modal ──────────────────────────────────────────────────────────────
function AnswerModal({ prayer, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: T.cream, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🙌</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink, marginBottom: 4, textAlign: "center" }}>Prayer Answered!</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, textAlign: "center", marginBottom: 20 }}>"{prayer.title}"</div>
        <label style={labelStyle}>What happened? (required)</label>
        <textarea style={{ ...inputStyle, height: 100, resize: "none" }} placeholder="Share how God moved..." value={note} onChange={e => setNote(e.target.value)} />
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn style={{ flex: 1 }} variant="secondary" onClick={() => { if (note.trim()) onConfirm(note.trim()); }}>Save & Close Out</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── My Prayers Tab ────────────────────────────────────────────────────────────
function MyPrayers({ prayers, setPrayers }) {
  const [showAdd, setShowAdd] = useState(false);
  const [answerTarget, setAnswerTarget] = useState(null);
  const [filter, setFilter] = useState("active");

  const active = prayers.filter(p => p.status === "active");
  const answered = prayers.filter(p => p.status === "answered");
  const shown = filter === "active" ? active : answered;

  const addPrayer = ({ title, note, category, isPublic }) => {
    const newP = { id: Date.now(), title, note, category, isPublic, status: "active", date: today(), answeredNote: null, praying: 0 };
    setPrayers(prev => [newP, ...prev]);
    setShowAdd(false);
  };

  const deletePrayer = (id) => setPrayers(prev => prev.filter(p => p.id !== id));

  const markAnswered = (note) => {
    setPrayers(prev => prev.map(p => p.id === answerTarget.id ? { ...p, status: "answered", answeredNote: note } : p));
    setAnswerTarget(null);
  };

  return (
    <div style={tabContent}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={pageTitle}>My Prayers</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>{active.length} active · {answered.length} answered</div>
        </div>
        <Btn small onClick={() => setShowAdd(true)}>+ Add</Btn>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["active", "answered"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ border: "none", borderRadius: 20, padding: "6px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: filter === f ? T.sageDark : T.parchment, color: filter === f ? T.white : T.inkLight, transition: "all 0.15s" }}>
            {f === "active" ? `Active (${active.length})` : `Answered (${answered.length})`}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: T.inkLight, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
          {filter === "active" ? "No active prayers yet. Add one above." : "No answered prayers yet. Keep praying!"}
        </div>
      )}

      {shown.map(p => (
        <PrayerCard key={p.id} prayer={p} mine onAnswer={setAnswerTarget} onDelete={deletePrayer} />
      ))}

      {showAdd && <AddPrayerModal onClose={() => setShowAdd(false)} onAdd={addPrayer} />}
      {answerTarget && <AnswerModal prayer={answerTarget} onClose={() => setAnswerTarget(null)} onConfirm={markAnswered} />}
    </div>
  );
}

// ── Feed Tab ──────────────────────────────────────────────────────────────────
function Feed({ friends, myPrayers, setMyPrayers }) {
  const [prayingIds, setPrayingIds] = useState([]);

  const togglePraying = (id) => setPrayingIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const addToList = (prayer) => {
    const exists = myPrayers.find(p => p.title === prayer.title);
    if (exists) return;
    const newP = { ...prayer, id: Date.now(), isPublic: false, status: "active", date: today(), answeredNote: null, praying: 0 };
    setMyPrayers(prev => [newP, ...prev]);
  };

  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 20 }}>
        <div style={pageTitle}>Friends' Prayers</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>Stand with your community</div>
      </div>

      {friends.map(friend => (
        <div key={friend.id} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Avatar initials={friend.avatar} />
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, color: T.ink }}>{friend.name}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{friend.prayers.length} shared prayer{friend.prayers.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
          {friend.prayers.map(p => (
            <PrayerCard key={p.id} prayer={p} mine={false} myPrayingIds={prayingIds} onTogglePraying={togglePraying} onAddToList={addToList} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Friends Tab ───────────────────────────────────────────────────────────────
function Friends({ friends }) {
  const [search, setSearch] = useState("");
  const [requested, setRequested] = useState([]);

  const SUGGESTIONS = [
    { id: 10, name: "Marcus T.", avatar: "MT", mutual: 2 },
    { id: 11, name: "Grace L.", avatar: "GL", mutual: 1 },
  ];

  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 20 }}>
        <div style={pageTitle}>Friends</div>
      </div>

      <input style={{ ...inputStyle, marginBottom: 20 }} placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>Connected</div>
      {friends.filter(f => f.name.toLowerCase().includes(search.toLowerCase())).map(f => (
        <Card key={f.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar initials={f.avatar} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, color: T.ink }}>{f.name}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{f.prayers.filter(p => p.status === "active").length} active prayers</div>
          </div>
          <Badge label="Friend" color={T.sage} />
        </Card>
      ))}

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>Suggestions</div>
      {SUGGESTIONS.map(s => (
        <Card key={s.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar initials={s.avatar} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, color: T.ink }}>{s.name}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{s.mutual} mutual friend{s.mutual !== 1 ? "s" : ""}</div>
          </div>
          <Btn small variant={requested.includes(s.id) ? "secondary" : "ghost"} onClick={() => setRequested(prev => [...prev, s.id])}>
            {requested.includes(s.id) ? "Sent ✓" : "Connect"}
          </Btn>
        </Card>
      ))}
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
function Dashboard({ prayers }) {
  const active = prayers.filter(p => p.status === "active").length;
  const answered = prayers.filter(p => p.status === "answered").length;
  const total = prayers.length;
  const pct = total ? Math.round((answered / total) * 100) : 0;

  const streak = 14; // mock
  const catCounts = Object.keys(CAT_COLORS).map(cat => ({
    cat,
    count: prayers.filter(p => p.category === cat).length,
  })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);

  const maxCat = catCounts[0]?.count || 1;

  const recentAnswered = prayers.filter(p => p.status === "answered").slice(0, 3);

  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 20 }}>
        <div style={pageTitle}>Dashboard</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>Your prayer life at a glance</div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Active", val: active, color: T.gold, bg: T.goldLight },
          { label: "Answered", val: answered, color: T.sage, bg: T.answeredBg },
          { label: "Streak", val: `${streak}d`, color: T.dustyRose, bg: T.dustyRoseLight },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: k.color }}>{k.val}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: k.color, fontWeight: 500 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Answer rate */}
      <Card>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, marginBottom: 10 }}>Answer Rate</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 8, background: T.parchment, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: T.sage, borderRadius: 4, transition: "width 0.6s ease" }} />
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: T.sageDark, minWidth: 40 }}>{pct}%</div>
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginTop: 6 }}>{answered} of {total} prayers answered</div>
      </Card>

      {/* Category breakdown */}
      {catCounts.length > 0 && (
        <Card>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, marginBottom: 12 }}>By Category</div>
          {catCounts.map(({ cat, count }) => {
            const c = CAT_COLORS[cat];
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.ink }}>{cat}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>{count}</span>
                </div>
                <div style={{ height: 6, background: T.parchment, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${(count / maxCat) * 100}%`, height: "100%", background: c.text, borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Recent answered */}
      {recentAnswered.length > 0 && (
        <div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>Recent Testimonies</div>
          {recentAnswered.map(p => (
            <Card key={p.id} style={{ borderLeft: `3px solid ${T.sage}` }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 600, color: T.ink, marginBottom: 4 }}>{p.title}</div>
              {p.answeredNote && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, lineHeight: 1.5 }}>{p.answeredNote}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
function Profile({ prayers }) {
  const [notifications, setNotifications] = useState(true);
  const [defaultPublic, setDefaultPublic] = useState(true);

  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 24 }}>
        <div style={pageTitle}>Profile</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Avatar initials="ME" size={60} />
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink }}>My Account</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>me@email.com</div>
        </div>
      </div>

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>Settings</div>

      {[
        { label: "Prayer reminders", sub: "Daily nudge to check in", val: notifications, set: setNotifications },
        { label: "Default to public", sub: "New prayers visible to friends", val: defaultPublic, set: setDefaultPublic },
      ].map(({ label, sub, val, set }) => (
        <Card key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>{label}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{sub}</div>
          </div>
          <div onClick={() => set(!val)} style={{ width: 44, height: 24, borderRadius: 12, background: val ? T.sage : T.parchment, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 3, left: val ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: T.white, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          </div>
        </Card>
      ))}

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>Stats</div>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "Total Prayers", val: prayers.length },
            { label: "Answered", val: prayers.filter(p => p.status === "answered").length },
            { label: "Day Streak", val: "14 days" },
            { label: "Friends", val: 3 },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: T.sageDark }}>{val}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Btn variant="ghost" style={{ width: "100%", justifyContent: "center", marginTop: 20, color: T.dustyRose }}>Sign Out</Btn>
    </div>
  );
}

// ── Google Sign-In Screen ─────────────────────────────────────────────────────
function SignIn({ onSignIn }) {
  return (
    <div style={{ minHeight: "100vh", background: T.cream, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🕊️</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, color: T.ink, letterSpacing: -1, marginBottom: 8 }}>Amen</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: T.inkLight, textAlign: "center", maxWidth: 260, lineHeight: 1.6, marginBottom: 48 }}>
        A quiet place to pray, share, and remember how God moves.
      </div>
      <button onClick={onSignIn} style={{ display: "flex", alignItems: "center", gap: 12, background: T.white, border: `1.5px solid ${T.parchment}`, borderRadius: 14, padding: "14px 24px", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, color: T.ink }}>
        <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginTop: 32, textAlign: "center" }}>
        Your prayers stay private unless you choose to share them.
      </div>
    </div>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────
const TABS = [
  { id: "prayers", icon: "🙏", label: "Prayers" },
  { id: "feed", icon: "🕊️", label: "Feed" },
  { id: "friends", icon: "👥", label: "Friends" },
  { id: "dashboard", icon: "✦", label: "Stats" },
  { id: "profile", icon: "☽", label: "Profile" },
];

function BottomNav({ active, setActive }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.parchment}`, display: "flex", zIndex: 100 }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setActive(t.id)} style={{ flex: 1, border: "none", background: "none", cursor: "pointer", padding: "10px 4px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: active === t.id ? T.sageDark : T.inkLight, fontWeight: active === t.id ? 500 : 400 }}>{t.label}</span>
          {active === t.id && <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.sageDark }} />}
        </button>
      ))}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const tabContent = { padding: "24px 16px 100px", maxWidth: 480, margin: "0 auto" };
const pageTitle = { fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: T.ink, lineHeight: 1.1, marginBottom: 2 };
const inputStyle = { width: "100%", border: `1.5px solid ${T.parchment}`, borderRadius: 12, padding: "11px 14px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", color: T.ink, background: T.white, boxSizing: "border-box", outline: "none", marginBottom: 12 };
const labelStyle = { display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, marginBottom: 6, letterSpacing: 0.3 };

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState("prayers");
  const [prayers, setPrayers] = useState(SEED_PRAYERS);
  const [friends] = useState(SEED_FRIENDS);

  if (!signedIn) return (
    <>
      <FontLink />
      <SignIn onSignIn={() => setSignedIn(true)} />
    </>
  );

  return (
    <>
      <FontLink />
      <div style={{ minHeight: "100vh", background: T.cream }}>
        {tab === "prayers" && <MyPrayers prayers={prayers} setPrayers={setPrayers} />}
        {tab === "feed" && <Feed friends={friends} myPrayers={prayers} setMyPrayers={setPrayers} />}
        {tab === "friends" && <Friends friends={friends} />}
        {tab === "dashboard" && <Dashboard prayers={prayers} />}
        {tab === "profile" && <Profile prayers={prayers} />}
        <BottomNav active={tab} setActive={setTab} />
      </div>
    </>
  );
}
