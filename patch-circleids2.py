import shutil

PATH = "src/App.jsx"
shutil.copy(PATH, PATH + ".bak5")
src = open(PATH).read()

def patch(old, new, label):
    global src
    n = src.count(old)
    if n != 1:
        print(f"\nABORT: anchor for '{label}' found {n} times (expected 1).")
        for i, line in enumerate(src.split("\n"), 1):
            if old.split("\n")[0].strip()[:30] in line:
                print(f"  candidate line {i}: {repr(line)}")
        raise SystemExit("No changes written.")
    src = src.replace(old, new)
    print(f"OK: {label}")

# 1. Create circle -> creator gets circleIds
patch(
"""      setLoading(false);
      onCreated(ref.id);""",
"""      await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(ref.id) });
      setLoading(false);
      onCreated(ref.id);""",
"create circle")

# 2. Join by invite code
patch(
"""    onJoined(circleDoc.id);""",
"""    await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(circleDoc.id) });
    onJoined(circleDoc.id);""",
"join by code")

# 3. Accept circle invite from notifications panel
patch(
"""{ read: true, accepted: true, dismissed: false });""",
"""{ read: true, accepted: true, dismissed: false });
                      await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(n.circleId) });""",
"accept invite notification")

# 4. Leave circle
patch(
"""if (!window.confirm("Leave this circle? You'll no longer see shared prayers.")) return;""",
"""if (!window.confirm("Leave this circle? You'll no longer see shared prayers.")) return;
                await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayRemove(circleId) });""",
"leave circle")

open(PATH, "w").write(src)
print("\nAll 4 patches applied. Backup at src/App.jsx.bak5")
