import os, sys

path = os.path.expanduser("~/Local Projects/Amen-app/src/App.jsx")
with open(path, "r") as f:
    src = f.read()

# backup
with open(path + ".bak3", "w") as f:
    f.write(src)

def patch(src, old, new, label):
    n = src.count(old)
    if n != 1:
        print(f"  ✗ {label}: anchor found {n} times (expected 1) — ABORTING, no changes written")
        sys.exit(1)
    print(f"  ✓ {label}")
    return src.replace(old, new)

# ---- Patch 1: import updateProfile ----
src = patch(src,
    'deleteUser, reauthenticateWithCredential',
    'deleteUser, updateProfile, reauthenticateWithCredential',
    "import updateProfile")

# ---- Patch 2: add state + save handler after `deleting` state ----
old2 = '  const [deleting, setDeleting] = useState(false);'
new2 = old2 + '''
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
  };'''
src = patch(src, old2, new2, "add name state + saveName handler")

# ---- Patch 3: inline-editable header ----
old3 = '''      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Avatar initials={(user?.displayName || "Me").split(" ").map(n => n[0]).join("").slice(0, 2)} photoURL={user?.photoURL} size={60} />
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: T.ink }}>{user?.displayName || "My Account"}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.inkLight }}>{user?.email || ""}</div>
        </div>
      </div>'''
new3 = '''      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
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
      </div>'''
src = patch(src, old3, new3, "inline-editable profile header")

with open(path, "w") as f:
    f.write(src)
print("\\nAll patches applied. Backup at src/App.jsx.bak3")
