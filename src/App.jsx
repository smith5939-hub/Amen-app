import { useState, useEffect, createContext, useContext } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, getDocs } from "firebase/firestore";

const FontLink = () => {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
};

const T = {
  cream: "#FAF8F4", parchment: "#F2EDE4", sage: "#8FAF96", sageDark: "#5C8068",
  sageLight: "#D4E4D8", dustyRose: "#C9A8A8", dustyRoseLight: "#F0E4E4",
  mist: "#E8EEF0", ink: "#2C2C2C", inkLight: "#6B6B6B", gold: "#C8A96E",
  goldLight: "#F5EDD8", white: "#FFFFFF", answered: "#8FAF96", answeredBg: "#E8F2EB",
};

const CAT_COLORS = {
  Family: { bg: "#EDE8F5", text: "#6B5B95" },
  Health: { bg: "#E8F2EB", text: "#4A7A5A" },
  Relationships: { bg: "#F5E8EE", text: "#8B4A6B" },
  "Work / Career": { bg: "#E8EEF5", text: "#4A5A8B" },
  "Spiritual Growth": { bg: "#F5EDD8", text: "#8B6A2A" },
  Finances: { bg: "#E8F0F0", text: "#2A6B6B" },
};
const catColor = (cat) => CAT_COLORS[cat] || { bg: T.mist, text: T.inkLight };
const primaryCatColor = (cats) => catColor(Array.isArray(cats) ? cats[0] : cats).text;

const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const today = () => new Date().toISOString().split("T")[0];

const SORT_OPTIONS = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "longest", label: "Longest waiting" },
  { id: "az", label: "A – Z" },
];

const tabContent = { padding: "18px 16px 100px", maxWidth: 480, margin: "0 auto" };
const pageTitle = { fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: T.ink, lineHeight: 1.1, marginBottom: 2 };
const inputStyle = { width: "100%", border: `1.5px solid ${T.parchment}`, borderRadius: 12, padding: "11px 14px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", color: T.ink, background: T.white, boxSizing: "border-box", outline: "none", marginBottom: 12 };
const labelStyle = { display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, marginBottom: 6, letterSpacing: 0.3 };

const ToastCtx = createContext(() => {});
function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const show = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: T.sageDark, color: T.white, padding: "11px 20px", borderRadius: 24, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 2000, display: "flex", alignItems: "center", gap: 8, maxWidth: "85%" }}>
          <span>✓</span> {toast}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

function CategoryPill({ cat }) {
  const c = catColor(cat);
  return <span style={{ background: c.bg, color: c.text, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{cat}</span>;
}

function Avatar({ initials, photoURL, size = 36 }) {
  if (photoURL) return <img src={photoURL} alt="avatar" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return <div style={{ width: size, height: size, borderRadius: "50%", background: T.sageLight, display: "flex", alignItems: "center", justifyContent: "center", color: T.sageDark, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: size * 0.38, flexShrink: 0 }}>{initials}</div>;
}

function Card({ children, style = {} }) {
  return <div style={{ background: T.white, borderRadius: 16, padding: "16px 18px", marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", ...style }}>{children}</div>;
}

function Badge({ label, color = T.sage }) {
  return <span style={{ background: color + "22", color, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{label}</span>;
}

function Btn({ children, onClick, variant = "primary", style = {}, small = false, disabled = false }) {
  const base = { border: "none", borderRadius: 12, cursor: disabled ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, padding: small ? "7px 14px" : "11px 20px", fontSize: small ? 13 : 14, transition: "opacity 0.15s", display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1 };
  const variants = {
    primary: { background: T.sageDark, color: T.white },
    secondary: { background: T.sageLight, color: T.sageDark },
    ghost: { background: "transparent", color: T.inkLight, border: `1px solid ${T.parchment}` },
    gold: { background: T.goldLight, color: T.gold },
    danger: { background: T.dustyRoseLight, color: T.dustyRose },
  };
  return <button style={{ ...base, ...variants[variant], ...style }} onClick={disabled ? undefined : onClick}>{children}</button>;
}

function PrayerCard({ prayer, onAnswer, onDelete, onEdit, mine = true, onAddToList, myPrayingIds, onTogglePraying, activePrayMode = false, covered = false, onToggleCovered, alreadyAdded = false }) {
  const [expanded, setExpanded] = useState(false);
  const days = daysBetween(prayer.date, today());
  const isPraying = myPrayingIds?.includes(prayer.id);
  const isAnswered = prayer.status === "answered";
  const cats = Array.isArray(prayer.categories) ? prayer.categories : [prayer.categories].filter(Boolean);
  const accent = isAnswered ? T.sage : primaryCatColor(cats);
  const showLock = mine && !prayer.fromFriend && !prayer.isPublic;
  const handleCover = (e) => { e.stopPropagation(); onToggleCovered && onToggleCovered(prayer.id); };

  return (
    <Card style={{ padding: "11px 14px", marginBottom: 8, borderLeft: `4px solid ${covered ? T.sageLight : accent}`, opacity: covered ? 0.55 : 1, transition: "opacity 0.3s, border-color 0.3s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {activePrayMode && mine && !isAnswered ? (
          <button onClick={handleCover} style={{ width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${covered ? T.sage : T.sageLight}`, background: covered ? T.sage : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, transition: "all 0.2s", padding: 0 }}>
            <span style={{ color: covered ? T.white : T.sageLight, fontSize: 10 }}>🙏</span>
          </button>
        ) : (
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: covered ? T.sageLight : accent, flexShrink: 0, marginLeft: 1 }} />
        )}
        <div style={{ flex: 1, cursor: "pointer", overflow: "hidden" }} onClick={() => setExpanded(!expanded)}>
          {prayer.fromFriend && prayer.ownerName && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark, fontWeight: 500, marginBottom: 1 }}>{prayer.ownerName}'s Prayer</div>
          )}
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: 16, color: covered ? T.inkLight : T.ink, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: covered ? "line-through" : "none", textDecorationColor: T.sageLight }}>
            {prayer.title}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          {isAnswered && <span style={{ fontSize: 12, color: T.sage }}>✓</span>}
          {showLock && <span style={{ fontSize: 11 }}>🔒</span>}
          <span style={{ fontSize: 10, color: T.inkLight, fontFamily: "'DM Sans', sans-serif" }}>{cats[0]?.split(" ")[0]}{cats.length > 1 ? ` +${cats.length - 1}` : ""}</span>
          <span style={{ color: T.parchment, fontSize: 14 }}>{expanded ? "▲" : "▾"}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.parchment}` }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {cats.map(c => <CategoryPill key={c} cat={c} />)}
            {isAnswered && <Badge label="✓ Answered" color={T.sage} />}
            {showLock && <Badge label="🔒 Private" color={T.inkLight} />}
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, alignSelf: "center" }}>{fmt(prayer.date)} · {days === 0 ? "Today" : `${days}d`}</span>
          </div>
          {prayer.note && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, marginBottom: 12, lineHeight: 1.6 }}>{prayer.note}</p>}
          {isAnswered && prayer.answeredNote && (
            <div style={{ background: T.answeredBg, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark, fontWeight: 500, marginBottom: 4 }}>🙌 What happened</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: T.ink, lineHeight: 1.5 }}>{prayer.answeredNote}</div>
            </div>
          )}
          {!mine && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn small variant={isPraying ? "secondary" : "ghost"} onClick={() => onTogglePraying(prayer.id)}>🙏 {isPraying ? "Praying" : "I'm Praying"} {prayer.praying > 0 && `(${prayer.praying})`}</Btn>
              <Btn small variant={alreadyAdded ? "secondary" : "gold"} onClick={() => onAddToList(prayer)}>{alreadyAdded ? "✓ On My List" : "+ My List"}</Btn>
            </div>
          )}
          {mine && prayer.status === "active" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn small variant="secondary" onClick={() => onAnswer(prayer)}>✓ Mark Answered</Btn>
              <Btn small variant="ghost" onClick={() => onEdit && onEdit(prayer)}>Edit</Btn>
              <Btn small variant="ghost" onClick={() => onDelete(prayer.id)}>Delete</Btn>
            </div>
          )}
          {mine && prayer.status === "answered" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn small variant="ghost" onClick={() => onEdit && onEdit(prayer)}>Edit</Btn>
              <Btn small variant="ghost" onClick={() => onDelete(prayer.id)}>Remove</Btn>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AddPrayerModal({ onClose, onAdd, editPrayer = null, friends = [], defaultPublic = true }) {
  const isEdit = !!editPrayer;
  const initialCats = editPrayer ? (Array.isArray(editPrayer.categories) ? editPrayer.categories : [editPrayer.categories]) : ["Family"];
  const [title, setTitle] = useState(editPrayer?.title || "");
  const [note, setNote] = useState(editPrayer?.note || "");
  const [selectedCats, setSelectedCats] = useState(initialCats);
  const [customCat, setCustomCat] = useState("");
  const [isPublic, setIsPublic] = useState(editPrayer ? editPrayer.isPublic : defaultPublic);
  const [prayerDate, setPrayerDate] = useState(editPrayer?.prayerDate || "");
  const cats = Object.keys(CAT_COLORS);
  const toggleCat = (c) => setSelectedCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  const addCustomCat = () => {
    const t = customCat.trim();
    if (t && !selectedCats.includes(t)) { setSelectedCats(prev => [...prev, t]); setCustomCat(""); }
  };
  const submit = () => {
    if (!title.trim()) return;
    const finalCats = selectedCats.length ? selectedCats : ["Other"];
    onAdd({ title: title.trim(), note, categories: finalCats, isPublic, prayerDate });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: T.cream, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: T.ink, marginBottom: 20 }}>{isEdit ? "Edit Prayer" : "New Prayer"}</div>
        <label style={labelStyle}>What are you praying for?</label>
        <input style={inputStyle} placeholder="A short title..." value={title} onChange={e => setTitle(e.target.value)} />
        <label style={labelStyle}>Notes (optional)</label>
        <textarea style={{ ...inputStyle, height: 80, resize: "none" }} placeholder="Add context, scripture, or details..." value={note} onChange={e => setNote(e.target.value)} />
        <label style={labelStyle}>Date to pray by (optional)</label>
        <input type="date" style={{ ...inputStyle }} value={prayerDate} onChange={e => setPrayerDate(e.target.value)} />
        <label style={labelStyle}>Categories (choose any)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {cats.map(c => {
            const on = selectedCats.includes(c);
            const cc = catColor(c);
            return (
              <button key={c} onClick={() => toggleCat(c)} style={{ border: `1.5px solid ${on ? cc.text : T.parchment}`, background: on ? cc.bg : T.white, borderRadius: 20, padding: "5px 12px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: on ? cc.text : T.inkLight, fontWeight: on ? 500 : 400 }}>
                {on ? "✓ " : ""}{c}
              </button>
            );
          })}
          {selectedCats.filter(c => !cats.includes(c)).map(c => (
            <button key={c} onClick={() => toggleCat(c)} style={{ border: `1.5px solid ${T.sageDark}`, background: T.sageLight, borderRadius: 20, padding: "5px 12px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: T.sageDark, fontWeight: 500 }}>✓ {c}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Add a custom category..." value={customCat} onChange={e => setCustomCat(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addCustomCat(); }} />
          <Btn small variant="secondary" onClick={addCustomCat} style={{ flexShrink: 0 }}>Add</Btn>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div onClick={() => setIsPublic(!isPublic)} style={{ width: 44, height: 24, borderRadius: 12, background: isPublic ? T.sage : T.parchment, cursor: "pointer", position: "relative", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 3, left: isPublic ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: T.white, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          </div>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight }}>{isPublic ? "Public — friends can see & pray" : "Private — just for you"}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn style={{ flex: 1 }} onClick={submit}>{isEdit ? "Save Changes" : "Add Prayer"}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

function AnswerModal({ prayer, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: T.cream, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🙌</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink, marginBottom: 4, textAlign: "center" }}>Celebrate this!</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, textAlign: "center", marginBottom: 20 }}>"{prayer.title}"</div>
        <label style={labelStyle}>Want to remember what happened? (optional)</label>
        <textarea style={{ ...inputStyle, height: 90, resize: "none" }} placeholder="Share how God moved — or just close it out." value={note} onChange={e => setNote(e.target.value)} />
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn style={{ flex: 1 }} variant="secondary" onClick={() => onConfirm(note.trim() || null)}>{note.trim() ? "Save & Celebrate" : "Mark Answered"}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

function MyPrayers({ prayers, addPrayer, updatePrayer, deletePrayer, friends, firstName, defaultPublic }) {
  const showToast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [answerTarget, setAnswerTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [catFilter, setCatFilter] = useState("All");
  const [sort, setSort] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [activePrayMode, setActivePrayMode] = useState(false);
  const [coveredIds, setCoveredIds] = useState([]);
  const catsOf = (p) => Array.isArray(p.categories) ? p.categories : [p.categories].filter(Boolean);
  const active = prayers.filter(p => p.status === "active");
  const answered = prayers.filter(p => p.status === "answered");
  const allCats = ["All", ...Array.from(new Set(prayers.flatMap(catsOf).concat(Object.keys(CAT_COLORS))))];
  let shown = statusFilter === "active" ? active : answered;
  if (catFilter !== "All") shown = shown.filter(p => catsOf(p).includes(catFilter));
  shown = [...shown].sort((a, b) => {
    if (sort === "newest") return new Date(b.date) - new Date(a.date);
    if (sort === "oldest" || sort === "longest") return new Date(a.date) - new Date(b.date);
    if (sort === "az") return a.title.localeCompare(b.title);
    return 0;
  });
  const mineOwn = shown.filter(p => !p.fromFriend);
  const heldForOthers = shown.filter(p => p.fromFriend);
  const coveredCount = coveredIds.filter(id => shown.find(p => p.id === id)).length;

  const handleAdd = async ({ title, note, categories, isPublic, prayerDate }) => {
    await addPrayer({ title, note, categories, isPublic, prayerDate });
    setShowAdd(false);
    showToast("Prayer added");
  };
  const handleSave = async ({ title, note, categories, isPublic, prayerDate }) => {
    await updatePrayer(editTarget.id, { title, note, categories, isPublic, prayerDate });
    setEditTarget(null);
    showToast("Changes saved");
  };
  const handleDelete = async (id) => { await deletePrayer(id); showToast("Prayer removed"); };
  const handleAnswer = async (note) => {
    await updatePrayer(answerTarget.id, { status: "answered", answeredNote: note });
    setAnswerTarget(null);
    showToast("Celebrating with you 🙌");
  };
  const toggleCovered = (id) => setCoveredIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const endSession = () => { setActivePrayMode(false); setCoveredIds([]); };
  const renderCard = (p) => (
    <PrayerCard key={p.id} prayer={p} mine onAnswer={setAnswerTarget} onDelete={handleDelete} onEdit={setEditTarget} activePrayMode={activePrayMode} covered={coveredIds.includes(p.id)} onToggleCovered={toggleCovered} />
  );
  return (
    <div style={tabContent}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={pageTitle}>{firstName ? `${firstName}'s Prayers` : "My Prayers"}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>{active.length} active · {answered.length} answered</div>
        </div>
        <Btn small onClick={() => setShowAdd(true)}>+ Add</Btn>
      </div>
      {activePrayMode ? (
        <div style={{ background: T.sageLight, borderRadius: 14, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: T.sageDark }}>🙏 Praying through your list</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.sageDark, opacity: 0.8 }}>{coveredCount} of {shown.filter(p => p.status === "active").length} covered</div>
          </div>
          <Btn small variant="ghost" style={{ color: T.sageDark, borderColor: T.sage }} onClick={endSession}>Done</Btn>
        </div>
      ) : (
        <button onClick={() => { setActivePrayMode(true); setStatusFilter("active"); }} style={{ width: "100%", background: T.goldLight, border: `1.5px dashed ${T.gold}`, borderRadius: 14, padding: "11px 16px", marginBottom: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.gold, fontWeight: 500 }}>
          <span style={{ fontSize: 18 }}>🙏</span> Start Praying Through My List
        </button>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        {["active", "answered"].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{ border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: statusFilter === f ? T.sageDark : T.parchment, color: statusFilter === f ? T.white : T.inkLight }}>
            {f === "active" ? `Active (${active.length})` : `Answered (${answered.length})`}
          </button>
        ))}
        <button onClick={() => setShowFilters(!showFilters)} style={{ marginLeft: "auto", border: `1px solid ${showFilters ? T.sageDark : T.parchment}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: showFilters ? T.sageLight : "transparent", color: showFilters ? T.sageDark : T.inkLight }}>⊞ Filter</button>
      </div>
      {showFilters && (
        <div style={{ background: T.white, borderRadius: 14, padding: "14px 16px", marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, fontWeight: 500, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 8 }}>Category</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {allCats.map(c => (
              <button key={c} onClick={() => setCatFilter(c)} style={{ border: `1.5px solid ${catFilter === c ? T.sageDark : T.parchment}`, background: catFilter === c ? T.sageLight : "transparent", borderRadius: 20, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: catFilter === c ? T.sageDark : T.inkLight }}>{c}</button>
            ))}
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, fontWeight: 500, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 8 }}>Sort by</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SORT_OPTIONS.map(s => (
              <button key={s.id} onClick={() => setSort(s.id)} style={{ border: `1.5px solid ${sort === s.id ? T.sageDark : T.parchment}`, background: sort === s.id ? T.sageLight : "transparent", borderRadius: 20, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: sort === s.id ? T.sageDark : T.inkLight }}>{s.label}</button>
            ))}
          </div>
        </div>
      )}
      {catFilter !== "All" && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginBottom: 8 }}>
          {shown.length} prayer{shown.length !== 1 ? "s" : ""} in {catFilter}
          <button onClick={() => setCatFilter("All")} style={{ marginLeft: 8, border: "none", background: "none", color: T.dustyRose, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>✕ Clear</button>
        </div>
      )}
      {shown.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🕊️</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: T.ink, marginBottom: 8 }}>{statusFilter === "active" ? "Your prayer list is empty" : "No answered prayers yet"}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, lineHeight: 1.6 }}>{statusFilter === "active" ? "Tap + Add to bring your first prayer before God." : "Keep praying — answered prayers will appear here."}</div>
        </div>
      )}
      {mineOwn.map(renderCard)}
      {heldForOthers.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 4px 14px" }}>
            <div style={{ flex: 1, height: 1, background: T.parchment }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase" }}>Holding for Others</span>
            <div style={{ flex: 1, height: 1, background: T.parchment }} />
          </div>
          {heldForOthers.map(renderCard)}
        </>
      )}
      {showAdd && <AddPrayerModal onClose={() => setShowAdd(false)} onAdd={handleAdd} friends={friends} defaultPublic={defaultPublic} />}
      {editTarget && <AddPrayerModal onClose={() => setEditTarget(null)} onAdd={handleSave} editPrayer={editTarget} friends={friends} defaultPublic={defaultPublic} />}
      {answerTarget && <AnswerModal prayer={answerTarget} onClose={() => setAnswerTarget(null)} onConfirm={handleAnswer} />}
    </div>
  );
}

function Feed({ friends, myPrayers, addPrayer }) {
  const showToast = useToast();
  const [prayingIds, setPrayingIds] = useState([]);
  const togglePraying = (id) => {
    const adding = !prayingIds.includes(id);
    setPrayingIds(prev => adding ? [...prev, id] : prev.filter(x => x !== id));
    if (adding) showToast("They'll know you're praying 🙏");
  };
  const addedKeys = myPrayers.filter(p => p.fromFriend).map(p => p.sourceKey);
  const keyFor = (friend, p) => `${friend.uid}-${p.id}`;
  const addToList = async (friend, prayer) => {
    const key = keyFor(friend, prayer);
    if (addedKeys.includes(key)) { showToast("Already on your list"); return; }
    await addPrayer({ ...prayer, sourceKey: key, isPublic: false, status: "active", date: today(), answeredNote: null, praying: 0, fromFriend: true, ownerName: friend.displayName?.split(" ")[0] || "Friend" });
    showToast(`Added to your list`);
  };
  const addAll = async (friend) => {
    const toAdd = friend.prayers.filter(p => p.status === "active" && !addedKeys.includes(keyFor(friend, p)));
    if (!toAdd.length) { showToast("All already on your list"); return; }
    for (const prayer of toAdd) {
      await addPrayer({ ...prayer, sourceKey: keyFor(friend, prayer), isPublic: false, status: "active", date: today(), answeredNote: null, praying: 0, fromFriend: true, ownerName: friend.displayName?.split(" ")[0] || "Friend" });
    }
    showToast(`Added ${toAdd.length} prayers`);
  };

  if (friends.length === 0) {
    return (
      <div style={tabContent}>
        <div style={{ marginBottom: 20 }}>
          <div style={pageTitle}>Friends' Prayers</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>Stand with your community</div>
        </div>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: T.ink, marginBottom: 8 }}>No friends yet</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, lineHeight: 1.6 }}>Connect with friends in the Friends tab to see their prayer requests here.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 20 }}>
        <div style={pageTitle}>Friends' Prayers</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>Stand with your community</div>
      </div>
      {friends.map(friend => (
        <div key={friend.uid} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Avatar initials={(friend.displayName || "?").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={friend.photoURL} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, color: T.ink }}>{friend.displayName || "Friend"}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{friend.prayers?.length || 0} shared prayer{(friend.prayers?.length || 0) !== 1 ? "s" : ""}</div>
            </div>
            {friend.prayers?.length > 0 && <Btn small variant="ghost" onClick={() => addAll(friend)}>+ Add All</Btn>}
          </div>
          {(friend.prayers || []).map(p => (
            <PrayerCard key={p.id} prayer={p} mine={false} myPrayingIds={prayingIds} onTogglePraying={togglePraying} onAddToList={(pr) => addToList(friend, pr)} alreadyAdded={addedKeys.includes(keyFor(friend, p))} />
          ))}
          {(!friend.prayers || friend.prayers.length === 0) && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, padding: "10px 0", fontStyle: "italic" }}>No public prayers shared yet.</div>
          )}
        </div>
      ))}
    </div>
  );
}

function Friends({ currentUser, friends, incomingRequests, onAccept, onDecline, onSendRequest }) {
  const showToast = useToast();
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setRequestSent(false);
    try {
      const q = query(collection(db, "users"), where("email", "==", search.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setSearchResult({ notFound: true });
      } else {
        const userData = { uid: snap.docs[0].id, ...snap.docs[0].data() };
        if (userData.uid === currentUser.uid) {
          setSearchResult({ isSelf: true });
        } else if (friends.find(f => f.uid === userData.uid)) {
          setSearchResult({ alreadyFriend: true, user: userData });
        } else {
          setSearchResult({ user: userData });
        }
      }
    } catch (e) {
      setSearchResult({ error: true });
    }
    setSearching(false);
  };

  const handleSend = async () => {
    if (!searchResult?.user) return;
    await onSendRequest(searchResult.user);
    setRequestSent(true);
    showToast("Friend request sent 🙏");
  };

  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 20 }}><div style={pageTitle}>Friends</div></div>

      {/* Incoming requests */}
      {incomingRequests.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.dustyRose, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
            {incomingRequests.length} Pending Request{incomingRequests.length !== 1 ? "s" : ""}
          </div>
          {incomingRequests.map(req => (
            <Card key={req.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar initials={(req.fromName || "?").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={req.fromPhoto} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, color: T.ink }}>{req.fromName || "Someone"}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{req.fromEmail}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn small variant="secondary" onClick={() => onAccept(req)}>Accept</Btn>
                <Btn small variant="ghost" onClick={() => onDecline(req)}>Decline</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>Find a Friend</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Search by email address..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSearch(); }} />
        <Btn small variant="secondary" onClick={handleSearch} disabled={searching} style={{ flexShrink: 0 }}>{searching ? "..." : "Search"}</Btn>
      </div>

      {searchResult && (
        <Card style={{ marginBottom: 20 }}>
{searchResult.notFound && (
  <div>
    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, marginBottom: 12 }}>Not on LIFT yet.</div>
    <Btn small variant="secondary" onClick={() => {
      const subject = encodeURIComponent("Join me on LIFT");
      const body = encodeURIComponent(`Hey! I've been using LIFT to track my prayers and I'd love to pray together. Join me here: https://amen-app-two.vercel.app`);
      window.open(`mailto:${search}?subject=${subject}&body=${body}`);
    }}>✉️ Send Invite</Btn>
  </div>
)}  
{searchResult.isSelf && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight }}>That's you! 😄</div>}
          {searchResult.alreadyFriend && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.sageDark }}>You're already friends with {searchResult.user.displayName}! 🙏</div>}
          {searchResult.error && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.dustyRose }}>Something went wrong. Try again.</div>}
          {searchResult.user && !searchResult.alreadyFriend && !searchResult.isSelf && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar initials={(searchResult.user.displayName || "?").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={searchResult.user.photoURL} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, color: T.ink }}>{searchResult.user.displayName}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{searchResult.user.email}</div>
              </div>
              <Btn small variant={requestSent ? "secondary" : "primary"} onClick={handleSend} disabled={requestSent}>{requestSent ? "Sent ✓" : "Connect"}</Btn>
            </div>
          )}
        </Card>
      )}

      {/* Connected friends */}
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>Connected ({friends.length})</div>
      {friends.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, padding: "16px 0", fontStyle: "italic" }}>No friends connected yet. Search by email to get started.</div>
      )}
      {friends.map(f => (
        <Card key={f.uid} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar initials={(f.displayName || "?").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={f.photoURL} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, color: T.ink }}>{f.displayName || "Friend"}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{f.email}</div>
          </div>
          <Badge label="Friend" color={T.sage} />
        </Card>
      ))}
    </div>
  );
}

function Dashboard({ prayers }) {
  const catsOf = (p) => Array.isArray(p.categories) ? p.categories : [p.categories].filter(Boolean);
  const active = prayers.filter(p => p.status === "active").length;
  const answered = prayers.filter(p => p.status === "answered").length;
  const total = prayers.length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const streak = 14;
  const catCounts = Object.keys(CAT_COLORS).map(cat => ({ cat, count: prayers.filter(p => catsOf(p).includes(cat)).length })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);
  const maxCat = catCounts[0]?.count || 1;
  const recentAnswered = prayers.filter(p => p.status === "answered").slice(0, 3);
  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 20 }}>
        <div style={pageTitle}>Dashboard</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>Your prayer life at a glance</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[{ label: "Active", val: active, color: T.gold, bg: T.goldLight }, { label: "Answered", val: answered, color: T.sage, bg: T.answeredBg }, { label: "Streak", val: `${streak}d`, color: T.dustyRose, bg: T.dustyRoseLight }].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: k.color }}>{k.val}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: k.color, fontWeight: 500 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <Card>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, marginBottom: 10 }}>Answer Rate</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 8, background: T.parchment, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: T.sage, borderRadius: 4 }} />
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: T.sageDark, minWidth: 40 }}>{pct}%</div>
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginTop: 6 }}>{answered} of {total} prayers answered</div>
      </Card>
      {catCounts.length > 0 && (
        <Card>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, marginBottom: 12 }}>By Category</div>
          {catCounts.map(({ cat, count }) => {
            const c = catColor(cat);
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

function Profile({ prayers, user, defaultPublic, setDefaultPublic, onSignOut }) {
  const [notifications, setNotifications] = useState(true);
  const settings = [
    { label: "Prayer reminders", sub: "Daily nudge to check in", val: notifications, set: setNotifications },
    { label: "Default to private", sub: "New prayers start private", val: !defaultPublic, set: (v) => setDefaultPublic(!v) },
  ];
  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 24 }}><div style={pageTitle}>Profile</div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Avatar initials={(user?.displayName || "Me").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={user?.photoURL} size={60} />
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink }}>{user?.displayName || "My Account"}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>{user?.email || ""}</div>
        </div>
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>Settings</div>
      {settings.map(({ label, sub, val, set }) => (
        <Card key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>{label}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{sub}</div>
          </div>
          <div onClick={() => set(!val)} style={{ width: 44, height: 24, borderRadius: 12, background: val ? T.sage : T.parchment, cursor: "pointer", position: "relative", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 3, left: val ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: T.white, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          </div>
        </Card>
      ))}
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>Stats</div>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[{ label: "Total Prayers", val: prayers.length }, { label: "Answered", val: prayers.filter(p => p.status === "answered").length }, { label: "Day Streak", val: "14 days" }, { label: "Friends", val: 3 }].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: T.sageDark }}>{val}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{label}</div>
            </div>
          ))}
        </div>
      </Card>
      <Btn variant="ghost" style={{ width: "100%", justifyContent: "center", marginTop: 20, color: T.dustyRose }} onClick={onSignOut}>Sign Out</Btn>
    </div>
  );
}

function SignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError("Sign in failed. Please try again.");
      setLoading(false);
    }
  };
  return (
    <div style={{ minHeight: "100vh", background: T.cream, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🕊️</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 44, fontWeight: 600, color: T.ink, letterSpacing: 4, marginBottom: 4 }}>LIFT</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.sageDark, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 500, marginBottom: 24 }}>Log it for Transformation</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: T.inkLight, textAlign: "center", maxWidth: 270, lineHeight: 1.6, marginBottom: 32 }}>A quiet place to bring your prayers, hold others up, and remember how God moves.</div>
      {error && <div style={{ color: T.dustyRose, fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>{error}</div>}
      <button onClick={handleGoogle} disabled={loading} style={{ background: T.white, border: `1.5px solid ${T.parchment}`, borderRadius: 14, padding: "14px 32px", cursor: loading ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, color: T.ink, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", opacity: loading ? 0.6 : 1 }}>
        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z"/></svg>
        {loading ? "Signing in..." : "Continue with Google"}
      </button>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginTop: 32, textAlign: "center" }}>Your prayers stay private unless you choose to share them.</div>
    </div>
  );
}

const TABS = [
  { id: "prayers", icon: "🙏", label: "Prayers" },
  { id: "feed", icon: "🕊️", label: "Feed" },
  { id: "friends", icon: "👥", label: "Friends" },
  { id: "dashboard", icon: "✦", label: "Stats" },
  { id: "profile", icon: "☽", label: "Profile" },
];

function BottomNav({ active, setActive, requestCount }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.parchment}`, display: "flex", zIndex: 100 }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setActive(t.id)} style={{ flex: 1, border: "none", background: "none", cursor: "pointer", padding: "10px 4px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
          {t.id === "friends" && requestCount > 0 && (
            <div style={{ position: "absolute", top: 6, right: "50%", transform: "translateX(8px)", width: 16, height: 16, borderRadius: "50%", background: T.dustyRose, color: T.white, fontSize: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{requestCount}</div>
          )}
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: active === t.id ? T.sageDark : T.inkLight, fontWeight: active === t.id ? 500 : 400 }}>{t.label}</span>
          {active === t.id && <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.sageDark }} />}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState("prayers");
  const [prayers, setPrayers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [defaultPublic, setDefaultPublic] = useState(true);
  const [loadingPrayers, setLoadingPrayers] = useState(true);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Save/update user profile in Firestore
        await setDoc(doc(db, "users", firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || "",
          email: firebaseUser.email || "",
          photoURL: firebaseUser.photoURL || "",
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
      setUser(firebaseUser || null);
    });
    return unsub;
  }, []);

  // Prayers listener
  useEffect(() => {
    if (!user) { setPrayers([]); setLoadingPrayers(false); return; }
    setLoadingPrayers(true);
    const q = query(collection(db, "prayers"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrayers(data);
      setLoadingPrayers(false);
    });
    return unsub;
  }, [user]);

  // Friends listener
  useEffect(() => {
    if (!user) { setFriends([]); return; }
    const q = query(collection(db, "friendRequests"), where("status", "==", "accepted"), where("fromUid", "==", user.uid));
    const q2 = query(collection(db, "friendRequests"), where("status", "==", "accepted"), where("toUid", "==", user.uid));

// Friends listener
  useEffect(() => {
    if (!user) { setFriends([]); return; }

    const loadFriendData = async (uids) => {
      if (!uids.length) return [];
      const profiles = await Promise.all(uids.map(async uid => {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return null;
        const profile = { uid: snap.id, ...snap.data() };
        const prayerSnap = await getDocs(query(collection(db, "prayers"), where("userId", "==", uid), where("isPublic", "==", true)));
        profile.prayers = prayerSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        return profile;
      }));
      return profiles.filter(Boolean);
    };

    const refreshFriends = async () => {
      const [snap1, snap2] = await Promise.all([
        getDocs(query(collection(db, "friendRequests"), where("status", "==", "accepted"), where("fromUid", "==", user.uid))),
        getDocs(query(collection(db, "friendRequests"), where("status", "==", "accepted"), where("toUid", "==", user.uid))),
      ]);
      const fromUids = snap1.docs.map(d => d.data().toUid);
      const toUids = snap2.docs.map(d => d.data().fromUid);
      const allUids = [...new Set([...fromUids, ...toUids])];
      const profiles = await loadFriendData(allUids);
      setFriends(profiles);
    };

    refreshFriends();

    // Re-run when friend requests change
    const q = query(collection(db, "friendRequests"), where("status", "==", "accepted"));
    const unsub = onSnapshot(q, () => refreshFriends());
    return unsub;
  }, [user]);

  // Incoming requests listener
  useEffect(() => {
    if (!user) { setIncomingRequests([]); return; }
    const q = query(collection(db, "friendRequests"), where("toUid", "==", user.uid), where("status", "==", "pending"));
    const unsub = onSnapshot(q, (snap) => {
      setIncomingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  const addPrayer = async (fields) => {
    await addDoc(collection(db, "prayers"), {
      userId: user.uid,
      title: fields.title || "",
      note: fields.note || "",
      categories: fields.categories || ["Other"],
      isPublic: fields.isPublic ?? true,
      status: fields.status || "active",
      date: fields.date || today(),
      answeredNote: fields.answeredNote || null,
      praying: fields.praying || 0,
      fromFriend: fields.fromFriend || false,
      ownerName: fields.ownerName || null,
      sourceKey: fields.sourceKey || null,
      prayerDate: fields.prayerDate || null,
      createdAt: new Date().toISOString(),
    });
  };

  const updatePrayer = async (id, fields) => {
    await updateDoc(doc(db, "prayers", id), fields);
  };

  const deletePrayer = async (id) => {
    await deleteDoc(doc(db, "prayers", id));
  };

  const sendFriendRequest = async (toUser) => {
    await addDoc(collection(db, "friendRequests"), {
      fromUid: user.uid,
      fromName: user.displayName || "",
      fromEmail: user.email || "",
      fromPhoto: user.photoURL || "",
      toUid: toUser.uid,
      toEmail: toUser.email || "",
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  };

  const acceptRequest = async (req) => {
    await updateDoc(doc(db, "friendRequests", req.id), { status: "accepted" });
  };

  const declineRequest = async (req) => {
    await updateDoc(doc(db, "friendRequests", req.id), { status: "declined" });
  };

  const handleSignOut = async () => { await signOut(auth); };

  if (user === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: T.cream, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: T.sageDark, letterSpacing: 3 }}>LIFT</div>
      </div>
    );
  }

  if (!user) return (<><FontLink /><SignIn /></>);

  const firstName = (user.displayName || user.email || "Friend").split(" ")[0];

  return (
    <>
      <FontLink />
      <ToastProvider>
        <div style={{ minHeight: "100vh", background: T.cream }}>
          <div style={{ position: "sticky", top: 0, zIndex: 90, background: T.cream, textAlign: "center", padding: "14px 0 10px", borderBottom: `1px solid ${T.parchment}` }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.sageDark, letterSpacing: 3 }}>LIFT</span>
          </div>
          {loadingPrayers ? (
            <div style={{ textAlign: "center", padding: "60px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight }}>Loading your prayers...</div>
          ) : (
            <>
              {tab === "prayers" && <MyPrayers prayers={prayers} addPrayer={addPrayer} updatePrayer={updatePrayer} deletePrayer={deletePrayer} friends={friends} firstName={firstName} defaultPublic={defaultPublic} />}
              {tab === "feed" && <Feed friends={friends} myPrayers={prayers} addPrayer={addPrayer} />}
              {tab === "friends" && <Friends currentUser={user} friends={friends} incomingRequests={incomingRequests} onAccept={acceptRequest} onDecline={declineRequest} onSendRequest={sendFriendRequest} />}
              {tab === "dashboard" && <Dashboard prayers={prayers} />}
              {tab === "profile" && <Profile prayers={prayers} user={user} defaultPublic={defaultPublic} setDefaultPublic={setDefaultPublic} onSignOut={handleSignOut} />}
            </>
          )}
          <BottomNav active={tab} setActive={setTab} requestCount={incomingRequests.length} />
        </div>
      </ToastProvider>
    </>
  );
}