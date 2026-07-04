import shutil

PATH = "src/App.jsx"
shutil.copy(PATH, PATH + ".bak7")
src = open(PATH).read()

def patch(old, new, label):
    global src
    n = src.count(old)
    if n != 1:
        raise SystemExit(f"ABORT: anchor for '{label}' found {n} times (expected 1). No changes written.")
    src = src.replace(old, new)
    print(f"OK: {label}")

# 1. AddPrayerModal: accept initialCircles prop
patch(
"editPrayer = null, friends = [], defaultPublic = true, circles = [] }) {",
"editPrayer = null, friends = [], defaultPublic = true, circles = [], initialCircles = [] }) {",
"modal prop")

# 2. Use it as the default circle selection
patch(
"useState(editPrayer?.sharedToCircles || []);",
"useState(editPrayer?.sharedToCircles || initialCircles);",
"modal initial selection")

# 3. Pass addPrayer into Circles
patch(
"<Circles currentUser={user} prayers={prayers} circles={circles}",
"<Circles currentUser={user} addPrayer={addPrayer} prayers={prayers} circles={circles}",
"pass addPrayer to Circles")

# 4. Circles accepts it
patch(
"function Circles({ currentUser, prayers: myPrayers, circles = [],",
"function Circles({ currentUser, addPrayer, prayers: myPrayers, circles = [],",
"Circles signature")

# 5. Pass everything down to CircleDetail
patch(
"return <CircleDetail circle={circle} circleId={activeCircle} currentUser={currentUser}",
"return <CircleDetail circle={circle} circleId={activeCircle} currentUser={currentUser} addPrayer={addPrayer} myPrayers={myPrayers} circles={circles}",
"pass to CircleDetail")

# 6. New sheet component + CircleDetail signature (one combined patch)
patch(
"""function CircleDetail({ circle, circleId, currentUser, onBack, friends = [], incomingRequests = [], onSendRequest, onAcceptRequest }) {""",
"""function AddToCircleSheet({ circleId, myPrayers, currentUser, onClose, onNewPrayer, showToast }) {
  const [busy, setBusy] = useState(null);
  const mine = myPrayers.filter(p => p.userId === currentUser.uid && !p.fromFriend && p.status === "active");
  const isShared = p => (p.sharedToCircles || []).includes(circleId);
  const sorted = [...mine].sort((a, b) => (isShared(b) ? 1 : 0) - (isShared(a) ? 1 : 0));
  const share = async (p) => {
    setBusy(p.id);
    try {
      await updateDoc(doc(db, "prayers", p.id), { sharedToCircles: arrayUnion(circleId) });
      await updateDoc(doc(db, "circles", circleId), { prayerIds: arrayUnion(p.id) });
    } catch (err) { console.error("share failed", err); }
    setBusy(null);
  };
  const unshare = async (p) => {
    setBusy(p.id);
    try {
      await updateDoc(doc(db, "prayers", p.id), { sharedToCircles: arrayRemove(circleId) });
      await updateDoc(doc(db, "circles", circleId), { prayerIds: arrayRemove(p.id) });
      showToast && showToast("Removed from circle");
    } catch (err) { console.error("unshare failed", err); }
    setBusy(null);
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cream, borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "75vh", overflowY: "auto", padding: "20px 18px 28px" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink, marginBottom: 4 }}>Add a prayer</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.inkLight, marginBottom: 14 }}>Share one of your prayers with this circle, or write a new one.</div>
        <button onClick={onNewPrayer} style={{ width: "100%", border: "none", background: T.sageDark, color: T.white, borderRadius: 12, padding: "12px 16px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, cursor: "pointer", marginBottom: 16 }}>+ Write a new prayer</button>
        {sorted.length === 0 && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight, textAlign: "center", padding: "12px 0" }}>No active prayers yet — write one above.</div>
        )}
        {sorted.map(p => {
          const shared = isShared(p);
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: T.white, borderRadius: 12, border: `1px solid ${shared ? T.sage : T.parchment}`, padding: "10px 12px", marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                {shared && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.sageDark }}>Shared with this circle</div>}
              </div>
              <button disabled={busy === p.id} onClick={() => shared ? unshare(p) : share(p)} style={{ border: shared ? `1px solid ${T.parchment}` : "none", background: shared ? "none" : T.sageLight, color: shared ? T.inkLight : T.sageDark, borderRadius: 14, padding: "6px 14px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, cursor: "pointer", flexShrink: 0, opacity: busy === p.id ? 0.5 : 1 }}>
                {shared ? "Unshare" : "Share"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CircleDetail({ circle, circleId, currentUser, addPrayer, myPrayers = [], circles = [], onBack, friends = [], incomingRequests = [], onSendRequest, onAcceptRequest }) {""",
"sheet component + CircleDetail signature")

# 7. State + new-prayer handler inside CircleDetail
patch(
"""  useEffect(() => {
    if (!circle.prayerIds || circle.prayerIds.length === 0) { setPrayers([]); return; }""",
"""  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showNewPrayer, setShowNewPrayer] = useState(false);
  const handleNewPrayer = async (fields) => {
    const maxSortOrder = Math.max(0, ...myPrayers.filter(p => p.userId === currentUser.uid).map(p => p.sortOrder || 0));
    await addPrayer({ ...fields, sortOrder: maxSortOrder + 1000 });
    setShowNewPrayer(false);
    showToast && showToast("Prayer added to this circle");
  };

  useEffect(() => {
    if (!circle.prayerIds || circle.prayerIds.length === 0) { setPrayers([]); return; }""",
"CircleDetail state + handler")

# 8. Button + overlay renders (modals are position:fixed, safe to mount here)
patch(
"""<button onClick={() => { setShowInvite(true); }}""",
"""<button onClick={() => setShowAddSheet(true)} style={{ border: "none", background: T.sageDark, borderRadius: 14, padding: "4px 12px", fontSize: 11, color: T.white, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: 500 }}>+ Add prayer</button>
            {showAddSheet && <AddToCircleSheet circleId={circleId} myPrayers={myPrayers} currentUser={currentUser} showToast={showToast} onClose={() => setShowAddSheet(false)} onNewPrayer={() => { setShowAddSheet(false); setShowNewPrayer(true); }} />}
            {showNewPrayer && <AddPrayerModal onClose={() => setShowNewPrayer(false)} onAdd={handleNewPrayer} friends={friends} circles={circles} initialCircles={[circleId]} />}
            <button onClick={() => { setShowInvite(true); }}""",
"button + overlays")

open(PATH, "w").write(src)
print("\nAll patches applied. Backup at src/App.jsx.bak7")
