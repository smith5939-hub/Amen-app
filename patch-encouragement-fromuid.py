import shutil

PATH = "src/App.jsx"
shutil.copy(PATH, PATH + ".bak8")
src = open(PATH).read()

old = """      await addDoc(collection(db, "notifications"), {
        toUid: prayer.userId,
        title: "💬 Encouragement from " + (currentUser.displayName || "a friend"),"""

new = """      await addDoc(collection(db, "notifications"), {
        toUid: prayer.userId,
        fromUid: currentUser.uid,
        fromName: currentUser.displayName || "A friend",
        title: "💬 Encouragement from " + (currentUser.displayName || "a friend"),"""

n = src.count(old)
if n != 1:
    raise SystemExit(f"ABORT: anchor found {n} times (expected 1). No changes written.")

open(PATH, "w").write(src.replace(old, new))
print("OK: encouragement notification now includes fromUid. Backup at src/App.jsx.bak8")
