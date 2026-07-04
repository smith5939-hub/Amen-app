import { useState, useEffect, createContext, useContext } from "react";
import { auth, db, functions } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, signInWithCredential, getRedirectResult, deleteUser, updateProfile, reauthenticateWithCredential, reauthenticateWithPopup } from "firebase/auth";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import {
  addDoc,
  arrayUnion,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


async function registerNativePush(firebaseUser) {
  if (!firebaseUser) return;
  if (!(window.Capacitor?.isNativePlatform?.())) return; // native only; web push handled separately
  try {
    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== "granted") {
      console.log("Native push permission not granted:", perm.receive);
      return;
    }
    const { token } = await FirebaseMessaging.getToken();
    if (!token) { console.log("No FCM token returned"); return; }
    await setDoc(
      doc(db, "users", firebaseUser.uid),
      { fcmTokens: arrayUnion(token), fcmTokenUpdatedAt: new Date().toISOString() },
      { merge: true }
    );
    console.log("FCM token registered for", firebaseUser.uid);
  } catch (e) {
    console.log("Native push registration error:", e);
  }
}

// Returns a clean display name, avoiding Apple private-relay gibberish
function safeDisplayName(rawName, email) {
  const name = (rawName || "").trim();
  if (name) return name;
  const e = (email || "").toLowerCase();
  if (!e || e.includes("privaterelay.appleid.com")) return "Friend";
  const prefix = e.split("@")[0];
  // Reject token-like prefixes (long random strings, all-hex hashes)
  if (prefix.length > 20 || /^[0-9a-f]{16,}$/i.test(prefix)) return "Friend";
  return prefix;
}

async function syncLatestGoogleProfileToFirestore(firebaseUser) {
  if (!firebaseUser) return;

  const googleProfile = firebaseUser.providerData?.find(
    (profile) => profile.providerId === "google.com"
  );

  const fallbackName = firebaseUser.email?.split("@")[0] || "Friend";

  try {
    await setDoc(
      doc(db, "users", firebaseUser.uid),
      {
        uid: firebaseUser.uid,
        displayName: safeDisplayName(googleProfile?.displayName || firebaseUser.displayName, firebaseUser.email),
        email: firebaseUser.email || "",
        photoURL:
          googleProfile?.photoURL ||
          firebaseUser.photoURL ||
          "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("Unable to sync latest Google profile to Firestore", error);
  }
}



async function syncGoogleProfileToFirestore(firebaseUser) {
  if (!firebaseUser) return;

  const fallbackName = firebaseUser.email?.split("@")[0] || "Friend";

  try {
    await setDoc(
      doc(db, "users", firebaseUser.uid),
      {
        uid: firebaseUser.uid,
        displayName: safeDisplayName(firebaseUser.displayName, firebaseUser.email),
        email: firebaseUser.email || "",
        photoURL: firebaseUser.photoURL || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("Unable to sync Google profile to Firestore", error);
  }
}


const callClaude = async (prompt) => {
  const proxy = httpsCallable(functions, "claudeProxy");
  const result = await proxy({ prompt });
  return result.data.text;
};

const FontLink = () => {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap";
    document.head.appendChild(link);

    const style = document.createElement("style");
    style.innerHTML = `
      html, body, #root {
        margin: 0;
        padding: 0;
        width: 100%;
        min-height: 100%;
        background: #FAF8F4;
        overflow-x: hidden;
      }

      * {
        box-sizing: border-box;
      }

      body {
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(link);
      document.head.removeChild(style);
    };
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

const maskEmail = (email) => {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
};

const SORT_OPTIONS = [
  { id: "manual", label: "Manual" },
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
  const [imgError, setImgError] = useState(false);
  if (photoURL && !imgError) return <img src={photoURL} alt="avatar" onError={() => setImgError(true)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
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

function PrayerCard({ prayer, onAnswer, onDelete, onEdit, mine = true, onAddToList, myPrayingIds, onTogglePraying, activePrayMode = false, covered = false, onToggleCovered, alreadyAdded = false, friends = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [verseIndex, setVerseIndex] = useState(Math.floor(Math.random() * 24));
  const days = daysBetween(prayer.date, today());
  const isPraying = myPrayingIds?.includes(prayer.id);
  const isAnswered = prayer.status === "answered";
  const cats = Array.isArray(prayer.categories) ? prayer.categories : [prayer.categories].filter(Boolean);
  const accent = isAnswered ? T.sage : primaryCatColor(cats);
  const showLock = mine && !prayer.fromFriend && !prayer.isPublic && !(prayer.sharedToCircles && prayer.sharedToCircles.length > 0);
  const handleCover = (e) => { e.stopPropagation(); onToggleCovered && onToggleCovered(prayer.id); };

  return (
    <Card style={{ padding: "11px 14px", marginBottom: 8, borderLeft: `4px solid ${covered ? T.sageLight : accent}`, opacity: covered ? 0.55 : 1, transition: "opacity 0.3s, border-color 0.3s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {activePrayMode && !isAnswered ? (
          <button onClick={handleCover} style={{ width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${covered ? T.sage : T.sageLight}`, background: covered ? T.sage : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, transition: "all 0.2s", padding: 0 }}>
            <span style={{ color: covered ? T.white : T.sageLight, fontSize: 10 }}>🙏</span>
          </button>
        ) : (
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: covered ? T.sageLight : accent, flexShrink: 0, marginLeft: 1 }} />
        )}
        <div style={{ flex: 1, cursor: "pointer", overflow: "hidden" }} onClick={() => setExpanded(!expanded)}>
          {prayer.fromFriend && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark, fontWeight: 500, marginBottom: 1 }}>{(friends.find(f => f.uid === prayer.userId)?.displayName) || prayer.ownerName || "Friend"}'s Prayer</div>
          )}
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: 16, color: covered ? T.inkLight : T.ink, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textDecoration: covered ? "line-through" : "none", textDecorationColor: T.sageLight }}>
            {prayer.title}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          {isAnswered && <span style={{ fontSize: 12, color: T.sage }}>✓</span>}
          {showLock && <span style={{ fontSize: 11 }}>🔒</span>}
          {Boolean(prayer.prayerDate) && !isAnswered && (() => { const daysUntil = daysBetween(today(), prayer.prayerDate); return daysUntil >= 0 && daysUntil <= 1 ? <span style={{ fontSize: 11 }}>📅</span> : null; })()}
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
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, alignSelf: "center" }}>{fmt(prayer.date)}</span>
            {Boolean(prayer.prayerDate) && !isAnswered && (() => { const daysUntil = daysBetween(today(), prayer.prayerDate); return daysUntil >= 0 && daysUntil <= 1 ? <span style={{ background: T.dustyRoseLight, color: T.dustyRose, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>📅 {daysUntil === 0 ? "Today!" : "Tomorrow!"}</span> : null; })()}
          </div>
          {prayer.note && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, marginBottom: 12, lineHeight: 1.6 }}>{prayer.note}</p>}
          {isAnswered && prayer.answeredNote && (
            <div style={{ background: T.answeredBg, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark, fontWeight: 500, marginBottom: 4 }}>🙌 What happened</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: T.ink, lineHeight: 1.5 }}>{prayer.answeredNote}</div>
            </div>
          )}
          {!isAnswered && (() => {
            const verse = getVerseForPrayer(cats, verseIndex);
            return verse ? (
              <div style={{ borderTop: `1px solid #E0D9F5`, marginTop: 8, paddingTop: 10, marginBottom: 10 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: T.inkLight, lineHeight: 1.6, fontStyle: "italic" }}>"{verse.text}"</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#7C6FAB", fontWeight: 500 }}>{verse.ref}</div>
                  <button onClick={(e) => { e.stopPropagation(); setVerseIndex(v => v + 1); }} style={{ border: "none", background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#7C6FAB", cursor: "pointer", padding: 0 }}>another verse →</button>
                </div>
              </div>
            ) : null;
          })()}
          {!mine && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn small variant={isPraying ? "secondary" : "ghost"} onClick={() => onTogglePraying(prayer)}>🙏 {isPraying ? "Praying for this" : "I'm Praying"}</Btn>
              {onAddToList && !alreadyAdded && <Btn small variant="ghost" onClick={() => onAddToList(prayer)}>+ Add to my list</Btn>}
              {onAddToList && alreadyAdded && <Btn small variant="ghost" disabled>✓ Added</Btn>}
              {onDelete && <Btn small variant="ghost" onClick={() => onDelete(prayer)}>Remove from my list</Btn>}
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

function CelebrationScreen({ prayer, onComplete }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: T.cream, zIndex: 2000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, animation: "fadeIn 0.4s ease" }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-18px); } 100% { transform: translateY(0px); } }
        @keyframes fadeOut { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
        .celebrate-wrap { animation: fadeOut 2.8s ease forwards; }
        .bird-float { animation: float 2s ease-in-out infinite; }
      `}</style>
      <div className="celebrate-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div className="bird-float" style={{ fontSize: 72 }}>🕊️</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, color: T.sageDark, textAlign: "center", lineHeight: 1.2 }}>Prayer Answered!</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: T.ink, textAlign: "center", fontStyle: "italic", maxWidth: 300, lineHeight: 1.5 }}>"{prayer?.title}"</div>
        <div style={{ fontSize: 32, marginTop: 8 }}>🙌</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, textAlign: "center", marginTop: 4 }}>This has been added to your Testimonies.</div>
      </div>
    </div>
  );
}

function AddPrayerModal({ onClose, onAdd, editPrayer = null, friends = [], defaultPublic = true, circles = [] }) {
  const isEdit = !!editPrayer;
  const initialCats = editPrayer ? (Array.isArray(editPrayer.categories) ? editPrayer.categories : [editPrayer.categories]) : ["Family"];
  const [title, setTitle] = useState(editPrayer?.title || "");
  const [note, setNote] = useState(editPrayer?.note || "");
  const [selectedCats, setSelectedCats] = useState(initialCats);
  const [customCat, setCustomCat] = useState("");
  const [isPublic, setIsPublic] = useState(editPrayer ? editPrayer.isPublic : defaultPublic);
  const [selectedCircles, setSelectedCircles] = useState(editPrayer?.sharedToCircles || []);
  const toggleCircle = (id) => setSelectedCircles(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
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
    onAdd({ title: title.trim(), note, categories: finalCats, isPublic, prayerDate, sharedToCircles: selectedCircles });
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
        <label style={labelStyle}>Who can see this?</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {/* Only Me — exclusive option */}
          <button onClick={() => { setIsPublic(false); setSelectedCircles([]); }} style={{ display: "flex", alignItems: "center", gap: 10, border: `1.5px solid ${!isPublic && selectedCircles.length === 0 ? T.sageDark : T.parchment}`, background: !isPublic && selectedCircles.length === 0 ? T.sageLight : T.white, borderRadius: 12, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: T.ink }}>Only me</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight }}>Private — only you can see this</div>
            </div>
            {!isPublic && selectedCircles.length === 0 && <span style={{ marginLeft: "auto", color: T.sageDark, fontSize: 16 }}>✓</span>}
          </button>
          {/* Divider */}
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, padding: "2px 4px" }}>Or share with any combination:</div>
          {/* Friends — toggleable */}
          <button onClick={() => { setIsPublic(prev => !prev); if (selectedCircles.length === 0 && isPublic) setSelectedCircles([]); }} style={{ display: "flex", alignItems: "center", gap: 10, border: `1.5px solid ${isPublic ? T.sageDark : T.parchment}`, background: isPublic ? T.sageLight : T.white, borderRadius: 12, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 18 }}>👥</span>
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: T.ink }}>Friends</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight }}>Shared to your community feed</div>
            </div>
            {isPublic && <span style={{ marginLeft: "auto", color: T.sageDark, fontSize: 16 }}>✓</span>}
          </button>
          {/* Circles — each independently toggleable */}
          {circles.map(circle => {
            const on = selectedCircles.includes(circle.id);
            return (
              <button key={circle.id} onClick={() => { toggleCircle(circle.id); }} style={{ display: "flex", alignItems: "center", gap: 10, border: `1.5px solid ${on ? T.sageDark : T.parchment}`, background: on ? T.sageLight : T.white, borderRadius: 12, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 18 }}>{circle.emoji}</span>
                <div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: T.ink }}>{circle.name}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight }}>Shared to this circle</div>
                </div>
                {on && <span style={{ marginLeft: "auto", color: T.sageDark, fontSize: 16 }}>✓</span>}
              </button>
            );
          })}
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


function SortablePrayerCard({ id, title, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 8,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : "auto",
        opacity: isDragging ? 0.96 : 1,
        position: "relative",
      }}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${title || "prayer"}`}
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 34,
          minWidth: 34,
          marginBottom: 9,
          borderRadius: 14,
          border: `1px solid ${T.parchment}`,
          background: isDragging ? T.sageLight : T.white,
          color: isDragging ? T.sageDark : T.inkLight,
          cursor: isDragging ? "grabbing" : "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isDragging ? "0 6px 18px rgba(0,0,0,0.12)" : "0 2px 8px rgba(0,0,0,0.04)",
          touchAction: "none",
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ☰
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

function MyPrayers({ prayers, addPrayer, updatePrayer, deletePrayer, friends, firstName, defaultPublic, currentUser, circles = [] }) {
  const showToast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [answerTarget, setAnswerTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [catFilter, setCatFilter] = useState("All");
  const [sort, setSort] = useState("manual");
  const [showFilters, setShowFilters] = useState(false);
  const [activePrayMode, setActivePrayMode] = useState(false);
  const [coveredIds, setCoveredIds] = useState([]);
  const [celebrationPrayer, setCelebrationPrayer] = useState(null);
  const [prayingIds, setPrayingIds] = useState([]);
  const [reorderMode, setReorderMode] = useState(false);
  const [localPrayerOrder, setLocalPrayerOrder] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );
  const catsOf = (p) => Array.isArray(p.categories) ? p.categories : [p.categories].filter(Boolean);
  const active = prayers.filter(p => p.status === "active");
  const answered = prayers.filter(p => p.status === "answered");
  const allCats = ["All", ...Array.from(new Set(prayers.flatMap(catsOf).concat(Object.keys(CAT_COLORS))))];
  let shown = statusFilter === "active" ? active : answered;
  if (catFilter !== "All") shown = shown.filter(p => catsOf(p).includes(catFilter));
  const prayerTime = (p) => {
    const raw = p.createdAt || p.date;
    const t = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  };

  shown = [...shown].sort((a, b) => {
    if (sort === "manual") {
      const aOrder = a.sortOrder !== undefined && a.sortOrder !== null && Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : null;
      const bOrder = b.sortOrder !== undefined && b.sortOrder !== null && Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : null;

      if (aOrder !== null || bOrder !== null) {
        if (aOrder === null) return 1;
        if (bOrder === null) return -1;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }

      return prayerTime(b) - prayerTime(a);
    }

    if (sort === "newest") return new Date(b.date) - new Date(a.date);
    if (sort === "oldest" || sort === "longest") return new Date(a.date) - new Date(b.date);
    if (sort === "az") return a.title.localeCompare(b.title);
    return 0;
  });

  let mineOwn = shown.filter(p => !p.fromFriend);

  if (localPrayerOrder.length > 0) {
    const orderMap = new Map(localPrayerOrder.map((id, index) => [id, index]));
    mineOwn = [...mineOwn].sort((a, b) => {
      const aIndex = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return 0;
    });
  }

  const heldForOthers = shown.filter(p => p.fromFriend && p.status !== "answered" && p.status !== "removed");
  const coveredCount = coveredIds.filter(id => shown.find(p => p.id === id)).length;

  const handleAdd = async ({ title, note, categories, isPublic, prayerDate, sharedToCircles }) => {
    const myActivePrayers = prayers.filter(p => !p.fromFriend && p.status === "active");
    const maxSortOrder = Math.max(0, ...myActivePrayers.map(p => Number(p.sortOrder) || 0));

    await addPrayer({ title, note, categories, isPublic, prayerDate, sortOrder: maxSortOrder + 1000, sharedToCircles: sharedToCircles || [] });
    setShowAdd(false);
    showToast("Prayer added");
  };
  const handleSave = async ({ title, note, categories, isPublic, prayerDate, sharedToCircles }) => {
    const oldCircles = editTarget.sharedToCircles || [];
    const newCircles = sharedToCircles || [];
    // Remove from circles no longer selected
    for (const circleId of oldCircles) {
      if (!newCircles.includes(circleId)) {
        await updateDoc(doc(db, "circles", circleId), { prayerIds: arrayRemove(editTarget.id) });
      }
    }
    // Add to newly selected circles
    for (const circleId of newCircles) {
      if (!oldCircles.includes(circleId)) {
        await updateDoc(doc(db, "circles", circleId), { prayerIds: arrayUnion(editTarget.id) });
      }
    }
    await updatePrayer(editTarget.id, { title, note, categories, isPublic, prayerDate, sharedToCircles: newCircles });
    setEditTarget(null);
    showToast("Changes saved");
  };
  const handleDelete = async (id) => { await deletePrayer(id); showToast("Prayer removed"); };
  const getOriginalPrayerInfo = (prayer) => {
    if (prayer.originalOwnerId && prayer.originalPrayerId) {
      return { ownerId: prayer.originalOwnerId, prayerId: prayer.originalPrayerId };
    }

    if (!prayer.sourceKey) return { ownerId: prayer.userId, prayerId: prayer.id };

    const parts = prayer.sourceKey.split("-");
    const ownerId = parts.shift();
    const prayerId = parts.join("-");

    return { ownerId, prayerId };
  };

  const handleRemoveFromMyList = async (prayer) => {
    if (!currentUser?.uid) return;

    try {
      const { prayerId } = getOriginalPrayerInfo(prayer);

      // First mark the copied held prayer card as removed (not deleted, so it can be re-added later)
      await updateDoc(doc(db, "prayers", prayer.id), { status: "removed" });

      // Then best-effort remove the praying record.
      // If Firestore rules block this, the card is still removed from this user's list.
      try {
        const prayingSnap = await getDocs(query(
          collection(db, "prayingRecords"),
          where("prayerId", "==", prayerId),
          where("prayingUserId", "==", currentUser.uid)
        ));

        for (const record of prayingSnap.docs) {
          await deleteDoc(record.ref);
        }
      } catch (recordErr) {
        console.warn("Copied prayer removed, but prayingRecords cleanup failed:", recordErr);
      }

      showToast("Removed from your list");
    } catch (err) {
      console.error("Remove from my list failed:", err);
      showToast("Could not remove prayer");
    }
  };

  const handlePrayForHeldPrayer = async (prayer) => {
    if (!currentUser?.uid) return;
    if (prayingIds.includes(prayer.id)) return;

    const { ownerId, prayerId } = getOriginalPrayerInfo(prayer);
    if (!ownerId || !prayerId || ownerId === currentUser.uid) return;

    setPrayingIds(prev => [...prev, prayer.id]);

    await addDoc(collection(db, "prayingRecords"), {
      prayerOwnerId: ownerId,
      prayerTitle: prayer.title,
      prayingUserId: currentUser.uid,
      prayerName: currentUser.displayName || "A friend",
      prayerId,
      note: null,
      createdAt: new Date().toISOString(),
    });

    showToast("They'll know you're praying");
  };
  const handleToggleReorder = () => {
    if (reorderMode) {
      setReorderMode(false);
      return;
    }

    setStatusFilter("active");
    setSort("manual");
    setShowFilters(false);
    setActivePrayMode(false);
    setReorderMode(true);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = mineOwn.findIndex(p => p.id === active.id);
    const newIndex = mineOwn.findIndex(p => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(mineOwn, oldIndex, newIndex);
    setLocalPrayerOrder(reordered.map(p => p.id));

    try {
      const batch = writeBatch(db);

      reordered.forEach((prayer, index) => {
        batch.update(doc(db, "prayers", prayer.id), {
          sortOrder: (index + 1) * 1000,
        });
      });

      await batch.commit();
      showToast("Prayer order saved");
    } catch (err) {
      console.error("Prayer reorder failed:", err);
      setLocalPrayerOrder([]);
      showToast("Could not save order");
    }
  };

  const handleAnswer = async (note) => {
    const prayer = answerTarget;
    await updatePrayer(prayer.id, { status: "answered", answeredNote: note });
    setAnswerTarget(null);
    setCelebrationPrayer(prayer);
  };
  const toggleCovered = (id) => setCoveredIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const endSession = () => { setActivePrayMode(false); setCoveredIds([]); };

  const handleAddAllFriendPrayers = async (friendPrayers = []) => {
    const activePrayers = (friendPrayers || []).filter(
      (prayer) => !prayer.answered && !prayer.isAnswered && prayer.status !== "answered"
    );

    let added = 0;
    let skipped = 0;

    for (const prayer of activePrayers) {
      const sourceId =
        prayer.originalPrayerId ||
        prayer.sourcePrayerId ||
        prayer.friendPrayerId ||
        prayer.sourceId ||
        prayer.id;

      const alreadyHeld = (prayers || []).some((heldPrayer) => {
        const heldSourceId =
          heldPrayer.originalPrayerId ||
          heldPrayer.sourcePrayerId ||
          heldPrayer.friendPrayerId ||
          heldPrayer.sourceId ||
          heldPrayer.id;

        return heldSourceId === sourceId;
      });

      if (alreadyHeld) {
        skipped += 1;
        continue;
      }

      await onTogglePraying(prayer);
      added += 1;
    }

    if (added > 0 && skipped > 0) {
      alert(`Added ${added} new prayer${added === 1 ? "" : "s"}. ${skipped} already in your list.`);
    } else if (added > 0) {
      alert(`Added ${added} prayer${added === 1 ? "" : "s"} to Holding for Others.`);
    } else {
      alert("You're already holding all of these prayers.");
    }
  };


  const renderCard = (p, isMine = true) => (
    <PrayerCard
      key={p.id}
      prayer={p}
      mine={isMine}
      onAnswer={isMine ? setAnswerTarget : undefined}
      onDelete={isMine ? handleDelete : handleRemoveFromMyList}
      onEdit={isMine ? setEditTarget : undefined}
      myPrayingIds={isMine ? undefined : prayingIds}
      onTogglePraying={isMine ? undefined : handlePrayForHeldPrayer}
      activePrayMode={activePrayMode}
      covered={coveredIds.includes(p.id)}
      onToggleCovered={toggleCovered}
      friends={friends}
    />
  );
  return (
    <div style={tabContent}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={pageTitle}>{firstName ? `${firstName}'s Prayers` : "My Prayers"}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>{active.length} active · {answered.length} answered</div>
        </div>
        <Btn small onClick={() => setShowAdd(true)}>+ Add Prayer</Btn>
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
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>{active.length} active prayer{active.length !== 1 ? "s" : ""}</div>
        {!reorderMode && (
          <button onClick={() => setShowFilters(!showFilters)} style={{ marginLeft: "auto", border: `1px solid ${showFilters ? T.sageDark : T.parchment}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: showFilters ? T.sageLight : "transparent", color: showFilters ? T.sageDark : T.inkLight }}>⊞ Filter</button>
        )}
        {statusFilter === "active" && mineOwn.length > 1 && !activePrayMode && (
          <button
            onClick={handleToggleReorder}
            style={{
              marginLeft: reorderMode ? "auto" : 0,
              border: `1px solid ${reorderMode ? T.sageDark : T.parchment}`,
              borderRadius: 20,
              padding: reorderMode ? "7px 14px" : "6px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: reorderMode ? 500 : 400,
              background: reorderMode ? T.sageDark : "transparent",
              color: reorderMode ? T.white : T.inkLight,
              boxShadow: reorderMode ? "0 4px 12px rgba(92,128,104,0.18)" : "none",
            }}
          >
            {reorderMode ? "Save Order" : "Edit Order"}
          </button>
        )}
      </div>
      {reorderMode && (
        <div style={{ background: T.sageLight, border: `1px solid ${T.sage}`, borderRadius: 14, padding: "10px 14px", marginBottom: 12, fontFamily: "'DM Sans', sans-serif", color: T.sageDark }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Arrange your prayer rhythm</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Drag the handle beside each prayer into the order you want to pray through them.</div>
        </div>
      )}
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
      {reorderMode && statusFilter === "active" && mineOwn.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={mineOwn.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {mineOwn.map(p => (
              <SortablePrayerCard key={p.id} id={p.id} title={p.title}>
                {renderCard(p, true)}
              </SortablePrayerCard>
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        mineOwn.map(p => renderCard(p, true))
      )}
      {heldForOthers.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 4px 14px" }}>
            <div style={{ flex: 1, height: 1, background: T.parchment }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase" }}>Holding for Others</span>
            <div style={{ flex: 1, height: 1, background: T.parchment }} />
          </div>
          {heldForOthers.map(p => renderCard(p, false))}
        </>
      )}
      {showAdd && <AddPrayerModal onClose={() => setShowAdd(false)} onAdd={handleAdd} friends={friends} defaultPublic={defaultPublic} circles={circles} />}
      {editTarget && <AddPrayerModal onClose={() => setEditTarget(null)} onAdd={handleSave} editPrayer={editTarget} friends={friends} defaultPublic={defaultPublic} circles={circles} />}
      {answerTarget && <AnswerModal prayer={answerTarget} onClose={() => setAnswerTarget(null)} onConfirm={handleAnswer} />}
      {celebrationPrayer && <CelebrationScreen prayer={celebrationPrayer} onComplete={() => setCelebrationPrayer(null)} />}
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
      const term = search.trim().toLowerCase();
      const allUsersSnap = await getDocs(collection(db, "users"));
      const matches = allUsersSnap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => {
          const name = (u.displayName || "").toLowerCase();
          const email = (u.email || "").toLowerCase();
          return name.includes(term) || email.includes(term);
        })
        .filter(u => u.uid !== currentUser.uid)
        .slice(0, 5);
      if (matches.length === 0) { setSearchResult({ notFound: true }); }
      else { setSearchResult({ matches }); }
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

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>Find a Friend</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSearch(); }} />
        <Btn small variant="secondary" onClick={handleSearch} disabled={searching} style={{ flexShrink: 0 }}>{searching ? "..." : "Search"}</Btn>
      </div>

      {searchResult && (
        <Card style={{ marginBottom: 20 }}>
          {searchResult.notFound && (
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, marginBottom: 12 }}>No one found on LIFT with that name or email.</div>
              <Btn small variant="secondary" onClick={() => {
                const subject = encodeURIComponent("Join me on LIFT");
                const body = encodeURIComponent(`Hey! I've been using LIFT to track my prayers and I'd love to pray together. Join me here: https://amen-app-two.vercel.app`);
                window.open(`mailto:${search}?subject=${subject}&body=${body}`);
              }}>✉️ Send Invite</Btn>
            </div>
          )}
          {searchResult.error && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.dustyRose }}>Something went wrong. Try again.</div>}
          {searchResult.matches && searchResult.matches.map(u => {
            const alreadyFriend = friends.find(f => f.uid === u.uid);
            return (
              <div key={u.uid} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <Avatar initials={(u.displayName || "?").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={u.photoURL} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, color: T.ink }}>{u.displayName}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{maskEmail(u.email)}</div>
                </div>
                {alreadyFriend
                  ? <Badge label="Friend" color={T.sage} />
                  : <Btn small variant={requestSent ? "secondary" : "primary"} onClick={() => { onSendRequest(u); showToast("Friend request sent 🙏"); setSearch(""); setSearchResult(null); setRequestSent(false); }} disabled={requestSent}>{requestSent ? "Sent ✓" : "Connect"}</Btn>
                }
              </div>
            );
          })}
        </Card>
      )}

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



function Toggle({ val, onToggle }) {
  return (
    <div onClick={onToggle} style={{ width: 44, height: 24, borderRadius: 12, background: val ? T.sage : T.parchment, cursor: "pointer", position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 3, left: val ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: T.white, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
    </div>
  );
}

function TestimonyCard({ prayer }) {
  const [open, setOpen] = useState(false);
  const cats = Array.isArray(prayer.categories) ? prayer.categories : [prayer.categories].filter(Boolean);
  return (
    <Card style={{ borderLeft: `3px solid ${T.sage}`, marginBottom: 8 }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, cursor: "pointer" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 600, color: T.ink, marginBottom: 4 }}>{prayer.title}</div>
          {!open && prayer.answeredNote && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{prayer.answeredNote}</div>}
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, marginTop: 4 }}>{fmt(prayer.date)}</div>
        </div>
        <span style={{ color: T.inkLight, fontSize: 14, flexShrink: 0, marginTop: 2 }}>{open ? "▲" : "▾"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.parchment}` }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {cats.map(c => <CategoryPill key={c} cat={c} />)}
            <Badge label="✓ Answered" color={T.sage} />
          </div>
          {prayer.answeredNote ? (
            <div style={{ background: T.answeredBg, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark, fontWeight: 500, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>What happened</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: T.ink, lineHeight: 1.7 }}>{prayer.answeredNote}</div>
            </div>
          ) : (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, fontStyle: "italic" }}>No note was left for this testimony.</div>
          )}
        </div>
      )}
    </Card>
  );
}

function TestimonyModal({ prayer, onClose }) {
  const cats = Array.isArray(prayer.categories) ? prayer.categories : [prayer.categories].filter(Boolean);
  const fmtFull = (d) => new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }}>
      <div style={{ background: T.cream, borderRadius: 20, padding: "24px 20px 28px", width: "100%", maxWidth: 480, maxHeight: "calc(100vh - 80px)", overflowY: "auto", boxShadow: "0 12px 36px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>🙌</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink, lineHeight: 1.25, overflowWrap: "break-word" }}>{prayer.title}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginTop: 4 }}>Answered {fmtFull(prayer.date)}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: T.inkLight, padding: 4, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {cats.map(c => <CategoryPill key={c} cat={c} />)}
          <Badge label="✓ Answered" color={T.sage} />
        </div>
        {prayer.answeredNote ? (
          <div style={{ background: T.answeredBg, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark, fontWeight: 500, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>What happened</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: T.ink, lineHeight: 1.7 }}>{prayer.answeredNote}</div>
          </div>
        ) : (
          <div style={{ background: T.parchment, borderRadius: 14, padding: "16px 18px", textAlign: "center" }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, fontStyle: "italic" }}>No note was left for this testimony.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Profile({ prayers, user, defaultPublic, setDefaultPublic, onSignOut, currentUser, unreadCount, incomingRequests = [], onAcceptRequest, onDeclineRequest, friends = [], onSendRequest }) {
  const showToast = useToast();
  const [remindersOn, setRemindersOn] = useState(true);
  const [reminderTimes, setReminderTimes] = useState(["morning"]);
  const [notifyPrayed, setNotifyPrayed] = useState(true);
  const [notifyEncourage, setNotifyEncourage] = useState(true);
  const [stats, setStats] = useState({ daysPrayed: 0, streak: 0, totalPrayers: 0, answered: 0, prayedFor: 0, prayedByOthers: 0, encourageSent: 0, encourageReceived: 0, journalEntries: 0 });
  const [testimonies, setTestimonies] = useState([]);
  const [showTestimonies, setShowTestimonies] = useState(false);
  const [viewTestimony, setViewTestimony] = useState(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [friendPrompt, setFriendPrompt] = useState(null);
  const clearFriendReqNotif = async (req) => {
    try {
      const matches = notifs.filter(n => n.type === "friend_request" && (n.body || "").startsWith(req.fromName || "__no_name__"));
      for (const m of matches) await updateDoc(doc(db, "notifications", m.id), { read: true, dismissed: true });
    } catch (e) { /* non-fatal */ }
  };
  const handleAcceptRequest = async (req) => { await onAcceptRequest(req); await clearFriendReqNotif(req); };
  const handleDeclineRequest = async (req) => { await onDeclineRequest(req); await clearFriendReqNotif(req); };
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savedName, setSavedName] = useState(null);
  const [savingName, setSavingName] = useState(false);
  const displayedName = savedName || user?.displayName || "";

  const startEditName = () => {
    setNameDraft(displayedName && displayedName !== "My Account" ? displayedName : "");
    setEditingName(true);
  };

  const saveName = async () => {
    const newName = nameDraft.trim();
    if (!newName) { setEditingName(false); return; }
    setSavingName(true);
    try {
      const fbUser = auth.currentUser;
      if (fbUser) {
        await updateProfile(fbUser, { displayName: newName });
        await setDoc(doc(db, "users", fbUser.uid), { displayName: newName }, { merge: true });
      }
      setSavedName(newName);
      setEditingName(false);
      showToast("Name updated");
    } catch (err) {
      console.error("Update name error:", err);
      showToast("Couldn't update name — please try again");
    } finally {
      setSavingName(false);
    }
  };

  const reauthenticate = async (fbUser) => {
    const providerId = fbUser.providerData?.[0]?.providerId;
    const native = window.Capacitor?.isNativePlatform?.();
    const platform = window.Capacitor?.getPlatform?.();
    if (providerId === "google.com") {
      if (native) {
        await SocialLogin.initialize({ google: {
          webClientId: "1051687728666-dg08ekiuui1rpo24nhqapfleqpo9t2g4.apps.googleusercontent.com",
          iOSClientId: "1051687728666-qqp4ncsccjfpj71u4d3prkmhtqitpnf9.apps.googleusercontent.com",
          androidClientId: "1051687728666-t5f6922tukoop4gsenapcfup7a5a7vmn.apps.googleusercontent.com"
        }});
        const result = await SocialLogin.login({ provider: "google", options: { scopes: ["profile", "email"] } });
        const idToken = result?.result?.idToken;
        if (!idToken) throw new Error("No Google ID token for reauth");
        await reauthenticateWithCredential(fbUser, GoogleAuthProvider.credential(idToken));
      } else {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await reauthenticateWithPopup(fbUser, provider);
      }
    } else if (providerId === "apple.com") {
      if (native && platform === "ios") {
        await SocialLogin.initialize({ apple: {} });
        const result = await SocialLogin.login({ provider: "apple", options: { scopes: ["email", "name"] } });
        const idToken = result?.result?.idToken;
        if (!idToken) throw new Error("No Apple ID token for reauth");
        const { OAuthProvider } = await import("firebase/auth");
        await reauthenticateWithCredential(fbUser, new OAuthProvider("apple.com").credential({ idToken }));
      } else {
        const { OAuthProvider } = await import("firebase/auth");
        const provider = new OAuthProvider("apple.com");
        provider.addScope("email"); provider.addScope("name");
        await reauthenticateWithPopup(fbUser, provider);
      }
    } else {
      throw new Error("Unsupported provider for reauthentication");
    }
  };

  const deleteAllUserData = async (uid) => {
    const deleteByQuery = async (qRef, label) => {
      try {
        const snap = await getDocs(qRef);
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (err) {
        console.warn(`Could not delete ${label}:`, err);
      }
    };
    await deleteByQuery(query(collection(db, "prayers"), where("userId", "==", uid)), "prayers");
    await deleteByQuery(query(collection(db, "prayingRecords"), where("prayingUserId", "==", uid)), "prayingRecords(mine)");
    await deleteByQuery(query(collection(db, "prayingRecords"), where("prayerOwnerId", "==", uid)), "prayingRecords(forMe)");
    await deleteByQuery(query(collection(db, "notifications"), where("toUid", "==", uid)), "notifications");
    await deleteByQuery(query(collection(db, "dailyActivity"), where("userId", "==", uid)), "dailyActivity");
    await deleteByQuery(query(collection(db, "journalEntries"), where("userId", "==", uid)), "journalEntries");
    await deleteByQuery(query(collection(db, "friendRequests"), where("fromUid", "==", uid)), "friendRequests(from)");
    await deleteByQuery(query(collection(db, "friendRequests"), where("toUid", "==", uid)), "friendRequests(to)");
    try {
      const circlesSnap = await getDocs(query(collection(db, "circles"), where("members", "array-contains", uid)));
      for (const c of circlesSnap.docs) {
        const data = c.data();
        const md = { ...(data.memberDetails || {}) };
        delete md[uid];
        await updateDoc(c.ref, { members: arrayRemove(uid), memberDetails: md });
      }
    } catch (err) {
      console.warn("Could not remove from circles:", err);
    }
    try { await deleteDoc(doc(db, "userSettings", uid)); } catch (err) { console.warn("userSettings:", err); }
    try { await deleteDoc(doc(db, "users", uid)); } catch (err) { console.warn("users:", err); }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const fbUser = auth.currentUser;
      if (!fbUser) throw new Error("No authenticated user");
      const uid = fbUser.uid;
      await deleteAllUserData(uid);
      try {
        await deleteUser(fbUser);
      } catch (err) {
        if (err.code === "auth/requires-recent-login") {
          await reauthenticate(fbUser);
          await deleteUser(fbUser);
        } else {
          throw err;
        }
      }
      showToast("Your account has been deleted");
      // onAuthStateChanged routes back to the sign-in screen automatically
    } catch (err) {
      console.error("Delete account error:", err);
      showToast("Couldn't delete account — please try again");
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "notifications"), where("toUid", "==", currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => !n.dismissed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setNotifs(data);
    });
    return unsub;
  }, [currentUser]);

  const dismissNotif = async (id) => {
    await updateDoc(doc(db, "notifications", id), { read: true, dismissed: true });
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "userSettings", user.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.remindersOn !== undefined) setRemindersOn(d.remindersOn);
        if (d.reminderTimes) setReminderTimes(d.reminderTimes);
        else if (d.reminderTime) setReminderTimes([d.reminderTime]);
        if (d.notifyPrayed !== undefined) setNotifyPrayed(d.notifyPrayed);
        if (d.notifyEncourage !== undefined) setNotifyEncourage(d.notifyEncourage);
      }
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadStats = async () => {
      // Daily activity for days prayed + streak
      const actSnap = await getDocs(query(collection(db, "dailyActivity"), where("userId", "==", user.uid)));
      const dates = actSnap.docs.map(d => d.data().date).sort().reverse();
      const daysPrayed = dates.length;
      let streak = 0;
      const today = new Date().toISOString().split("T")[0];
      let check = today;
      for (const date of dates) {
        if (date === check) { streak++; const d = new Date(check); d.setDate(d.getDate() - 1); check = d.toISOString().split("T")[0]; }
        else break;
      }
      // Prayers prayed for others
      const prayedForSnap = await getDocs(query(collection(db, "prayingRecords"), where("prayingUserId", "==", user.uid)));
      const uniquePrayedFor = new Set(prayedForSnap.docs.map(d => d.data().prayerOwnerId)).size;
      // People who prayed for me
      const prayedBySnap = await getDocs(query(collection(db, "prayingRecords"), where("prayerOwnerId", "==", user.uid)));
      const uniquePrayedBy = new Set(prayedBySnap.docs.map(d => d.data().prayingUserId)).size;
      // Encouragement sent
      const encourageSent = prayedForSnap.docs.filter(d => d.data().note).length;
      // Encouragement received
      const encourageSnap = await getDocs(query(collection(db, "notifications"), where("toUid", "==", user.uid), where("type", "==", "encouragement")));
      // Journal entries
      const journalSnap = await getDocs(query(collection(db, "journalEntries"), where("userId", "==", user.uid)));
      setStats({
        daysPrayed,
        streak,
        totalPrayers: prayers.filter(p => !p.fromFriend).length,
        answered: prayers.filter(p => p.status === "answered").length,
        prayedFor: uniquePrayedFor,
        prayedByOthers: uniquePrayedBy,
        encourageSent,
        encourageReceived: encourageSnap.docs.length,
        journalEntries: journalSnap.docs.length,
      });
      setTestimonies(prayers.filter(p => p.status === "answered").sort((a, b) => new Date(b.date) - new Date(a.date)));
    };
    loadStats();
  }, [user, prayers]);

  const saveSettings = async (updates) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await setDoc(doc(db, "userSettings", user.uid), { ...updates, timezone }, { merge: true });
    showToast("Settings saved");
  };

  const REMINDER_TIMES = [
    { id: "morning", label: "Morning", sub: "8:00 AM" },
    { id: "midday", label: "Midday", sub: "12:00 PM" },
    { id: "evening", label: "Evening", sub: "8:00 PM" },
  ];

  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={pageTitle}>Profile</div>
        <button onClick={() => setShowNotifs(v => !v)} style={{ position: "relative", border: "none", background: "none", cursor: "pointer", padding: 8 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={showNotifs ? T.sageDark : T.inkLight} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {(notifs.filter(n => !n.read).length + incomingRequests.length) > 0 && (
            <div style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, borderRadius: "50%", background: T.dustyRose, color: T.white, fontSize: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {notifs.filter(n => !n.read).length + incomingRequests.length}
            </div>
          )}
        </button>
      </div>

      {showNotifs && (
        <div style={{ marginBottom: 24, background: T.parchment, borderRadius: 16, padding: "16px", border: `1px solid ${T.sage}` }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: T.ink, marginBottom: 12 }}>Notifications</div>
          {incomingRequests.map(req => (
            <div key={req.id} style={{ background: T.white, borderRadius: 12, padding: "12px 14px", marginBottom: 8, borderLeft: `4px solid ${T.sage}`, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink, marginBottom: 2 }}>👥 New friend request</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, lineHeight: 1.5 }}>{req.fromName || req.fromEmail || "Someone"} wants to pray with you on LIFT.</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, marginTop: 4 }}>{req.createdAt ? fmt(req.createdAt) : ""}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => handleAcceptRequest(req)} style={{ border: "none", background: T.sageDark, color: T.white, borderRadius: 10, padding: "6px 16px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: 500 }}>Accept</button>
                  <button onClick={() => handleDeclineRequest(req)} style={{ border: `1px solid ${T.parchment}`, background: "none", color: T.inkLight, borderRadius: 10, padding: "6px 16px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>Decline</button>
                </div>
              </div>
            </div>
          ))}
          {notifs.length === 0 && incomingRequests.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>No notifications yet</div>
            </div>
          )}
          {notifs.filter(n => n.type !== "friend_request").map(n => (
            <div key={n.id} style={{ background: T.white, borderRadius: 12, padding: "12px 14px", marginBottom: 8, borderLeft: `4px solid ${n.read ? T.parchment : T.sage}`, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink, marginBottom: 2 }}>{n.title}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, lineHeight: 1.5 }}>{n.body}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, marginTop: 4 }}>{n.createdAt ? fmt(n.createdAt) : ""}</div>
                {n.type === "circle_invite" && !n.accepted && !n.declined && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={async () => {
                      await updateDoc(doc(db, "circles", n.circleId), {
                        members: arrayUnion(currentUser.uid),
                        [`memberDetails.${currentUser.uid}`]: {
                          name: currentUser.displayName || "Me",
                          photoURL: currentUser.photoURL || null,
                          joinedAt: new Date().toISOString(),
                        }
                      });
                      await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(n.circleId) });
                      await updateDoc(doc(db, "notifications", n.id), { read: true, accepted: true, dismissed: false });
                      await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(n.circleId) });
                      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, accepted: true } : x));
                      if (n.fromUid && !friends.some(f => f.uid === n.fromUid)) setFriendPrompt({ uid: n.fromUid, name: n.fromName });
                    }} style={{ border: "none", background: T.sageDark, color: T.white, borderRadius: 10, padding: "6px 16px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: 500 }}>
                      Accept
                    </button>
                    <button onClick={async () => {
                      await updateDoc(doc(db, "notifications", n.id), { read: true, declined: true, dismissed: true });
                      setNotifs(prev => prev.filter(x => x.id !== n.id));
                    }} style={{ border: `1px solid ${T.parchment}`, background: "none", color: T.inkLight, borderRadius: 10, padding: "6px 16px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                      Decline
                    </button>
                  </div>
                )}
                {n.type === "circle_invite" && n.accepted && (
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.sageDark, marginTop: 6, fontWeight: 500 }}>✓ Joined {n.circleName}</div>
                )}
              </div>
              {!(n.type === "circle_invite" && !n.accepted && !n.declined) && (
                <button onClick={() => dismissNotif(n.id)} style={{ border: "none", background: "none", cursor: "pointer", color: T.inkLight, fontSize: 16, padding: "0 4px", flexShrink: 0 }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
      {friendPrompt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: T.cream, borderRadius: 16, padding: "24px 20px", width: "100%", maxWidth: 340 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: T.ink, marginBottom: 8 }}>Add as a friend?</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, lineHeight: 1.5, marginBottom: 20 }}>You're now praying together in a circle. Send {friendPrompt.name || "them"} a friend request too?</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={async () => { const p = friendPrompt; setFriendPrompt(null); try { await onSendRequest({ uid: p.uid, displayName: p.name }); showToast("Friend request sent 🙏"); } catch (e) { showToast("Couldn't send request"); } }} style={{ flex: 1, border: "none", background: T.sageDark, color: T.white, borderRadius: 12, padding: "10px", fontSize: 14, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>Yes, add friend</button>
              <button onClick={() => setFriendPrompt(null)} style={{ flex: 1, border: `1px solid ${T.parchment}`, background: "none", color: T.inkLight, borderRadius: 12, padding: "10px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>Not now</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Avatar initials={(displayedName || "Me").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={user?.photoURL} size={60} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                maxLength={40}
                placeholder="Your name"
                style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink, border: "1px solid " + T.sageDark, borderRadius: 8, padding: "2px 8px", background: "#fff", outline: "none", width: "100%", maxWidth: 190 }}
              />
              <button onClick={saveName} disabled={savingName} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: T.sageDark, padding: 2, flexShrink: 0 }}>✓</button>
              <button onClick={() => setEditingName(false)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: T.inkLight, padding: 2, flexShrink: 0 }}>✕</button>
            </div>
          ) : (
            <div onClick={startEditName} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink }}>{displayedName || "Tap to add your name"}</div>
              <span style={{ fontSize: 13, color: T.inkLight }}>✎</span>
            </div>
          )}
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>{user?.email || ""}</div>
        </div>
      </div>

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>General</div>
      <Card style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>Send Feedback</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>Help us improve LIFT</div>
        </div>
        <Btn small variant="secondary" onClick={() => window.open('mailto:logitfortransformation@gmail.com?subject=LIFT Feedback')}>✉️ Feedback</Btn>
      </Card>

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>Prayer Reminders</div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: remindersOn ? 16 : 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>Daily reminder</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>A nudge to check in and pray</div>
          </div>
          <Toggle val={remindersOn} onToggle={() => { const v = !remindersOn; setRemindersOn(v); saveSettings({ remindersOn: v }); }} />
        </div>
        {remindersOn && (
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginBottom: 8 }}>Remind me in the</div>
            <div style={{ display: "flex", gap: 8 }}>
              {REMINDER_TIMES.map(t => {
                const selected = reminderTimes.includes(t.id);
                return (
                <button key={t.id} onClick={() => {
                  const updated = selected ? reminderTimes.filter(x => x !== t.id) : [...reminderTimes, t.id];
                  const final = updated.length ? updated : [t.id];
                  setReminderTimes(final);
                  saveSettings({ reminderTimes: final });
                }} style={{ flex: 1, border: `1.5px solid ${selected ? T.sageDark : T.parchment}`, background: selected ? T.sageLight : "transparent", borderRadius: 12, padding: "8px 4px", cursor: "pointer", textAlign: "center" }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: selected ? 500 : 400, color: selected ? T.sageDark : T.ink }}>{t.label}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight }}>{t.sub}</div>
                </button>);
              })}
            </div>
          </div>
        )}
      </Card>

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>Notification Types</div>
      {[
        { label: "Someone prayed for you", sub: "Know when a friend lifts you up", val: notifyPrayed, onToggle: () => { const v = !notifyPrayed; setNotifyPrayed(v); saveSettings({ notifyPrayed: v }); } },
        { label: "Encouragement notes", sub: "Messages from friends who are praying", val: notifyEncourage, onToggle: () => { const v = !notifyEncourage; setNotifyEncourage(v); saveSettings({ notifyEncourage: v }); } },
      ].map(({ label, sub, val, onToggle }) => (
        <Card key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>{label}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{sub}</div>
          </div>
          <Toggle val={val} onToggle={onToggle} />
        </Card>
      ))}
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>Your Prayer Life</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        {[
          { label: "Days Prayed", val: stats.daysPrayed },
          { label: "Current Streak", val: stats.streak },
          { label: "Prayers Added", val: stats.totalPrayers },
          { label: "People Prayed For", val: stats.prayedFor },
          { label: "Prayed For You", val: stats.prayedByOthers },
          { label: "Encouragements Sent", val: stats.encourageSent },
          { label: "Encouragements Received", val: stats.encourageReceived },
          { label: "Journal Entries", val: stats.journalEntries },
        ].map(({ label, val }) => (
          <Card key={label} style={{ padding: "14px 14px", marginBottom: 0 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: T.sageDark }}>{val}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, marginTop: 2 }}>{label}</div>
          </Card>
        ))}
      </div>

      <button onClick={() => setShowTestimonies(!showTestimonies)} style={{ width: "100%", border: "none", background: T.answeredBg, borderRadius: 14, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🙌</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.sageDark }}>Testimonies</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{stats.answered} answered prayer{stats.answered !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <span style={{ color: T.sageDark, fontSize: 14 }}>{showTestimonies ? "▲" : "▾"}</span>
      </button>

      {showTestimonies && (
        <div style={{ marginBottom: 16 }}>
          {testimonies.length === 0 && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, padding: "12px 0", fontStyle: "italic", textAlign: "center" }}>No answered prayers yet — keep praying!</div>
          )}
          {testimonies.map(p => (
            <TestimonyCard key={p.id} prayer={p} />
          ))}
        </div>
      )}

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>Account</div>
      <button onClick={() => setShowPrivacyModal(true)} style={{ width: "100%", border: "none", background: T.white, borderRadius: 16, padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, marginBottom: 16, textAlign: "left", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>Privacy & Permissions</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>Prayer privacy and account options</div>
        </div>
        <span style={{ color: T.inkLight, fontSize: 18 }}>›</span>
      </button>
      <Btn variant="ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8, color: T.dustyRose }} onClick={onSignOut}>Sign Out</Btn>
      {viewTestimony && <TestimonyModal prayer={viewTestimony} onClose={() => setViewTestimony(null)} />}
      {showPrivacyModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,24,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1000 }} onClick={() => setShowPrivacyModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.cream, borderRadius: 20, padding: "24px", maxWidth: 380, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: T.ink }}>Privacy & Permissions</div>
              <button onClick={() => setShowPrivacyModal(false)} style={{ border: "none", background: "none", cursor: "pointer", color: T.inkLight, fontSize: 18, padding: 4 }}>✕</button>
            </div>
            <Card style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>Default to private</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>New prayers start private</div>
              </div>
              <Toggle val={!defaultPublic} onToggle={() => setDefaultPublic(!defaultPublic)} />
            </Card>
            <Card style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>Delete Account</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>Permanently delete your account and all your data</div>
              </div>
              <Btn small variant="secondary" style={{ color: T.dustyRose, borderColor: T.dustyRose }} onClick={() => { setShowPrivacyModal(false); setShowDeleteModal(true); }}>Delete</Btn>
            </Card>
          </div>
        </div>
      )}
      {showDeleteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,24,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1000 }} onClick={() => !deleting && setShowDeleteModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.white, borderRadius: 20, padding: "28px 24px", maxWidth: 360, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: T.ink, marginBottom: 10 }}>Delete your account?</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, lineHeight: 1.6, marginBottom: 20 }}>This permanently deletes your account and all associated data — your prayers, journal entries, prayer history, reminders, and circle memberships. This cannot be undone.</div>
            <button disabled={deleting} onClick={handleDeleteAccount} style={{ width: "100%", border: "none", background: T.dustyRose, color: T.white, borderRadius: 12, padding: "13px", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.7 : 1, marginBottom: 10 }}>{deleting ? "Deleting…" : "Delete My Account"}</button>
            <button disabled={deleting} onClick={() => setShowDeleteModal(false)} style={{ width: "100%", border: `1px solid ${T.parchment}`, background: "none", color: T.ink, borderRadius: 12, padding: "13px", fontFamily: "'DM Sans', sans-serif", fontSize: 15, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SignIn() {
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState(null);

  const isNative = () => window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  const isIOS = () => isNative() && window.Capacitor.getPlatform() === 'ios';
  const isAndroid = () => isNative() && window.Capacitor.getPlatform() === 'android';

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isNative()) {
        // Native iOS and Android both use SocialLogin
        await SocialLogin.initialize({
          google: {
            webClientId: "1051687728666-dg08ekiuui1rpo24nhqapfleqpo9t2g4.apps.googleusercontent.com",
            iOSClientId: "1051687728666-qqp4ncsccjfpj71u4d3prkmhtqitpnf9.apps.googleusercontent.com",
            androidClientId: "1051687728666-t5f6922tukoop4gsenapcfup7a5a7vmn.apps.googleusercontent.com"
          }
        });
        const result = await SocialLogin.login({ provider: "google", options: { scopes: ["profile", "email"] } });
        const idToken = result?.result?.idToken;
        if (!idToken) throw new Error("No ID token returned");
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } else {
        // Web fallback
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithPopup(auth, provider);
      }
    } catch (e) {
      console.error("Google sign in error:", e);
      setError(`Sign in failed: ${e.code || e.message || JSON.stringify(e)}`);
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setAppleLoading(true);
    setError(null);
    try {
      if (isIOS()) {
        // Native Apple Sign In on iOS
        await SocialLogin.initialize({ apple: {} });
        const result = await SocialLogin.login({
          provider: "apple",
          options: { scopes: ["email", "name"] }
        });
        const idToken = result?.result?.idToken;
        if (!idToken) throw new Error("No Apple identity token returned");
        const { OAuthProvider } = await import("firebase/auth");
        const provider = new OAuthProvider("apple.com");
        const credential = provider.credential({ idToken });
        const userCredential = await signInWithCredential(auth, credential);
        // Sync Apple profile to Firestore
        const firebaseUser = userCredential.user;
        const appleProfile = result?.result;
        await setDoc(
          doc(db, "users", firebaseUser.uid),
          {
            uid: firebaseUser.uid,
            displayName: appleProfile?.profile?.givenName
              ? `${appleProfile.profile.givenName} ${appleProfile.profile.familyName || ""}`.trim()
              : safeDisplayName(firebaseUser.displayName, firebaseUser.email),
            email: firebaseUser.email || appleProfile?.email || "",
            photoURL: firebaseUser.photoURL || "",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        // Web Apple Sign In (fallback for non-iOS)
        const { OAuthProvider } = await import("firebase/auth");
        const provider = new OAuthProvider("apple.com");
        provider.addScope("email");
        provider.addScope("name");
        const userCredential = await signInWithPopup(auth, provider);
        const firebaseUser = userCredential.user;
        await setDoc(
          doc(db, "users", firebaseUser.uid),
          {
            uid: firebaseUser.uid,
            displayName: safeDisplayName(firebaseUser.displayName, firebaseUser.email),
            email: firebaseUser.email || "",
            photoURL: firebaseUser.photoURL || "",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (e) {
      console.error("Apple sign in error:", e);
      setError(`Apple sign in failed: ${e.code || e.message || JSON.stringify(e)}`);
      setAppleLoading(false);
    }
  };

  const anyLoading = loading || appleLoading;

  return (
    <div style={{ minHeight: "100vh", background: T.cream, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <img src="/lift-logo.png" alt="LIFT" style={{ width: 160, height: 160, marginBottom: 8, objectFit: "contain" }} />
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.sageDark, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 500, marginBottom: 24 }}>Log it for Transformation</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: T.inkLight, textAlign: "center", maxWidth: 270, lineHeight: 1.6, marginBottom: 32 }}>A quiet place to bring your prayers, hold others up, and remember how God moves.</div>
      {error && <div style={{ color: T.dustyRose, fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>{error}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 280 }}>
        {!isAndroid() && <button onClick={handleApple} disabled={anyLoading} style={{ background: "#000", border: "none", borderRadius: 14, padding: "14px 32px", cursor: anyLoading ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 1px 6px rgba(0,0,0,0.15)", opacity: anyLoading ? 0.6 : 1, width: "100%" }}>
          <span style={{ fontSize: 20, lineHeight: 1, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", marginTop: -2 }}>&#xF8FF;</span>
          {appleLoading ? "Signing in..." : "Continue with Apple"}
        </button>}
        <button onClick={handleGoogle} disabled={anyLoading} style={{ background: T.white, border: `1.5px solid ${T.parchment}`, borderRadius: 14, padding: "14px 32px", cursor: anyLoading ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", opacity: anyLoading ? 0.6 : 1, width: "100%" }}>
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z"/></svg>
          {loading ? "Signing in..." : "Continue with Google"}
        </button>
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginTop: 32, textAlign: "center" }}>Your prayers stay private unless you choose to share them.</div>
    </div>
  );
}

function EncouragementModal({ prayer, prayerName, onSend, onSkip }) {
  const [note, setNote] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: T.cream, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🙏</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink, marginBottom: 4, textAlign: "center" }}>Praying for {prayerName}</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, textAlign: "center", marginBottom: 20 }}>"{prayer.title}"</div>
        <label style={labelStyle}>Add an encouragement note (optional)</label>
        <textarea style={{ ...inputStyle, height: 80, resize: "none" }} placeholder="Let them know you're with them..." value={note} onChange={e => setNote(e.target.value)} />
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn style={{ flex: 1 }} variant="secondary" onClick={() => onSend(note.trim() || null)}>{note.trim() ? "Send & Pray" : "Start Praying"}</Btn>
          <Btn variant="ghost" onClick={onSkip}>Skip</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Friend Menu (defriend, block, report) ─────────────────────────────────────
function FriendMenu({ friend, currentUser, showToast }) {
  const [open, setOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [confirming, setConfirming] = useState(null);

  const REPORT_REASONS = [
    "Inappropriate content",
    "Harassment or bullying",
    "Spam",
    "Fake account",
    "Other",
  ];

  const defriend = async () => {
    try {
      const [snap1, snap2] = await Promise.all([
        getDocs(query(collection(db, "friendRequests"), where("fromUid", "==", currentUser.uid), where("toUid", "==", friend.uid), where("status", "==", "accepted"))),
        getDocs(query(collection(db, "friendRequests"), where("fromUid", "==", friend.uid), where("toUid", "==", currentUser.uid), where("status", "==", "accepted"))),
      ]);
      const all = [...snap1.docs, ...snap2.docs];
      for (const d of all) await updateDoc(doc(db, "friendRequests", d.id), { status: "removed" });
      showToast("Friend removed");
      setOpen(false);
    } catch (err) {
      showToast("Could not remove friend");
    }
  };

  const block = async () => {
    try {
      await addDoc(collection(db, "blocks"), {
        blockedBy: currentUser.uid,
        blockedUid: friend.uid,
        createdAt: new Date().toISOString(),
      });
      await defriend();
      showToast("User blocked");
      setOpen(false);
    } catch (err) {
      showToast("Could not block user");
    }
  };

  const report = async () => {
    if (!reportReason) return;
    try {
      await addDoc(collection(db, "reports"), {
        reportedBy: currentUser.uid,
        reportedUid: friend.uid,
        reportedName: friend.displayName || "Unknown",
        reason: reportReason,
        createdAt: new Date().toISOString(),
      });
      showToast("Report submitted. Thank you.");
      setShowReport(false);
      setOpen(false);
    } catch (err) {
      showToast("Could not submit report");
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} style={{ border: "none", background: "none", cursor: "pointer", color: T.inkLight, fontSize: 20, padding: "4px 6px", lineHeight: 1 }}>⋯</button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 28, background: T.white, borderRadius: 12, border: `1px solid ${T.parchment}`, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 500, minWidth: 160, overflow: "hidden" }}>
          {confirming === "defriend" ? (
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.ink, marginBottom: 10 }}>Remove {friend.displayName?.split(" ")[0]}?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={defriend} style={{ flex: 1, border: "none", background: "#c0392b", color: T.white, borderRadius: 8, padding: "6px 0", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>Remove</button>
                <button onClick={() => setConfirming(null)} style={{ flex: 1, border: `1px solid ${T.parchment}`, background: "none", borderRadius: 8, padding: "6px 0", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", color: T.inkLight }}>Cancel</button>
              </div>
            </div>
          ) : confirming === "block" ? (
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.ink, marginBottom: 10 }}>Block {friend.displayName?.split(" ")[0]}? They won't be able to see your prayers or contact you.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={block} style={{ flex: 1, border: "none", background: "#c0392b", color: T.white, borderRadius: 8, padding: "6px 0", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>Block</button>
                <button onClick={() => setConfirming(null)} style={{ flex: 1, border: `1px solid ${T.parchment}`, background: "none", borderRadius: 8, padding: "6px 0", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", color: T.inkLight }}>Cancel</button>
              </div>
            </div>
          ) : showReport ? (
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: T.ink, marginBottom: 10 }}>Report reason</div>
              {REPORT_REASONS.map(r => (
                <div key={r} onClick={() => setReportReason(r)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", cursor: "pointer", borderBottom: `1px solid ${T.parchment}` }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${reportReason === r ? T.sageDark : T.parchment}`, background: reportReason === r ? T.sageDark : "transparent", flexShrink: 0 }} />
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.ink }}>{r}</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={report} disabled={!reportReason} style={{ flex: 1, border: "none", background: reportReason ? "#c0392b" : T.parchment, color: T.white, borderRadius: 8, padding: "6px 0", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: reportReason ? "pointer" : "default" }}>Submit</button>
                <button onClick={() => { setShowReport(false); setReportReason(""); }} style={{ flex: 1, border: `1px solid ${T.parchment}`, background: "none", borderRadius: 8, padding: "6px 0", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", color: T.inkLight }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <button onClick={() => setConfirming("defriend")} style={{ width: "100%", border: "none", background: "none", padding: "11px 14px", textAlign: "left", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.ink, cursor: "pointer", display: "block" }}>Remove friend</button>
              <button onClick={() => setConfirming("block")} style={{ width: "100%", border: "none", background: "none", padding: "11px 14px", textAlign: "left", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#c0392b", cursor: "pointer", borderTop: `1px solid ${T.parchment}`, display: "block" }}>Block</button>
              <button onClick={() => setShowReport(true)} style={{ width: "100%", border: "none", background: "none", padding: "11px 14px", textAlign: "left", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#c0392b", cursor: "pointer", borderTop: `1px solid ${T.parchment}`, display: "block" }}>Report</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Community({ currentUser, friends, myPrayers, addPrayer, incomingRequests, onAccept, onDecline, onSendRequest }) {
  const showToast = useToast();
  const [prayingIds, setPrayingIds] = useState([]);
  const [friendsOpen, setFriendsOpen] = useState(false);


  const addAllFriendPrayersFromCommunity = async (friend) => {
    const friendPrayers = (friend?.prayers || []).filter(
      (prayer) =>
        !prayer.answered &&
        !prayer.isAnswered &&
        prayer.status !== "answered"
    );

    if (!friendPrayers.length) {
      alert("No active prayers to add.");
      return;
    }

    const heldSourceIds = new Set(
      (myPrayers || [])
        .filter(prayer => prayer.status === "active")
        .map(
          (prayer) =>
            prayer.sourcePrayerId ||
            prayer.originalPrayerId ||
            prayer.friendPrayerId ||
            prayer.sourceId
        )
        .filter(Boolean)
    );

    let added = 0;
    let skipped = 0;

    for (const prayer of friendPrayers) {
      const sourceId =
        prayer.sourcePrayerId ||
        prayer.originalPrayerId ||
        prayer.friendPrayerId ||
        prayer.sourceId ||
        prayer.id;

      if (!sourceId || heldSourceIds.has(sourceId)) {
        skipped += 1;
        continue;
      }

      // Check if a removed copy exists — reactivate it instead of creating a new one
      const removedCopy = (myPrayers || []).find(p =>
        (p.originalPrayerId === sourceId || p.sourcePrayerId === sourceId || p.friendPrayerId === sourceId) &&
        p.status === "removed"
      );
      if (removedCopy) {
        await updateDoc(doc(db, "prayers", removedCopy.id), { status: "active" });
      } else {
        await addPrayer({
          title: prayer.title || "",
          note: prayer.note || "",
          category: prayer.category || "General",
          categories: prayer.categories || (prayer.category ? [prayer.category] : []),
          date: prayer.date || "",
          dateTag: prayer.dateTag || "",
          shared: false,
          isPrivate: true,
          isPublic: false,
          held: true,
          isHeldPrayer: true,
          readOnly: true,
          fromFriend: true,
          ownerId: friend.uid || prayer.userId || null,
          heldForUserId: friend.uid || prayer.userId || null,
          ownerName: friend.displayName || prayer.ownerName || "Friend",
          sourcePrayerId: sourceId,
          originalPrayerId: sourceId,
          friendPrayerId: sourceId,
        });
      }

      heldSourceIds.add(sourceId);
      added += 1;
    }

    if (added > 0 && skipped > 0) {
      alert(`Added ${added} new prayer${added === 1 ? "" : "s"}. ${skipped} already in your list.`);
    } else if (added > 0) {
      alert(`Added ${added} prayer${added === 1 ? "" : "s"} to Holding for Others.`);
    } else {
      alert("You're already holding all of these prayers.");
    }
  };

  const [encourageTarget, setEncourageTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const submitPraying = async (prayer, note) => {
    const id = prayer.id;
    setPrayingIds(prev => [...prev, id]);
    setEncourageTarget(null);
    showToast("They'll know you're praying 🙏");
    await addDoc(collection(db, "prayingRecords"), {
      prayerOwnerId: prayer.userId,
      prayerTitle: prayer.title,
      prayingUserId: currentUser.uid,
      prayerName: currentUser.displayName || "A friend",
      prayerId: id,
      note: note || null,
      createdAt: new Date().toISOString(),
    });
    if (note) {
      await addDoc(collection(db, "notifications"), {
        toUid: prayer.userId,
        title: "💬 Encouragement from " + (currentUser.displayName || "a friend"),
        body: note,
        type: "encouragement",
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    // Auto-add to Holding for Others when tapping "I'm Praying"
    const key = `${prayer.userId}-${prayer.id}`;
    const currentAddedKeys = myPrayers.filter(p => p.fromFriend).map(p => p.sourceKey);

    if (!currentAddedKeys.includes(key)) {
      const friendMatch = friends.find(f => f.uid === prayer.userId);

      await addPrayer({
        ...prayer,
        sourceKey: key,
        originalOwnerId: prayer.userId,
        originalPrayerId: prayer.id,
        isPublic: false,
        status: "active",
        date: today(),
        answeredNote: null,
        praying: 0,
        fromFriend: true,
        ownerName: friendMatch?.displayName || prayer.ownerName || "Friend",
      });
    }
  };

  const togglePraying = (prayer) => {
    const id = prayer.id;
    if (prayingIds.includes(id)) return;
    setEncourageTarget(prayer);
  };

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setRequestSent(false);
    try {
      const term = search.trim().toLowerCase();
      const allUsersSnap = await getDocs(collection(db, "users"));
      const matches = allUsersSnap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => {
          const name = (u.displayName || "").toLowerCase();
          const email = (u.email || "").toLowerCase();
          return name.includes(term) || email.includes(term);
        })
        .filter(u => u.uid !== currentUser.uid)
        .slice(0, 5);
      if (matches.length === 0) { setSearchResult({ notFound: true }); }
      else { setSearchResult({ matches }); }
    } catch (e) { setSearchResult({ error: true }); }
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
      <div style={{ marginBottom: 16 }}>
        <div style={pageTitle}>Community</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>Stand with your people</div>
      </div>

      {/* Collapsible Friends Section */}
      <div style={{ background: T.white, borderRadius: 16, marginBottom: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <button onClick={() => setFriendsOpen(!friendsOpen)} style={{ width: "100%", border: "none", background: "none", padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>👥</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>Friends ({friends.length})</span>
            {incomingRequests.length > 0 && <span style={{ background: T.dustyRose, color: T.white, borderRadius: 20, padding: "1px 8px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>{incomingRequests.length} pending</span>}
          </div>
          <span style={{ color: T.inkLight, fontSize: 14 }}>{friendsOpen ? "▲" : "▾"}</span>
        </button>

        {friendsOpen && (
          <div style={{ padding: "0 18px 18px" }}>
            {incomingRequests.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.dustyRose, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>Pending Requests</div>
                {incomingRequests.map(req => (
                  <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <Avatar initials={(req.fromName || "?").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={req.fromPhoto} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>{req.fromName || "Someone"}</div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{req.fromEmail}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn small variant="secondary" onClick={() => onAccept(req)}>Accept</Btn>
                      <Btn small variant="ghost" onClick={() => onDecline(req)}>Decline</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>Add a Friend</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSearch(); }} />
              <Btn small variant="secondary" onClick={handleSearch} disabled={searching} style={{ flexShrink: 0 }}>{searching ? "..." : "Search"}</Btn>
            </div>

            {searchResult && (
              <div style={{ background: T.cream, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                {searchResult.notFound && (
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, marginBottom: 10 }}>No one found on LIFT with that name or email.</div>
                    <Btn small variant="secondary" onClick={() => {
                      const subject = encodeURIComponent("Join me on LIFT");
                      const body = encodeURIComponent(`Hey! I've been using LIFT to track my prayers and I'd love to pray together. Join me here: https://amen-app-two.vercel.app`);
                      window.open(`mailto:${search}?subject=${subject}&body=${body}`);
                    }}>✉️ Send Invite</Btn>
                  </div>
                )}
                {searchResult.error && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.dustyRose }}>Something went wrong. Try again.</div>}
                {searchResult.matches && searchResult.matches.map(u => {
                  const alreadyFriend = friends.find(f => f.uid === u.uid);
                  return (
                    <div key={u.uid} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <Avatar initials={(u.displayName || "?").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={u.photoURL} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>{u.displayName}</div>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{maskEmail(u.email)}</div>
                      </div>
                      {alreadyFriend
                        ? <Badge label="Friend" color={T.sage} />
                        : <Btn small variant="primary" onClick={() => { onSendRequest(u); showToast("Friend request sent 🙏"); setSearch(""); setSearchResult(null); setRequestSent(false); }}>Connect</Btn>
                      }
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>Connected</div>
            {friends.length === 0 && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, fontStyle: "italic" }}>No friends yet. Search above to connect.</div>}
            {friends.map(f => (
              <div key={f.uid} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Avatar initials={(f.displayName || "?").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={f.photoURL} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink }}>{f.displayName}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{f.email}</div>
                </div>
                <Badge label="Friend" color={T.sage} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Friends Prayer Feed */}
      {friends.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🕊️</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: T.ink, marginBottom: 8 }}>No friends yet</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, lineHeight: 1.6 }}>Connect with friends above to see their prayer requests here.</div>
        </div>
      )}
      {friends.map(friend => (
        <div key={friend.uid} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Avatar initials={(friend.displayName || "?").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={friend.photoURL} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, color: T.ink }}>{friend.displayName || "Friend"}</div>
                {(friend.prayers?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => addAllFriendPrayersFromCommunity(friend)}
                    style={{
                      border: `1px solid ${T.sageDark}`,
                      background: "transparent",
                      color: T.sageDark,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 20,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    + Add All
                  </button>
                )}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{friend.prayers?.length || 0} shared prayer{(friend.prayers?.length || 0) !== 1 ? "s" : ""}</div>
            </div>
            <FriendMenu friend={friend} currentUser={currentUser} showToast={showToast} />
          </div>
          {(friend.prayers || []).map(p => {
            const sourceId = p.originalPrayerId || p.sourcePrayerId || p.friendPrayerId || p.id;
            const alreadyAdded = (myPrayers || []).some(mp =>
              (mp.originalPrayerId === sourceId || mp.sourcePrayerId === sourceId || mp.friendPrayerId === sourceId) &&
              mp.status === "active"
            );
            return (
              <PrayerCard
                key={p.id}
                prayer={p}
                mine={false}
                myPrayingIds={prayingIds}
                onTogglePraying={() => togglePraying(p)}
                alreadyAdded={alreadyAdded}
                onAddToList={async () => {
                  const removedCopy = (myPrayers || []).find(mp =>
                    (mp.originalPrayerId === sourceId || mp.sourcePrayerId === sourceId || mp.friendPrayerId === sourceId) &&
                    mp.status === "removed"
                  );
                  if (removedCopy) {
                    await updateDoc(doc(db, "prayers", removedCopy.id), { status: "active" });
                  } else {
                    await addPrayer({
                      title: p.title || "",
                      note: p.note || "",
                      categories: p.categories || [],
                      shared: false,
                      isPrivate: true,
                      isPublic: false,
                      held: true,
                      isHeldPrayer: true,
                      readOnly: true,
                      fromFriend: true,
                      ownerId: friend.uid || p.userId || null,
                      heldForUserId: friend.uid || p.userId || null,
                      ownerName: friend.displayName || p.ownerName || "Friend",
                      sourcePrayerId: sourceId,
                      originalPrayerId: sourceId,
                      friendPrayerId: sourceId,
                    });
                  }
                  showToast("Added to Holding for Others");
                }}
              />
            );
          })}
          {(!friend.prayers || friend.prayers.length === 0) && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, padding: "10px 0", fontStyle: "italic" }}>No public prayers shared yet.</div>
          )}
        </div>
      ))}
      {encourageTarget && (
        <EncouragementModal
          prayer={encourageTarget}
          prayerName={friends.find(f => f.uid === encourageTarget.userId)?.displayName || "them"}
          onSend={(note) => submitPraying(encourageTarget, note)}
          onSkip={() => { submitPraying(encourageTarget, null); }}
        />
      )}
    </div>
  );
}



// ── Scripture Library ─────────────────────────────────────────────────────────
const VERSES = {
  "Family": [
    { text: "Children are a heritage from the Lord, offspring a reward from him.", ref: "Psalm 127:3" },
    { text: "Honor your father and your mother, so that you may live long in the land.", ref: "Exodus 20:12" },
    { text: "As for me and my household, we will serve the Lord.", ref: "Joshua 24:15" },
    { text: "Love is patient, love is kind. It does not envy, it does not boast.", ref: "1 Corinthians 13:4" },
    { text: "Bear with each other and forgive one another if any of you has a grievance against someone.", ref: "Colossians 3:13" },
    { text: "A friend loves at all times, and a brother is born for a time of adversity.", ref: "Proverbs 17:17" },
    { text: "Start children off on the way they should go, and even when they are old they will not turn from it.", ref: "Proverbs 22:6" },
    { text: "How good and pleasant it is when God's people live together in unity.", ref: "Psalm 133:1" },
    { text: "Above all, love each other deeply, because love covers over a multitude of sins.", ref: "1 Peter 4:8" },
    { text: "Be completely humble and gentle; be patient, bearing with one another in love.", ref: "Ephesians 4:2" },
    { text: "And over all these virtues put on love, which binds them all together in perfect unity.", ref: "Colossians 3:14" },
    { text: "Therefore encourage one another and build each other up.", ref: "1 Thessalonians 5:11" },
    { text: "He who finds a wife finds what is good and receives favor from the Lord.", ref: "Proverbs 18:22" },
    { text: "Two are better than one, because they have a good return for their labor.", ref: "Ecclesiastes 4:9" },
    { text: "The Lord bless you and keep you; the Lord make his face shine on you.", ref: "Numbers 6:24-25" },
    { text: "I have no greater joy than to hear that my children are walking in the truth.", ref: "3 John 1:4" },
    { text: "Like arrows in the hands of a warrior are children born in one's youth.", ref: "Psalm 127:4" },
    { text: "May the Lord make your love increase and overflow for each other and for everyone else.", ref: "1 Thessalonians 3:12" },
    { text: "Husbands, love your wives, just as Christ loved the church.", ref: "Ephesians 5:25" },
    { text: "Her children arise and call her blessed; her husband also, and he praises her.", ref: "Proverbs 31:28" },
    { text: "Do not let any unwholesome talk come out of your mouths, but only what is helpful for building others up.", ref: "Ephesians 4:29" },
    { text: "Let us not become weary in doing good, for at the proper time we will reap a harvest.", ref: "Galatians 6:9" },
    { text: "Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you.", ref: "Ephesians 4:32" },
    { text: "My command is this: Love each other as I have loved you.", ref: "John 15:12" },
  ],
  "Health": [
    { text: "He heals the brokenhearted and binds up their wounds.", ref: "Psalm 147:3" },
    { text: "The Lord will sustain them on their sickbed and restore them from their bed of illness.", ref: "Psalm 41:3" },
    { text: "I am the Lord, who heals you.", ref: "Exodus 15:26" },
    { text: "Do you not know that your bodies are temples of the Holy Spirit?", ref: "1 Corinthians 6:19" },
    { text: "Dear friend, I pray that you may enjoy good health and that all may go well with you.", ref: "3 John 1:2" },
    { text: "He himself bore our sins in his body so that we might die to sins and live for righteousness; by his wounds you have been healed.", ref: "1 Peter 2:24" },
    { text: "A cheerful heart is good medicine, but a crushed spirit dries up the bones.", ref: "Proverbs 17:22" },
    { text: "But I will restore you to health and heal your wounds, declares the Lord.", ref: "Jeremiah 30:17" },
    { text: "Jesus went throughout Galilee, teaching in their synagogues, proclaiming the good news and healing every disease.", ref: "Matthew 4:23" },
    { text: "Is anyone among you sick? Let them call the elders of the church to pray over them.", ref: "James 5:14" },
    { text: "Surely he took up our pain and bore our suffering.", ref: "Isaiah 53:4" },
    { text: "The prayer offered in faith will make the sick person well.", ref: "James 5:15" },
    { text: "He said to her, Daughter, your faith has healed you. Go in peace.", ref: "Luke 8:48" },
    { text: "My flesh and my heart may fail, but God is the strength of my heart.", ref: "Psalm 73:26" },
    { text: "So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you.", ref: "Isaiah 41:10" },
    { text: "Even youths grow tired and weary, but those who hope in the Lord will renew their strength.", ref: "Isaiah 40:31" },
    { text: "The Lord is close to the brokenhearted and saves those who are crushed in spirit.", ref: "Psalm 34:18" },
    { text: "Cast all your anxiety on him because he cares for you.", ref: "1 Peter 5:7" },
    { text: "Peace I leave with you; my peace I give you.", ref: "John 14:27" },
    { text: "Come to me, all you who are weary and burdened, and I will give you rest.", ref: "Matthew 11:28" },
    { text: "I can do all this through him who gives me strength.", ref: "Philippians 4:13" },
    { text: "The Lord is my shepherd, I lack nothing.", ref: "Psalm 23:1" },
    { text: "He gives strength to the weary and increases the power of the weak.", ref: "Isaiah 40:29" },
    { text: "And the God of all grace will himself restore you and make you strong, firm and steadfast.", ref: "1 Peter 5:10" },
  ],
  "Relationships": [
    { text: "A new command I give you: Love one another. As I have loved you, so you must love one another.", ref: "John 13:34" },
    { text: "Do to others as you would have them do to you.", ref: "Luke 6:31" },
    { text: "Greater love has no one than this: to lay down one's life for one's friends.", ref: "John 15:13" },
    { text: "Be devoted to one another in love. Honor one another above yourselves.", ref: "Romans 12:10" },
    { text: "Let love be genuine. Abhor what is evil; hold fast to what is good.", ref: "Romans 12:9" },
    { text: "Carry each other's burdens, and in this way you will fulfill the law of Christ.", ref: "Galatians 6:2" },
    { text: "Perfume and incense bring joy to the heart, and the pleasantness of a friend springs from their heartfelt advice.", ref: "Proverbs 27:9" },
    { text: "As iron sharpens iron, so one person sharpens another.", ref: "Proverbs 27:17" },
    { text: "Do not be misled: Bad company corrupts good character.", ref: "1 Corinthians 15:33" },
    { text: "Whoever would foster love covers over an offense, but whoever repeats the matter separates close friends.", ref: "Proverbs 17:9" },
    { text: "Wounds from a friend can be trusted, but an enemy multiplies kisses.", ref: "Proverbs 27:6" },
    { text: "Do nothing out of selfish ambition or vain conceit. Value others above yourselves.", ref: "Philippians 2:3" },
    { text: "Love your neighbor as yourself.", ref: "Matthew 22:39" },
    { text: "Let no debt remain outstanding, except the continuing debt to love one another.", ref: "Romans 13:8" },
    { text: "Accept one another, then, just as Christ accepted you.", ref: "Romans 15:7" },
    { text: "Speak to one another with psalms, hymns, and songs from the Spirit.", ref: "Ephesians 5:19" },
    { text: "Live in harmony with one another.", ref: "Romans 12:16" },
    { text: "Submit to one another out of reverence for Christ.", ref: "Ephesians 5:21" },
    { text: "Be completely humble and gentle; be patient, bearing with one another in love.", ref: "Ephesians 4:2" },
    { text: "And let us consider how we may spur one another on toward love and good deeds.", ref: "Hebrews 10:24" },
    { text: "The generous will themselves be blessed, for they share their food with the poor.", ref: "Proverbs 22:9" },
    { text: "Clothe yourselves with compassion, kindness, humility, gentleness and patience.", ref: "Colossians 3:12" },
    { text: "Rejoice with those who rejoice; mourn with those who mourn.", ref: "Romans 12:15" },
    { text: "Love does no harm to a neighbor. Therefore love is the fulfillment of the law.", ref: "Romans 13:10" },
  ],
  "Work / Career": [
    { text: "Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.", ref: "Colossians 3:23" },
    { text: "Commit to the Lord whatever you do, and he will establish your plans.", ref: "Proverbs 16:3" },
    { text: "For we are God's handiwork, created in Christ Jesus to do good works.", ref: "Ephesians 2:10" },
    { text: "The plans of the diligent lead to profit as surely as haste leads to poverty.", ref: "Proverbs 21:5" },
    { text: "Do you see someone skilled in their work? They will serve before kings.", ref: "Proverbs 22:29" },
    { text: "And my God will meet all your needs according to the riches of his glory in Christ Jesus.", ref: "Philippians 4:19" },
    { text: "Trust in the Lord with all your heart and lean not on your own understanding.", ref: "Proverbs 3:5" },
    { text: "In all your ways submit to him, and he will make your paths straight.", ref: "Proverbs 3:6" },
    { text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you.", ref: "Jeremiah 29:11" },
    { text: "Be strong and courageous. Do not be afraid; do not be discouraged.", ref: "Joshua 1:9" },
    { text: "The Lord your God will be with you wherever you go.", ref: "Joshua 1:9" },
    { text: "Let your light shine before others, that they may see your good deeds.", ref: "Matthew 5:16" },
    { text: "Diligent hands will rule, but laziness ends in forced labor.", ref: "Proverbs 12:24" },
    { text: "The blessing of the Lord brings wealth, without painful toil for it.", ref: "Proverbs 10:22" },
    { text: "She sets about her work vigorously; her arms are strong for her tasks.", ref: "Proverbs 31:17" },
    { text: "Unless the Lord builds the house, the builders labor in vain.", ref: "Psalm 127:1" },
    { text: "May the favor of the Lord our God rest on us; establish the work of our hands.", ref: "Psalm 90:17" },
    { text: "Lazy hands make for poverty, but diligent hands bring wealth.", ref: "Proverbs 10:4" },
    { text: "One who is slack in his work is brother to one who destroys.", ref: "Proverbs 18:9" },
    { text: "Whatever your hand finds to do, do it with all your might.", ref: "Ecclesiastes 9:10" },
    { text: "Do not conform to the pattern of this world, but be transformed by the renewing of your mind.", ref: "Romans 12:2" },
    { text: "I press on toward the goal to win the prize for which God has called me heavenward.", ref: "Philippians 3:14" },
    { text: "No, in all these things we are more than conquerors through him who loved us.", ref: "Romans 8:37" },
    { text: "For God gave us a spirit not of fear but of power and love and self-control.", ref: "2 Timothy 1:7" },
  ],
  "Spiritual Growth": [
    { text: "But grow in the grace and knowledge of our Lord and Savior Jesus Christ.", ref: "2 Peter 3:18" },
    { text: "I am the vine; you are the branches. If you remain in me and I in you, you will bear much fruit.", ref: "John 15:5" },
    { text: "Your word is a lamp for my feet, a light on my path.", ref: "Psalm 119:105" },
    { text: "Do not merely listen to the word, and so deceive yourselves. Do what it says.", ref: "James 1:22" },
    { text: "Create in me a pure heart, O God, and renew a steadfast spirit within me.", ref: "Psalm 51:10" },
    { text: "Search me, God, and know my heart; test me and know my anxious thoughts.", ref: "Psalm 139:23" },
    { text: "Delight yourself in the Lord, and he will give you the desires of your heart.", ref: "Psalm 37:4" },
    { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
    { text: "Draw near to God, and he will draw near to you.", ref: "James 4:8" },
    { text: "The Spirit himself testifies with our spirit that we are God's children.", ref: "Romans 8:16" },
    { text: "So whether you eat or drink or whatever you do, do it all for the glory of God.", ref: "1 Corinthians 10:31" },
    { text: "Pray continually, give thanks in all circumstances.", ref: "1 Thessalonians 5:17-18" },
    { text: "If any of you lacks wisdom, you should ask God, who gives generously to all.", ref: "James 1:5" },
    { text: "The Lord is near to all who call on him, to all who call on him in truth.", ref: "Psalm 145:18" },
    { text: "For it is God who works in you to will and to act in order to fulfill his good purpose.", ref: "Philippians 2:13" },
    { text: "Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!", ref: "2 Corinthians 5:17" },
    { text: "I have been crucified with Christ and I no longer live, but Christ lives in me.", ref: "Galatians 2:20" },
    { text: "Set your minds on things above, not on earthly things.", ref: "Colossians 3:2" },
    { text: "But seek first his kingdom and his righteousness, and all these things will be given to you.", ref: "Matthew 6:33" },
    { text: "Blessed are those who hunger and thirst for righteousness, for they will be filled.", ref: "Matthew 5:6" },
    { text: "The heart is deceitful above all things — but I the Lord search the heart.", ref: "Jeremiah 17:9-10" },
    { text: "Let the word of Christ dwell in you richly as you teach and admonish one another with all wisdom.", ref: "Colossians 3:16" },
    { text: "He must become greater; I must become less.", ref: "John 3:30" },
    { text: "Now to him who is able to do immeasurably more than all we ask or imagine.", ref: "Ephesians 3:20" },
  ],
  "Finances": [
    { text: "And my God will meet all your needs according to the riches of his glory in Christ Jesus.", ref: "Philippians 4:19" },
    { text: "Honor the Lord with your wealth, with the firstfruits of all your crops.", ref: "Proverbs 3:9" },
    { text: "Keep your lives free from the love of money and be content with what you have.", ref: "Hebrews 13:5" },
    { text: "For the love of money is a root of all kinds of evil.", ref: "1 Timothy 6:10" },
    { text: "No one can serve two masters. You cannot serve both God and money.", ref: "Matthew 6:24" },
    { text: "Bring the whole tithe into the storehouse... and see if I will not throw open the floodgates of heaven.", ref: "Malachi 3:10" },
    { text: "The generous will themselves be blessed, for they share their food with the poor.", ref: "Proverbs 22:9" },
    { text: "Give, and it will be given to you. A good measure, pressed down, shaken together.", ref: "Luke 6:38" },
    { text: "Do not store up for yourselves treasures on earth, where moths and vermin destroy.", ref: "Matthew 6:19" },
    { text: "But store up for yourselves treasures in heaven.", ref: "Matthew 6:20" },
    { text: "I know what it is to be in need, and I know what it is to have plenty.", ref: "Philippians 4:12" },
    { text: "I have learned the secret of being content in any and every situation.", ref: "Philippians 4:11" },
    { text: "A good person leaves an inheritance for their children's children.", ref: "Proverbs 13:22" },
    { text: "Dishonest money dwindles away, but whoever gathers money little by little makes it grow.", ref: "Proverbs 13:11" },
    { text: "The blessing of the Lord brings wealth, without painful toil for it.", ref: "Proverbs 10:22" },
    { text: "Wealth gained hastily will dwindle, but whoever gathers little by little will increase it.", ref: "Proverbs 13:11" },
    { text: "Cast your cares on the Lord and he will sustain you.", ref: "Psalm 55:22" },
    { text: "Trust in the Lord with all your heart and lean not on your own understanding.", ref: "Proverbs 3:5" },
    { text: "Seek the Kingdom of God above all else, and he will give you everything you need.", ref: "Luke 12:31" },
    { text: "The earth is the Lord's, and everything in it, the world, and all who live in it.", ref: "Psalm 24:1" },
    { text: "You shall remember the Lord your God, for it is he who gives you power to get wealth.", ref: "Deuteronomy 8:18" },
    { text: "Whoever sows sparingly will also reap sparingly, and whoever sows generously will also reap generously.", ref: "2 Corinthians 9:6" },
    { text: "Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion.", ref: "2 Corinthians 9:7" },
    { text: "And God is able to bless you abundantly, so that in all things at all times, you will abound in every good work.", ref: "2 Corinthians 9:8" },
  ],
  "default": [
    { text: "Cast all your anxiety on him because he cares for you.", ref: "1 Peter 5:7" },
    { text: "I can do all this through him who gives me strength.", ref: "Philippians 4:13" },
    { text: "The Lord is my shepherd, I lack nothing.", ref: "Psalm 23:1" },
    { text: "For I know the plans I have for you, declares the Lord.", ref: "Jeremiah 29:11" },
    { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
    { text: "Trust in the Lord with all your heart.", ref: "Proverbs 3:5" },
    { text: "The Lord is close to the brokenhearted.", ref: "Psalm 34:18" },
    { text: "Do not be anxious about anything, but in every situation, by prayer and petition, present your requests to God.", ref: "Philippians 4:6" },
    { text: "And we know that in all things God works for the good of those who love him.", ref: "Romans 8:28" },
    { text: "Come to me, all you who are weary and burdened, and I will give you rest.", ref: "Matthew 11:28" },
    { text: "The Lord will fight for you; you need only to be still.", ref: "Exodus 14:14" },
    { text: "Even though I walk through the darkest valley, I will fear no evil, for you are with me.", ref: "Psalm 23:4" },
    { text: "For God so loved the world that he gave his one and only Son.", ref: "John 3:16" },
    { text: "I have told you these things, so that in me you may have peace.", ref: "John 16:33" },
    { text: "Now faith is confidence in what we hope for and assurance about what we do not see.", ref: "Hebrews 11:1" },
    { text: "Jesus looked at them and said, With man this is impossible, but with God all things are possible.", ref: "Matthew 19:26" },
    { text: "Ask and it will be given to you; seek and you will find.", ref: "Matthew 7:7" },
    { text: "If God is for us, who can be against us?", ref: "Romans 8:31" },
    { text: "My grace is sufficient for you, for my power is made perfect in weakness.", ref: "2 Corinthians 12:9" },
    { text: "The name of the Lord is a fortified tower; the righteous run to it and are safe.", ref: "Proverbs 18:10" },
    { text: "Give thanks to the Lord, for he is good; his love endures forever.", ref: "Psalm 107:1" },
    { text: "The Lord himself goes before you and will be with you.", ref: "Deuteronomy 31:8" },
    { text: "Those who hope in the Lord will renew their strength.", ref: "Isaiah 40:31" },
    { text: "This is the day the Lord has made; let us rejoice and be glad in it.", ref: "Psalm 118:24" },
  ],
};

const getVerseForPrayer = (categories, index = 0) => {
  const cat = Array.isArray(categories) ? categories[0] : categories;
  const pool = VERSES[cat] || VERSES["default"];
  return pool[index % pool.length];
};

// ── Reflect Tab ───────────────────────────────────────────────────────────────
const REFLECT_COLORS = {
  guided:    { border: "#5C8068", bg: "#F0F5F1", icon: "#5C8068", light: "#D4E4D8" },
  composer:  { border: "#C8A96E", bg: "#FDF6E8", icon: "#C8A96E", light: "#F5EDD8" },
  journal:   { border: "#5B7FA6", bg: "#EEF3F8", icon: "#5B7FA6", light: "#D6E4F0" },
  scripture: { border: "#7C6FAB", bg: "#F2EFF8", icon: "#7C6FAB", light: "#E0D9F5" },
};

const SCRIPTURE_THEMES = ["Peace", "Healing", "Family", "Wisdom", "Provision", "Strength", "Hope", "Trust"];

function ReflectCard({ type, title, subtitle, expanded, onToggle, children, disabled = false }) {
  const c = REFLECT_COLORS[type];
  return (
    <div style={{ background: T.white, borderRadius: 16, marginBottom: 14, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", overflow: "hidden", borderLeft: `4px solid ${disabled ? T.parchment : c.border}`, opacity: disabled ? 0.5 : 1 }}>
      <button onClick={disabled ? undefined : onToggle} style={{ width: "100%", border: "none", background: "none", padding: "16px 18px", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 22 }}>{type === "guided" ? "🙏" : type === "composer" ? "✏️" : type === "journal" ? "📓" : "📖"}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: T.ink, lineHeight: 1.2 }}>{title}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, marginTop: 2, lineHeight: 1.4 }}>{subtitle}</div>
        </div>
        <span style={{ color: T.inkLight, fontSize: 16, flexShrink: 0 }}>{expanded ? "∧" : "›"}</span>
      </button>
      {expanded && (
        <div style={{ padding: "0 18px 20px", borderTop: `1px solid ${c.light}` }}>
          <div style={{ height: 16 }} />
          {children}
        </div>
      )}
    </div>
  );
}

function GuidedPrayer({ onAddPrayer }) {
  const [weighing, setWeighing] = useState("");
  const [prayerFor, setPrayerFor] = useState("");
  const [asking, setAsking] = useState("");
  const [generated, setGenerated] = useState("");
  const [loading, setLoading] = useState(false);
  const [edited, setEdited] = useState("");
  const showToast = useToast();

  const curate = async () => {
    if (!weighing.trim()) return;
    setLoading(true);
    try {
      const prompt = `You are a gentle, faith-filled prayer helper. Based on what someone has shared, write a short, heartfelt personal prayer (3-5 sentences) in first person. Keep it warm, conversational, and sincere — not overly formal or religious-sounding. Do not use placeholder brackets. Write the prayer directly.

What is weighing on them: ${weighing}
Who is this prayer for: ${prayerFor || "myself"}
What they are asking God for: ${asking || "guidance and peace"}

Write only the prayer itself, nothing else.`;

      const text = await callClaude(prompt);
      setGenerated(text);
      setEdited(text);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const addToPrayers = async () => {
    await onAddPrayer({ title: weighing.slice(0, 60), note: edited, categories: ["Spiritual Growth"], isPublic: false, prayerDate: null });
    showToast("Prayer added to your list 🙏");
    setGenerated(""); setEdited(""); setWeighing(""); setPrayerFor(""); setAsking("");
  };

  return (
    <div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: REFLECT_COLORS.guided.border }}>✦</span> Answer a few questions and we'll help shape your heart into a prayer.
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>🤍</span>
          <label style={{ ...labelStyle, marginBottom: 0 }}>What's weighing on you today?</label>
        </div>
        <input style={inputStyle} placeholder="Share what's on your heart..." value={weighing} onChange={e => setWeighing(e.target.value)} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>👥</span>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Who is this prayer for?</label>
        </div>
        <input style={inputStyle} placeholder="Name a person or group..." value={prayerFor} onChange={e => setPrayerFor(e.target.value)} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>✝️</span>
          <label style={{ ...labelStyle, marginBottom: 0 }}>What are you asking God for in this?</label>
        </div>
        <input style={inputStyle} placeholder="Share your request or hope..." value={asking} onChange={e => setAsking(e.target.value)} />
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, textAlign: "center", marginBottom: 14, fontStyle: "italic" }}>
        We'll help shape this into a prayer you can add to Prayers.
      </div>
      {!generated && (
        <Btn style={{ width: "100%", justifyContent: "center" }} onClick={curate} disabled={loading || !weighing.trim()}>
          {loading ? "Shaping your prayer..." : "Curate Prayer"}
        </Btn>
      )}
      {generated && (
        <div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: REFLECT_COLORS.guided.border, fontWeight: 500, marginBottom: 8 }}>Your prayer — feel free to edit</div>
          <textarea style={{ ...inputStyle, height: 140, resize: "none", fontFamily: "'Cormorant Garamond', serif", fontSize: 16, lineHeight: 1.7 }} value={edited} onChange={e => setEdited(e.target.value)} />
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <Btn style={{ flex: 1, justifyContent: "center" }} onClick={addToPrayers}>Add to Prayers</Btn>
            <Btn variant="ghost" onClick={() => { setGenerated(""); setEdited(""); }}>Start over</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function PrayerComposer({ prayers, onAddPrayer, onSaveJournal }) {
  const [freeText, setFreeText] = useState("");
  const [selectedPrayer, setSelectedPrayer] = useState("");
  const [composed, setComposed] = useState("");
  const [loading, setLoading] = useState(false);
  const [edited, setEdited] = useState("");
  const showToast = useToast();
  const activePrayers = prayers.filter(p => p.status === "active" && !p.fromFriend);

  const compose = async () => {
    if (!freeText.trim() && !selectedPrayer) return;
    setLoading(true);
    try {
      const prayerContext = selectedPrayer ? activePrayers.find(p => p.id === selectedPrayer) : null;
      const prompt = `You are a thoughtful, faith-filled writing companion. Help turn what someone has shared into a personal, polished prayer. Write in first person, 4-6 sentences. Keep it genuine, warm, and spiritually grounded. Do not use placeholder brackets or generic phrases. Write the prayer directly.

${freeText ? `What's on their heart: ${freeText}` : ""}
${prayerContext ? `Existing prayer context — Title: ${prayerContext.title}${prayerContext.note ? `, Notes: ${prayerContext.note}` : ""}` : ""}

Write only the prayer itself.`;

      const text = await callClaude(prompt);
      setComposed(text);
      setEdited(text);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const addToPrayers = async () => {
    const title = freeText.slice(0, 60) || "Composed Prayer";
    await onAddPrayer({ title, note: edited, categories: ["Spiritual Growth"], isPublic: false, prayerDate: null });
    showToast("Prayer added 🙏");
    setFreeText(""); setSelectedPrayer(""); setComposed(""); setEdited("");
  };

  const saveJournal = async () => {
    await onSaveJournal({ text: edited, type: "composer", title: freeText.slice(0, 60) || "Composed Prayer" });
    showToast("Saved to journal 📓");
    setFreeText(""); setSelectedPrayer(""); setComposed(""); setEdited("");
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>What's on your heart today?</label>
        <textarea style={{ ...inputStyle, height: 90, resize: "none" }} placeholder="Describe a burden, situation, or moment..." value={freeText} onChange={e => setFreeText(e.target.value)} />
      </div>
      {activePrayers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Or pray from your list</label>
          <select style={{ ...inputStyle, appearance: "none" }} value={selectedPrayer} onChange={e => setSelectedPrayer(e.target.value)}>
            <option value="">Choose a prayer...</option>
            {activePrayers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      )}
      {!composed && (
        <Btn style={{ width: "100%", justifyContent: "center" }} onClick={compose} disabled={loading || (!freeText.trim() && !selectedPrayer)}>
          {loading ? "Composing..." : "Compose My Prayer"}
        </Btn>
      )}
      {composed && (
        <div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: REFLECT_COLORS.composer.border, fontWeight: 500, marginBottom: 8 }}>Your composed prayer — edit freely</div>
          <textarea style={{ ...inputStyle, height: 160, resize: "none", fontFamily: "'Cormorant Garamond', serif", fontSize: 16, lineHeight: 1.7 }} value={edited} onChange={e => setEdited(e.target.value)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <Btn small style={{ flex: 1, justifyContent: "center" }} onClick={addToPrayers}>Add to Prayers</Btn>
            <Btn small variant="secondary" onClick={saveJournal}>Save to Journal</Btn>
            <Btn small variant="ghost" onClick={compose}>Try Again</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function PrayerJournal({ prayers, onSaveJournal }) {
  const showToast = useToast();
  const [text, setText] = useState("");
  const [linked, setLinked] = useState([]);
  const activePrayers = prayers.filter(p => p.status === "active" && !p.fromFriend).slice(0, 8);

  const handleTextChange = (val) => {
    setText(val);
  };

  const addLinkedPrayer = (prayer) => {
    if (linked.includes(prayer.id)) return;

    setLinked(prev => [...prev, prayer.id]);
    setText(prev => {
      const prayerTitle = prayer.title.trim();
      const spacer = prev.trim() ? "\n" : "";
      return `${prev}${spacer}${prayerTitle}`;
    });
  };

  const save = async () => {
    if (!text.trim()) return;
    const linkedPrayers = prayers.filter(p => linked.includes(p.id)).map(p => ({ id: p.id, title: p.title }));
    await onSaveJournal({ text, type: "journal", title: text.slice(0, 50), linkedPrayers });
    showToast("Saved to journal 📓");
    setText("");
    setLinked([]);
  };

  const addToPrayers = async () => {
    if (!text.trim()) return;
    showToast("Feature coming soon");
  };

  return (
    <div>
      {activePrayers.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: REFLECT_COLORS.journal.border, fontWeight: 500, marginBottom: 8 }}>From your prayers</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginBottom: 8 }}>Tap a prayer to link it and add its title to your reflection.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {activePrayers.filter(p => !linked.includes(p.id)).map(p => {
              const on = linked.includes(p.id);
              return (
                <button key={p.id} onClick={() => addLinkedPrayer(p)} style={{ border: `1.5px solid ${T.parchment}`, background: "transparent", borderRadius: 20, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: T.inkLight, display: "flex", alignItems: "center", gap: 6 }}>
                  {p.title.slice(0, 20)}{p.title.length > 20 ? "..." : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: REFLECT_COLORS.journal.border, fontWeight: 500 }}>Today's reflection</div>
        <Btn small style={{ padding: "7px 14px" }} onClick={save} disabled={!text.trim()}>Save to Journal</Btn>
      </div>

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginBottom: 8 }}>Write freely. There's no right or wrong way to pray.</div>
      <textarea
        style={{ ...inputStyle, height: 180, resize: "none", fontFamily: "'Cormorant Garamond', serif", fontSize: 16, lineHeight: 1.8, marginBottom: 8 }}
        placeholder="Lord, I'm feeling..."
        value={text}
        maxLength={2000}
        onChange={e => handleTextChange(e.target.value)}
      />
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, textAlign: "right", marginBottom: 10 }}>{text.length}/2000</div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={addToPrayers}>Add to Prayers</Btn>
      </div>
    </div>
  );
}

function ScriptureThemes({ prayers }) {
  const [selectedTheme, setSelectedTheme] = useState("Peace");
  const [verses, setVerses] = useState([]);
  const [loading, setLoading] = useState(false);

  const prayerContext = prayers.filter(p => p.status === "active" && !p.fromFriend).slice(0, 5).map(p => p.title).join(", ");

  const fetchVerses = async (theme) => {
    setLoading(true);
    setVerses([]);
    try {
      const prompt = `You are a thoughtful Bible scholar. Select 2 Bible verses about the theme of "${theme}" that would resonate with someone whose current prayers involve: ${prayerContext || "everyday life challenges"}.

Return ONLY a JSON array with exactly 2 objects, no markdown, no explanation:
[{"verse": "the verse text", "reference": "Book Chapter:Verse", "translation": "NIV"}, {"verse": "...", "reference": "...", "translation": "NIV"}]`;

      const text = await callClaude(prompt);
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setVerses(parsed);
    } catch (e) { console.error(e); setVerses([]); }
    setLoading(false);
  };

  useEffect(() => { fetchVerses(selectedTheme); }, []);

  return (
    <div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: REFLECT_COLORS.scripture.border }}>✦</span> Scripture for what's on your heart
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {SCRIPTURE_THEMES.map(t => (
          <button key={t} onClick={() => { setSelectedTheme(t); fetchVerses(t); }} style={{ border: `1.5px solid ${selectedTheme === t ? REFLECT_COLORS.scripture.border : T.parchment}`, background: selectedTheme === t ? REFLECT_COLORS.scripture.light : "transparent", borderRadius: 20, padding: "5px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: selectedTheme === t ? REFLECT_COLORS.scripture.border : T.inkLight, fontWeight: selectedTheme === t ? 500 : 400 }}>{t}</button>
        ))}
      </div>
      {loading && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, textAlign: "center", padding: "20px 0" }}>Finding verses for you...</div>}
      {!loading && verses.length > 0 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {verses.map((v, i) => (
              <div key={i} style={{ background: REFLECT_COLORS.scripture.bg, borderRadius: 12, padding: "14px 12px" }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: T.ink, lineHeight: 1.6, marginBottom: 8 }}>"{v.verse}"</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: REFLECT_COLORS.scripture.border, fontWeight: 500 }}>{v.reference} | {v.translation}</div>
              </div>
            ))}
          </div>
          <button onClick={() => fetchVerses(selectedTheme)} style={{ border: "none", background: "none", color: REFLECT_COLORS.scripture.border, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", fontWeight: 500, padding: 0 }}>Show another verse →</button>
        </div>
      )}
    </div>
  );
}

function JournalEntryModal({ entry, onClose }) {
  const typeIcon = (type) => type === "guided" ? "🙏" : type === "composer" ? "✏️" : "📓";
  const fmtFull = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }}>
      <div style={{ background: T.cream, borderRadius: 20, padding: "22px 20px 24px", width: "100%", maxWidth: 560, maxHeight: "calc(100vh - 80px)", overflowY: "auto", boxShadow: "0 12px 36px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{typeIcon(entry.type)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: T.ink, lineHeight: 1.25, overflowWrap: "break-word" }}>{entry.title}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginTop: 2 }}>{fmtFull(entry.createdAt)}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: T.inkLight, padding: 4, flexShrink: 0 }}>✕</button>
        </div>
        {entry.linkedPrayers?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: REFLECT_COLORS.journal.border, fontWeight: 500, marginBottom: 8 }}>Linked prayers</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {entry.linkedPrayers.map(p => (
                <span key={p.id} style={{ background: REFLECT_COLORS.journal.light, color: REFLECT_COLORS.journal.border, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", overflowWrap: "break-word" }}>{p.title}</span>
              ))}
            </div>
          </div>
        )}
        <div style={{ background: T.white, border: `1px solid ${T.parchment}`, borderRadius: 14, padding: "14px 16px", fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: T.ink, lineHeight: 1.8, whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>{entry.text}</div>
      </div>
    </div>
  );
}

function Reflect({ prayers, user, addPrayer }) {
  const [expanded, setExpanded] = useState(null);
  const [journalEntries, setJournalEntries] = useState([]);
  const [viewEntry, setViewEntry] = useState(null);
  const [showAllJournal, setShowAllJournal] = useState(false);

  const toggle = (id) => setExpanded(prev => prev === id ? null : id);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "journalEntries"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setJournalEntries(data);
    });
    return unsub;
  }, [user]);

  const saveJournal = async ({ text, type, title, linkedPrayers }) => {
    await addDoc(collection(db, "journalEntries"), {
      userId: user.uid,
      text,
      type,
      title: title || text.slice(0, 50),
      linkedPrayers: linkedPrayers || [],
      createdAt: new Date().toISOString(),
    });
  };

  const typeIcon = (type) => type === "guided" ? "🙏" : type === "composer" ? "✏️" : "📓";

  const fmtFull = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 20 }}>
        <div style={pageTitle}>Reflect</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>Write, listen, and rest in the Word.</div>
      </div>

      <ReflectCard type="journal" title="Prayer Journal" subtitle="Write freely and pray through your list." expanded={expanded === "journal"} onToggle={() => toggle("journal")}>
        <PrayerJournal prayers={prayers} onSaveJournal={saveJournal} />
      </ReflectCard>

      <ReflectCard type="guided" title="Guided Prayer" subtitle="Coming soon" expanded={false} onToggle={() => {}} disabled={true}>
        <GuidedPrayer onAddPrayer={addPrayer} />
      </ReflectCard>

      <ReflectCard type="composer" title="Prayer Composer" subtitle="Coming soon" expanded={false} onToggle={() => {}} disabled={true}>
        <PrayerComposer prayers={prayers} onAddPrayer={addPrayer} onSaveJournal={saveJournal} />
      </ReflectCard>



      {viewEntry && <JournalEntryModal entry={viewEntry} onClose={() => setViewEntry(null)} />}
      {journalEntries.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: REFLECT_COLORS.guided.border, fontWeight: 600, letterSpacing: 0.5 }}>Recent Reflections</div>
            {journalEntries.length > 5 && (
              <button
                onClick={() => setShowAllJournal(prev => !prev)}
                style={{ border: "none", background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: REFLECT_COLORS.guided.border, cursor: "pointer", fontWeight: 500 }}
              >
                {showAllJournal ? "Show less ›" : `See all ${journalEntries.length} ›`}
              </button>
            )}
          </div>
          {(showAllJournal ? journalEntries : journalEntries.slice(0, 5)).map(e => (
            <div key={e.id} onClick={() => setViewEntry(e)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.parchment}`, cursor: "pointer" }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{typeIcon(e.type)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.ink, fontWeight: 500 }}>{e.title}</div>
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, flexShrink: 0 }}>{fmtFull(e.createdAt)}</div>
              <span style={{ color: T.inkLight, fontSize: 12 }}>›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications({ currentUser }) {
  const [notifs, setNotifs] = useState([]);
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "notifications"), where("toUid", "==", currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => !n.dismissed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setNotifs(data);
    });
    return unsub;
  }, [currentUser]);

  const dismissNotif = async (id) => {
    await updateDoc(doc(db, "notifications", id), { read: true, dismissed: true });
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div style={tabContent}>
      <div style={{ marginBottom: 20 }}>
        <div style={pageTitle}>Notifications</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>Your latest activity</div>
      </div>
      {notifs.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔔</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: T.ink, marginBottom: 8 }}>No notifications yet</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, lineHeight: 1.6 }}>When friends pray for you or send requests, you'll see them here.</div>
        </div>
      )}
      {notifs.map(n => (
        <Card key={n.id} style={{ borderLeft: `4px solid ${n.read ? T.parchment : T.sage}`, position: "relative" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, color: T.ink, marginBottom: 2 }}>{n.title}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, lineHeight: 1.5 }}>{n.body}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, marginTop: 6 }}>{n.createdAt ? fmt(n.createdAt) : ""}</div>
            </div>
            <button onClick={() => dismissNotif(n.id)} style={{ border: "none", background: "none", cursor: "pointer", color: T.inkLight, fontSize: 16, padding: "0 4px", flexShrink: 0, lineHeight: 1 }}>✕</button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Circles Tab ───────────────────────────────────────────────────────────────
function CreateCircleModal({ onClose, onCreated, currentUser }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🙏");
  const [loading, setLoading] = useState(false);
  const EMOJIS = ["🙏","🏠","⛪","✝️","❤️","🌿","🕊️","⭐","🔥","🌊","🎯","👨‍👩‍👧‍👦"];

  const create = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const ref = await addDoc(collection(db, "circles"), {
        name: name.trim(),
        emoji,
        createdBy: currentUser.uid,
        createdAt: new Date().toISOString(),
        members: [currentUser.uid],
        memberDetails: {
          [currentUser.uid]: {
            name: currentUser.displayName || "Me",
            photoURL: currentUser.photoURL || null,
            joinedAt: new Date().toISOString(),
          }
        },
        inviteCode: code,
        prayerIds: [],
      });
      await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(ref.id) });
      await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(ref.id) });
      setLoading(false);
      onCreated(ref.id);
      onClose();
    } catch (err) {
      console.error("Error creating circle:", err);
      alert("Could not create circle: " + err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: T.cream, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: T.ink, marginBottom: 20 }}>Create a Circle</div>
        <label style={labelStyle}>Circle name</label>
        <input style={inputStyle} placeholder="e.g. Smith Family, Men's Bible Study..." value={name} onChange={e => setName(e.target.value)} />
        <label style={labelStyle}>Choose an emoji</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {EMOJIS.map(e => (
            <button key={e} onClick={() => setEmoji(e)} style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${emoji === e ? T.sageDark : T.parchment}`, background: emoji === e ? T.sageLight : T.white, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{e}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn style={{ flex: 1 }} onClick={create} disabled={loading || !name.trim()}>{loading ? "Creating..." : "Create Circle"}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

function JoinCircleModal({ onClose, onJoined, currentUser }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const join = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    const q = query(collection(db, "circles"), where("inviteCode", "==", code.trim().toUpperCase()));
    const snap = await getDocs(q);
    if (snap.empty) { setError("No circle found with that code. Check and try again."); setLoading(false); return; }
    const circleDoc = snap.docs[0];
    const circleData = circleDoc.data();
    if (circleData.members.includes(currentUser.uid)) { setError("You're already in this circle!"); setLoading(false); return; }
    await updateDoc(doc(db, "circles", circleDoc.id), {
      members: arrayUnion(currentUser.uid),
      [`memberDetails.${currentUser.uid}`]: {
        name: currentUser.displayName || "Me",
        photoURL: currentUser.photoURL || null,
        joinedAt: new Date().toISOString(),
      }
    });
    await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(circleDoc.id) });
    setLoading(false);
    await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(circleDoc.id) });
    onJoined(circleDoc.id);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: T.cream, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: T.ink, marginBottom: 20 }}>Join a Circle</div>
        <label style={labelStyle}>Enter invite code</label>
        <input style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: 3, fontSize: 18 }} placeholder="e.g. ABC123" value={code} onChange={e => setCode(e.target.value)} maxLength={6} />
        {error && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn style={{ flex: 1 }} onClick={join} disabled={loading || !code.trim()}>{loading ? "Joining..." : "Join Circle"}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

function CircleInviteModal({ circle, currentUser, friends, onClose, showToast }) {
  const [tab, setTab] = useState("friends");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState([]);

  const nonMembers = friends.filter(f => !(circle.members || []).includes(f.uid));

  const addFriend = async (friend) => {
    setAdding(friend.uid);
    try {
      await addDoc(collection(db, "notifications"), {
        toUid: friend.uid,
        fromUid: currentUser.uid,
        fromName: currentUser.displayName || "Someone",
        type: "circle_invite",
        title: `${currentUser.displayName || "Someone"} invited you to a prayer circle`,
        body: `You've been invited to join "${circle.name}". Accept to see and pray for shared requests.`,
        circleId: circle.id,
        circleName: circle.name,
        circleEmoji: circle.emoji,
        read: false,
        dismissed: false,
        createdAt: new Date().toISOString(),
      });
      setAdded(prev => [...prev, friend.uid]);
      showToast(`Invite sent to ${friend.displayName || "friend"}!`);
    } catch (err) {
      showToast("Could not send invite");
    }
    setAdding(null);
  };

  const sendEmailInvite = () => {
    if (!email.trim()) return;
    const subject = encodeURIComponent(`Join my prayer circle on LIFT`);
    const body = encodeURIComponent(`Hey! I'd love for you to join my prayer circle "${circle.name}" on LIFT.

Download the app at https://amen-app-two.vercel.app and use invite code: ${circle.inviteCode}

Let's pray together!`);
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    showToast("Email opened!");
    setEmail("");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: T.cream, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: T.ink }}>Invite to {circle.name}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: T.inkLight }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 0, marginBottom: 20, background: T.parchment, borderRadius: 12, padding: 4 }}>
          {["friends", "email"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, border: "none", background: tab === t ? T.white : "transparent", borderRadius: 9, padding: "8px 0", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: tab === t ? T.ink : T.inkLight, fontWeight: tab === t ? 500 : 400, cursor: "pointer" }}>
              {t === "friends" ? "👥 From friends" : "Invite via Code or Email"}
            </button>
          ))}
        </div>

        {tab === "friends" && (
          <div>
            {nonMembers.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🙏</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>All your friends are already in this circle, or you have no friends added yet.</div>
              </div>
            )}
            {nonMembers.map(friend => {
              const isAdded = added.includes(friend.uid);
              const isAdding = adding === friend.uid;
              return (
                <div key={friend.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.parchment}` }}>
                  <Avatar initials={(friend.displayName || friend.name || "?").split(" ").map(n => n[0]).join("").slice(0,2)} photoURL={friend.photoURL} size={38} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.ink, fontWeight: 500 }}>{friend.displayName || friend.name}</div>
                  </div>
                  <button onClick={() => !isAdded && addFriend(friend)} style={{ border: "none", background: isAdded ? T.sageLight : T.sageDark, color: isAdded ? T.sageDark : T.white, borderRadius: 14, padding: "6px 14px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: isAdded ? "default" : "pointer", fontWeight: 500 }}>
                    {isAdding ? "Adding..." : isAdded ? "✓ Added" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "email" && (
          <div>
            <div style={{ background: T.sageLight, borderRadius: 12, padding: "12px 14px", marginBottom: 16, border: `1px solid ${T.sage}` }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, marginBottom: 4 }}>Circle invite code</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 24, fontWeight: 700, color: T.sageDark, letterSpacing: 6 }}>{circle.inviteCode}</div>
              <button onClick={() => { navigator.clipboard.writeText(circle.inviteCode); showToast("Code copied!"); }} style={{ border: "none", background: "none", color: T.sageDark, fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", padding: "4px 0", fontWeight: 500 }}>Copy code</button>
            </div>
            <label style={labelStyle}>Send invite email to</label>
            <input style={inputStyle} type="email" placeholder="friend@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            <Btn style={{ width: "100%" }} onClick={sendEmailInvite} disabled={!email.trim()}>Open Email App</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function CircleMemberModal({ member, currentUser, friends = [], incomingRequests = [], onSendRequest, onAcceptRequest, onClose, showToast }) {
  const [sent, setSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const isYou = member.uid === currentUser.uid;
  const isFriend = friends.some(f => f.uid === member.uid);
  const pendingIncoming = incomingRequests.find(r => r.fromUid === member.uid);
  const getInitials = (name) => (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const handleAdd = async () => {
    try { await onSendRequest({ uid: member.uid, displayName: member.name }); setSent(true); showToast("Friend request sent 🙏"); }
    catch (e) { showToast("Couldn't send request"); }
  };
  const handleAccept = async () => {
    try { await onAcceptRequest(pendingIncoming); setAccepted(true); showToast("You're now friends 🙏"); }
    catch (e) { showToast("Couldn't accept request"); }
  };

  const primaryBtn = { width: "100%", border: "none", background: T.sageDark, color: T.white, borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" };
  const statusText = { fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.sageDark, fontWeight: 500, textAlign: "center", padding: "10px 0 4px" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2500, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cream, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: T.sageDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 500, color: "#fff", fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{getInitials(member.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: T.ink }}>{member.name || "Circle member"}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{isYou ? "This is you" : (isFriend || accepted) ? "Praying together as friends" : "Circle member"}</div>
          </div>
        </div>
        {isYou ? (
          <div style={{ ...statusText, color: T.inkLight, fontWeight: 400 }}>This is your profile.</div>
        ) : (isFriend || accepted) ? (
          <div style={statusText}>✓ Already friends</div>
        ) : pendingIncoming ? (
          <button onClick={handleAccept} style={primaryBtn}>Accept friend request</button>
        ) : sent ? (
          <div style={statusText}>✓ Request sent</div>
        ) : (
          <button onClick={handleAdd} style={primaryBtn}>+ Add friend</button>
        )}
        <button onClick={onClose} style={{ width: "100%", border: `1px solid ${T.parchment}`, background: "none", color: T.inkLight, borderRadius: 12, padding: "10px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", marginTop: 10 }}>Close</button>
      </div>
    </div>
  );
}

function CircleDetail({ circle, circleId, currentUser, onBack, friends = [], incomingRequests = [], onSendRequest, onAcceptRequest }) {
  const [prayers, setPrayers] = useState([]);
  const [filter, setFilter] = useState("All");
  const [prayingIds, setPrayingIds] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (!circle.prayerIds || circle.prayerIds.length === 0) { setPrayers([]); return; }
    const fetchPrayers = async () => {
      const results = [];
      const toRemove = [];
      for (const prayerId of circle.prayerIds) {
        try {
          const snap = await getDoc(doc(db, "prayers", prayerId));
          if (snap.exists()) results.push({ id: snap.id, ...snap.data() });
          else toRemove.push(prayerId);
        } catch (err) {
          // Read failed (permissions/network) — NOT proof of deletion; skip, don't remove
          console.warn("Could not read circle prayer", prayerId, err);
        }
      }
      // Clean up inaccessible prayer IDs from circle
      if (toRemove.length > 0 && circle.createdBy === currentUser.uid) {
        for (const id of toRemove) {
          await updateDoc(doc(db, "circles", circleId), { prayerIds: arrayRemove(id) });
        }
      }
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setPrayers(results);
    };
    fetchPrayers();
  }, [circle.prayerIds]);

  useEffect(() => {
    if (!currentUser) return;
    const fetchPraying = async () => {
      const snap = await getDocs(query(collection(db, "prayingRecords"), where("prayingUserId", "==", currentUser.uid)));
      setPrayingIds(snap.docs.map(d => d.data().prayerId));
    };
    fetchPraying();
  }, [currentUser]);

  const handlePray = async (prayer) => {
    const alreadyPraying = prayingIds.includes(prayer.id);
    if (alreadyPraying) {
      const snap = await getDocs(query(collection(db, "prayingRecords"), where("prayingUserId", "==", currentUser.uid), where("prayerId", "==", prayer.id)));
      for (const d of snap.docs) await deleteDoc(doc(db, "prayingRecords", d.id));
      setPrayingIds(prev => prev.filter(id => id !== prayer.id));
      showToast("Removed from praying");
    } else {
      await addDoc(collection(db, "prayingRecords"), {
        prayingUserId: currentUser.uid,
        prayerOwnerId: prayer.userId,
        prayerId: prayer.id,
        prayerTitle: prayer.title || "",
        prayerName: currentUser.displayName || "A friend",
        prayedAt: new Date().toISOString(),
      });
      setPrayingIds(prev => [...prev, prayer.id]);
      showToast("🙏 Praying!");
    }
  };

  const handleHoldForOthers = async (prayer) => {
    try {
      const existing = await getDocs(query(
        collection(db, "prayers"),
        where("userId", "==", currentUser.uid),
        where("originalPrayerId", "==", prayer.id)
      ));
      const activeExists = existing.docs.some(d => d.data().status === "active");
      if (activeExists) { showToast("Already holding this prayer"); return; }
      const removedDoc = existing.docs.find(d => d.data().status === "removed");
      if (removedDoc) {
        await updateDoc(doc(db, "prayers", removedDoc.id), { status: "active" });
      } else {
        await addDoc(collection(db, "prayers"), {
          userId: currentUser.uid,
          title: prayer.title,
          note: prayer.note || "",
          categories: prayer.categories || [],
          isPublic: false,
          status: "active",
          fromFriend: true,
          ownerName: circle.memberDetails?.[prayer.userId]?.name || "Circle member",
          sourceKey: `${prayer.userId}_${prayer.id}`,
          originalOwnerId: prayer.userId,
          originalPrayerId: prayer.id,
          sharedToCircles: [],
          sharedWithUids: [],
          prayerDate: prayer.prayerDate || null,
          createdAt: new Date().toISOString(),
          date: new Date().toISOString().split("T")[0],
          praying: 0,
        });
      }
      showToast("Added to Holding for Others 🙏");
    } catch (err) {
      showToast("Could not add to your list");
    }
  };

  const [selectedMember, setSelectedMember] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const members = Object.entries(circle.memberDetails || {});
  const categories = ["All", ...Array.from(new Set(prayers.flatMap(p => p.categories || []))),"Answered"];
  const filtered = prayers.filter(p => {
    if (filter === "Answered") return p.status === "answered";
    if (filter === "All") return p.status === "active";
    return p.status === "active" && (p.categories || []).includes(filter);
  });
  const answered = prayers.filter(p => p.status === "answered");

  const getInitials = (name) => (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const AVATAR_COLORS = ["#4a6741","#7a8c7b","#c4a882","#9b7fa6","#6b8fa8","#c4776a"];

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ background: T.cream, padding: "14px 16px 0", borderBottom: `1px solid ${T.parchment}` }}>
        <button onClick={onBack} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: T.sageDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, marginBottom: 10, padding: 0 }}>
          ← Circles
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: T.sageLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{circle.emoji}</div>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: T.ink }}>{circle.name}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight }}>{members.length} member{members.length !== 1 ? "s" : ""} · {prayers.filter(p => p.status === "active").length} active · {answered.length} answered</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 12 }}>
          {members.slice(0, 5).map(([uid, m], i) => (
            <div key={uid} title={m.name} onClick={() => setSelectedMember({ uid, name: m.name, photoURL: m.photoURL })} style={{ width: 28, height: 28, borderRadius: "50%", background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500, color: "#fff", border: `2px solid ${T.cream}`, marginLeft: i > 0 ? -8 : 0, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
              {getInitials(m.name)}
            </div>
          ))}
          {members.length > 5 && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, marginLeft: 4 }}>+{members.length - 5} more</div>}
          <button onClick={() => setShowMembers(v => !v)} style={{ marginLeft: members.length > 5 ? 8 : 4, border: `1px solid ${T.sageDark}`, background: showMembers ? T.sageLight : "none", borderRadius: 14, padding: "4px 12px", fontSize: 11, color: T.sageDark, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: 500, flexShrink: 0 }}>{showMembers ? "Hide members ▲" : "View members ▼"}</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={() => { setShowInvite(true); }} style={{ border: `1px solid ${T.sageDark}`, background: "none", borderRadius: 14, padding: "4px 12px", fontSize: 11, color: T.sageDark, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: 500 }}>+ Invite</button>
            {circle.createdBy !== currentUser.uid && (
              <button onClick={async () => {
                if (!window.confirm("Leave this circle? You'll no longer see shared prayers.")) return;
                await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayRemove(circleId) });
                await updateDoc(doc(db, "circles", circleId), {
                  members: arrayRemove(currentUser.uid),
                });
                await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayRemove(circleId) });
                onBack();
              }} style={{ border: `1px solid #c0392b`, background: "none", borderRadius: 14, padding: "4px 12px", fontSize: 11, color: "#c0392b", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: 500 }}>Leave</button>
            )}
            {circle.createdBy === currentUser.uid && (
              <button onClick={async () => {
                if (!window.confirm("Delete this circle? This cannot be undone.")) return;
                await deleteDoc(doc(db, "circles", circleId));
                onBack();
              }} style={{ border: `1px solid #c0392b`, background: "none", borderRadius: 14, padding: "4px 12px", fontSize: 11, color: "#c0392b", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: 500 }}>Delete</button>
            )}
          </div>
        </div>
        {showMembers && (
          <div style={{ background: T.white, borderRadius: 12, border: `1px solid ${T.parchment}`, padding: "4px 12px", marginBottom: 10 }}>
            {members.map(([uid, m], i) => {
              const isYou = uid === currentUser.uid;
              const isFriend = friends.some(f => f.uid === uid);
              const pending = (incomingRequests || []).some(r => r.fromUid === uid);
              return (
                <div key={uid} onClick={() => setSelectedMember({ uid, name: m.name, photoURL: m.photoURL })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < members.length - 1 ? `1px solid ${T.parchment}` : "none", cursor: "pointer" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, color: "#fff", fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{getInitials(m.name)}</div>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || "Circle member"}</div>
                  {isYou ? (
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight }}>You</span>
                  ) : isFriend ? (
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark, fontWeight: 500 }}>✓ Friends</span>
                  ) : pending ? (
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark, fontWeight: 500 }}>Respond</span>
                  ) : (
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#fff", background: T.sageDark, borderRadius: 12, padding: "4px 11px", fontWeight: 500 }}>+ Add</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={{ flexShrink: 0, border: `1px solid ${filter === cat ? T.sageDark : T.parchment}`, background: filter === cat ? T.sageDark : "transparent", borderRadius: 14, padding: "4px 12px", fontSize: 11, color: filter === cat ? T.white : T.inkLight, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: filter === cat ? 500 : 400 }}>{cat}</button>
          ))}
        </div>
      </div>

      {showInvite && (
        <CircleInviteModal
          circle={circle}
          currentUser={currentUser}
          friends={friends}
          onClose={() => setShowInvite(false)}
          showToast={showToast}
        />
      )}
      {selectedMember && (
        <CircleMemberModal
          member={selectedMember}
          currentUser={currentUser}
          friends={friends}
          incomingRequests={incomingRequests}
          onSendRequest={onSendRequest}
          onAcceptRequest={onAcceptRequest}
          onClose={() => setSelectedMember(null)}
          showToast={showToast}
        />
      )}

      <div style={{ padding: "12px 16px 0" }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🙏</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: T.ink, marginBottom: 6 }}>No prayers here yet</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, lineHeight: 1.6 }}>When members share prayers to this circle, they'll appear here.</div>
          </div>
        )}
        {filtered.map(p => {
          const isPraying = prayingIds.includes(p.id);
          const memberInfo = circle.memberDetails?.[p.userId];
          const initials = getInitials(memberInfo?.name || p.ownerName || "?");
          const memberIndex = members.findIndex(([uid]) => uid === p.userId);
          const avatarColor = AVATAR_COLORS[memberIndex >= 0 ? memberIndex % AVATAR_COLORS.length : 0];
          return (
            <div key={p.id} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.parchment}`, padding: "14px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500, color: "#fff", fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{initials}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight }}>{memberInfo?.name || p.ownerName || "Member"}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: T.inkLight, marginLeft: "auto" }}>{p.createdAt ? fmt(p.createdAt) : ""}</div>
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: T.ink, lineHeight: 1.4, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.title}</div>
              {(p.categories || []).length > 0 && (
                <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
                  {(p.categories || []).map(cat => {
                    const cc = catColor(cat);
                    return <span key={cat} style={{ fontSize: 10, background: cc.bg, color: cc.text, borderRadius: 8, padding: "2px 7px", fontFamily: "'DM Sans', sans-serif" }}>{cat}</span>;
                  })}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => handlePray(p)} style={{ display: "flex", alignItems: "center", gap: 5, background: isPraying ? T.sageDark : T.sageLight, border: "none", borderRadius: 16, padding: "6px 12px", fontSize: 11, fontWeight: 500, color: isPraying ? T.white : T.sageDark, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                  🙏 {isPraying ? "Praying" : "I'm Praying"}
                </button>
                {p.userId !== currentUser.uid && (
                  <button onClick={() => handleHoldForOthers(p)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${T.parchment}`, borderRadius: 16, padding: "6px 12px", fontSize: 11, fontWeight: 500, color: T.inkLight, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                    + Add to my list
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filter === "All" && answered.length > 0 && (
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500, padding: "8px 0 6px" }}>Answered · {answered.length}</div>
            {answered.map(p => (
              <div key={p.id} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.parchment}`, borderLeft: `3px solid ${T.gold}`, padding: "12px 14px", marginBottom: 8, opacity: 0.8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: T.ink }}>{p.title}</div>
                  <span style={{ fontSize: 10, background: T.goldLight, color: T.gold, borderRadius: 8, padding: "2px 7px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>✓ Answered</span>
                </div>
                {p.answeredNote && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, lineHeight: 1.5 }}>{p.answeredNote}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Circles({ currentUser, prayers: myPrayers, circles = [], friends = [], incomingRequests = [], onSendRequest, onAcceptRequest }) {
  const [activeCircle, setActiveCircle] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const loading = false;

  const getLatestPrayer = async (prayerIds) => {
    if (!prayerIds || prayerIds.length === 0) return null;
    const latestId = prayerIds[prayerIds.length - 1];
    const snap = await getDoc(doc(db, "prayers", latestId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  };

  if (activeCircle) {
    const circle = circles.find(c => c.id === activeCircle);
    if (!circle) return null;
    return <CircleDetail circle={circle} circleId={activeCircle} currentUser={currentUser} onBack={() => setActiveCircle(null)} friends={friends} incomingRequests={incomingRequests} onSendRequest={onSendRequest} onAcceptRequest={onAcceptRequest} />;
  }

  return (
    <div style={{ ...tabContent }}>
      <div style={{ marginBottom: 20 }}>
        <div style={pageTitle}>Circles</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>Your prayer communities</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setShowCreate(true)} style={{ border: "none", background: T.sageDark, borderRadius: 20, padding: "10px 0", fontSize: 13, fontWeight: 500, color: T.white, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          + Create circle
        </button>
        <button onClick={() => setShowJoin(true)} style={{ border: `1.5px solid ${T.sageDark}`, background: "transparent", borderRadius: 20, padding: "10px 0", fontSize: 13, fontWeight: 500, color: T.sageDark, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          Join circle
        </button>
      </div>

      {loading && <div style={{ textAlign: "center", padding: "40px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight }}>Loading your circles...</div>}

      {!loading && circles.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", margin: "0 auto 14px" }}>
          <circle cx="12" cy="7.5" r="4.2" stroke="#4a6741" strokeWidth="1.6" fill="none" />
          <circle cx="8.2" cy="14.5" r="4.2" stroke="#4a6741" strokeWidth="1.6" fill="none" />
          <circle cx="15.8" cy="14.5" r="4.2" stroke="#4a6741" strokeWidth="1.6" fill="none" />
        </svg>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: T.ink, marginBottom: 8 }}>No circles yet</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight, lineHeight: 1.7, maxWidth: 260, margin: "0 auto" }}>Create a circle for your family, small group, or church team — and pray together.</div>
        </div>
      )}

      {circles.map(circle => {
        const members = Object.entries(circle.memberDetails || {});
        const activePrayers = (circle.prayerIds || []).length;
        const AVATAR_COLORS = ["#4a6741","#7a8c7b","#c4a882","#9b7fa6","#6b8fa8","#c4776a"];
        const getInitials = (name) => (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
        return (
          <div key={circle.id} onClick={() => setActiveCircle(circle.id)} style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.parchment}`, padding: "14px", marginBottom: 12, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: T.sageLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{circle.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, color: T.ink }}>{circle.name}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.inkLight, marginTop: 2 }}>{members.length} member{members.length !== 1 ? "s" : ""} · {activePrayers} prayer{activePrayers !== 1 ? "s" : ""}</div>
              </div>
              <span style={{ color: T.inkLight, fontSize: 16 }}>›</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {members.slice(0, 5).map(([uid, m], i) => (
                <div key={uid} title={m.name} style={{ width: 26, height: 26, borderRadius: "50%", background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500, color: "#fff", border: `2px solid ${T.white}`, marginLeft: i > 0 ? -6 : 0, fontFamily: "'DM Sans', sans-serif" }}>
                  {getInitials(m.name)}
                </div>
              ))}
              {members.length > 5 && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: T.inkLight, marginLeft: 4 }}>+{members.length - 5}</div>}
            </div>
          </div>
        );
      })}

      {showCreate && <CreateCircleModal onClose={() => setShowCreate(false)} onCreated={(id) => setActiveCircle(id)} currentUser={currentUser} />}
      {showJoin && <JoinCircleModal onClose={() => setShowJoin(false)} onJoined={(id) => setActiveCircle(id)} currentUser={currentUser} />}
    </div>
  );
}

const TABS = [
  { id: "community", icon: "community", label: "Community" },
  { id: "circles", icon: "circles", label: "Circles" },
  { id: "prayers", icon: "prayers", label: "Prayer" },
  { id: "reflect", icon: "reflect", label: "Reflect" },
  { id: "profile", icon: "profile", label: "Profile" },
];

function NavIcon({ type, active }) {
  const color = active ? T.sageDark : T.inkLight;
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: { display: "block" },
  };

  if (type === "prayers") {
    const isActive = active;
    return (
      <div style={{
        width: 52,
        height: 52,
        borderRadius: "50%",
        background: T.sageDark,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: -18,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}>
        <img
          src="/praying-hands.png"
          alt="Prayer"
          style={{
            width: 26,
            height: 26,
            objectFit: "contain",
            filter: "brightness(0) invert(1)",
          }}
        />
      </div>
    );
  }

  if (type === "circles") {
    const c = active ? T.sageDark : T.inkLight;
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
        {/* Top circle */}
        <circle cx="12" cy="7.5" r="4.2" stroke={c} strokeWidth="1.6" fill="none" />
        {/* Bottom left circle */}
        <circle cx="8.2" cy="14.5" r="4.2" stroke={c} strokeWidth="1.6" fill="none" />
        {/* Bottom right circle */}
        <circle cx="15.8" cy="14.5" r="4.2" stroke={c} strokeWidth="1.6" fill="none" />
      </svg>
    );
  }

  if (type === "community") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (type === "reflect") {
    return (
      <svg {...common}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z" />
        <path d="M8 6h8" />
        <path d="M8 10h6" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function BottomNav({ active, setActive, requestCount, unreadCount }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.white, borderTop: `1px solid ${T.parchment}`, display: "flex", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setActive(t.id)} style={{ flex: 1, border: "none", background: "none", cursor: "pointer", padding: "10px 4px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
          <div style={{ position: "relative" }}>
            <NavIcon type={t.icon} active={active === t.id} />
            {t.id === "profile" && requestCount > 0 && (
              <div style={{ position: "absolute", top: -2, right: -4, width: 15, height: 15, borderRadius: "50%", background: T.dustyRose, color: T.white, fontSize: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {requestCount}
              </div>
            )}
          </div>
          {t.id !== "prayers" && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: active === t.id ? T.sageDark : T.inkLight, fontWeight: active === t.id ? 500 : 400 }}>{t.label}</span>
          )}
          {t.id !== "prayers" && active === t.id && <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.sageDark }} />}
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
  const [circles, setCircles] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [defaultPublic, setDefaultPublic] = useState(false);
  const [loadingPrayers, setLoadingPrayers] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Timeout fallback: if Firebase doesn't respond in 5s, show sign-in screen
    const timeout = setTimeout(() => {
      setUser(prev => prev === undefined ? null : prev);
    }, 5000);
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeout);
      if (firebaseUser) {
        await syncLatestGoogleProfileToFirestore(firebaseUser);
      }
      setUser(firebaseUser || null);
      if (firebaseUser) {
        // Track activity
        await setDoc(doc(db, "userActivity", firebaseUser.uid), {
          lastActive: new Date().toISOString(),
        }, { merge: true });
        // Log daily activity for streak tracking
        const todayStr = new Date().toISOString().split("T")[0];
        await setDoc(doc(db, "dailyActivity", `${firebaseUser.uid}_${todayStr}`), {
          userId: firebaseUser.uid,
          date: todayStr,
          createdAt: new Date().toISOString(),
        }, { merge: true });
// Bucket 3 — Web Push subscription (skip in Capacitor native app)
        // Native push (iOS/Android) via FCM
        await registerNativePush(firebaseUser);

        if (!(window.Capacitor?.isNativePlatform?.())) try {
          if (!('serviceWorker' in navigator)) throw new Error('SW not supported');
          const swReg = await navigator.serviceWorker.ready;
          const permission = await Notification.requestPermission();
          if (permission === "granted") {
            const existing = await swReg.pushManager.getSubscription();
            const sub = existing || await swReg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: "BPUZCKpCFVDRD8xxpwxURabMud5HsEhcLdpnRXh7yLMENcegDeTuGJbN9hMwue4mKJIoq_tQrTUZpYxJJK5n_So"
            });
            await setDoc(doc(db, "pushSubscriptions", firebaseUser.uid), {
              userId: firebaseUser.uid,
              subscription: JSON.parse(JSON.stringify(sub)),
              updatedAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.log("Push subscription error:", e);
        }
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) { setPrayers([]); setLoadingPrayers(false); return; }
    setLoadingPrayers(true);
    const q = query(collection(db, "prayers"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, async (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sync answered status: check if any active held prayers have an original that is now answered
      const activeHeld = data.filter(p => p.fromFriend && p.status === "active" && p.originalPrayerId);
      for (const held of activeHeld) {
        try {
          const originalSnap = await getDoc(doc(db, "prayers", held.originalPrayerId));
          if (originalSnap.exists() && originalSnap.data().status === "answered") {
            await updateDoc(doc(db, "prayers", held.id), { status: "answered" });
          }
        } catch (e) {
          // silently ignore if we can't read the original
        }
      }
      setPrayers(data);
      setLoadingPrayers(false);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) { setCircles([]); return; }
    const q = query(collection(db, "circles"), where("members", "array-contains", user.uid));
    const unsub = onSnapshot(q, snap => {
      setCircles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) { setFriends([]); return; }

    const loadFriendData = async (uids) => {
      if (!uids.length) return [];
      const profiles = await Promise.all(uids.map(async uid => {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return null;
        const profile = { uid: snap.id, ...snap.data() };
        const prayerSnap = await getDocs(query(collection(db, "prayers"), where("userId", "==", uid), where("isPublic", "==", true)));
        const allFriendPrayers = prayerSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const answeredOrRemovedIds = new Set((prayers || []).filter(p => p.originalPrayerId && (p.status === "answered" || p.status === "removed")).map(p => p.originalPrayerId));
        // Sync held copies: if original is answered, mark our held copy as answered too
        const answeredOriginalIds = allFriendPrayers.filter(p => p.status === "answered").map(p => p.id);
        for (const originalId of answeredOriginalIds) {
          const heldCopy = (prayers || []).find(p => p.originalPrayerId === originalId && p.status === "active");
          if (heldCopy) {
            await updateDoc(doc(db, "prayers", heldCopy.id), { status: "answered" });
          }
        }
        profile.prayers = allFriendPrayers.filter(p => p.status === "active" && !p.fromFriend && !p.originalPrayerId && !p.sourcePrayerId && !p.friendPrayerId && !answeredOrRemovedIds.has(p.id));
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
    const q = query(collection(db, "friendRequests"), where("status", "==", "accepted"));
    const unsub = onSnapshot(q, () => refreshFriends());
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) { setIncomingRequests([]); return; }
    const q = query(collection(db, "friendRequests"), where("toUid", "==", user.uid), where("status", "==", "pending"));
    const unsub = onSnapshot(q, (snap) => {
      setIncomingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    const q = query(collection(db, "notifications"), where("toUid", "==", user.uid), where("read", "==", false));
    const unsub = onSnapshot(q, (snap) => {
      setUnreadCount(snap.docs.filter(d => !d.data().dismissed).length);
    });
    return unsub;
  }, [user]);

  const addPrayer = async (fields) => {
    const prayerRef = await addDoc(collection(db, "prayers"), {
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
      originalOwnerId: fields.originalOwnerId || null,
      originalPrayerId: fields.originalPrayerId || null,
      prayerDate: fields.prayerDate || null,
      sharedToCircles: fields.sharedToCircles || [],
      createdAt: new Date().toISOString(),
    });
    if (fields.sharedToCircles && fields.sharedToCircles.length > 0) {
      const circleMemberUids = new Set();
      for (const circleId of fields.sharedToCircles) {
        await updateDoc(doc(db, "circles", circleId), {
          prayerIds: arrayUnion(prayerRef.id),
        });
        // Fetch circle members so we can store them on the prayer for Firestore rules
        const circleSnap = await getDoc(doc(db, "circles", circleId));
        if (circleSnap.exists()) {
          (circleSnap.data().members || []).forEach(uid => circleMemberUids.add(uid));
        }
      }
      // Store circle member UIDs on prayer so Firestore rules can check access
      await updateDoc(prayerRef, { sharedWithUids: Array.from(circleMemberUids) });
    }
    return prayerRef;
  };

  const updatePrayer = async (id, fields) => {
    await updateDoc(doc(db, "prayers", id), fields);
  };

  const deletePrayer = async (id) => {
    await deleteDoc(doc(db, "prayers", id));
  };

  const sendFriendRequest = async (toUser) => {
    // Check if a previous request exists (removed, declined) and reactivate it
    const [snap1, snap2] = await Promise.all([
      getDocs(query(collection(db, "friendRequests"), where("fromUid", "==", user.uid), where("toUid", "==", toUser.uid))),
      getDocs(query(collection(db, "friendRequests"), where("fromUid", "==", toUser.uid), where("toUid", "==", user.uid))),
    ]);
    const existing = [...snap1.docs, ...snap2.docs];
    if (existing.length > 0) {
      // Reactivate the most recent one as pending
      const latest = existing.sort((a, b) => new Date(b.data().createdAt) - new Date(a.data().createdAt))[0];
      await updateDoc(doc(db, "friendRequests", latest.id), {
        fromUid: user.uid,
        fromName: user.displayName || "",
        fromEmail: user.email || "",
        fromPhoto: user.photoURL || "",
        toUid: toUser.uid,
        toEmail: toUser.email || "",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      return;
    }
    // No existing request — create a new one
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

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (user === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: T.cream, display: "flex", alignItems: "center", justifyContent: "center" }}>
  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, letterSpacing: 1 }}>
        <span style={{ color: T.sageDark }}>L</span><span style={{ color: T.inkLight, fontWeight: 300 }}>og </span>
        <span style={{ color: T.sageDark }}>I</span><span style={{ color: T.inkLight, fontWeight: 300 }}>t </span>
        <span style={{ color: T.sageDark }}>F</span><span style={{ color: T.inkLight, fontWeight: 300 }}>or </span>
        <span style={{ color: T.sageDark }}>T</span><span style={{ color: T.inkLight, fontWeight: 300 }}>ransformation</span>
      </div>
      </div>
    );
  }

  if (!user) return (<><FontLink /><SignIn /></>);

  const firstName = (user.displayName || user.email || "Friend").split(" ")[0];

  return (
    <>
      <FontLink />
      <ToastProvider>
        <div style={{ minHeight: "100vh", background: T.cream, paddingBottom: "calc(env(safe-area-inset-bottom) + 70px)" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 90, background: T.cream, padding: "12px 20px 10px", paddingTop: "calc(env(safe-area-inset-top) + 12px)", borderBottom: `1px solid ${T.parchment}`, display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 480, margin: "0 auto", width: "100%" }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: T.sageDark, letterSpacing: 3 }}>LIFT</span>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 0.5 }}>
              <span style={{ color: T.sageDark }}>L</span><span style={{ color: T.inkLight, fontWeight: 300 }}>og </span>
              <span style={{ color: T.sageDark }}>I</span><span style={{ color: T.inkLight, fontWeight: 300 }}>t </span>
              <span style={{ color: T.sageDark }}>F</span><span style={{ color: T.inkLight, fontWeight: 300 }}>or </span>
              <span style={{ color: T.sageDark }}>T</span><span style={{ color: T.inkLight, fontWeight: 300 }}>ransformation</span>
            </span>
          </div>
          {loadingPrayers ? (
            <div style={{ textAlign: "center", padding: "60px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.inkLight }}>Loading your prayers...</div>
          ) : (
            <>
              {tab === "community" && <Community currentUser={user} friends={friends} myPrayers={prayers} addPrayer={addPrayer} incomingRequests={incomingRequests} onAccept={acceptRequest} onDecline={declineRequest} onSendRequest={sendFriendRequest} />}
              {tab === "circles" && <Circles currentUser={user} prayers={prayers} circles={circles} friends={friends} incomingRequests={incomingRequests} onSendRequest={sendFriendRequest} onAcceptRequest={acceptRequest} />}
              {tab === "prayers" && <MyPrayers prayers={prayers} addPrayer={addPrayer} updatePrayer={updatePrayer} deletePrayer={deletePrayer} friends={friends} firstName={firstName} defaultPublic={defaultPublic} currentUser={user} circles={circles} />}
              {tab === "reflect" && <Reflect prayers={prayers} user={user} addPrayer={addPrayer} />}
              {tab === "profile" && <Profile prayers={prayers} user={user} defaultPublic={defaultPublic} setDefaultPublic={setDefaultPublic} onSignOut={handleSignOut} currentUser={user} unreadCount={unreadCount} incomingRequests={incomingRequests} onAcceptRequest={acceptRequest} onDeclineRequest={declineRequest} friends={friends} onSendRequest={sendFriendRequest} />}
            </>
          )}
          <BottomNav active={tab} setActive={setTab} requestCount={incomingRequests.length + unreadCount} unreadCount={unreadCount} />
        </div>
      </ToastProvider>
    </>
  );
}