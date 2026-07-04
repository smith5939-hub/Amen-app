import shutil

PATH = "src/App.jsx"
shutil.copy(PATH, PATH + ".bak3")
src = open(PATH).read()

def patch(old, new, label):
    global src
    n = src.count(old)
    if n != 1:
        raise SystemExit(f"ABORT: anchor for '{label}' found {n} times (expected 1). No changes written.")
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
"""    await updateDoc(doc(db, "circles", circleDoc.id), {
      members: arrayUnion(currentUser.uid),
      [`memberDetails.${currentUser.uid}`]: {
        name: currentUser.displayName || "Me",
        photoURL: currentUser.photoURL || null,
        joinedAt: new Date().toISOString(),
      }
    });
    setLoading(false);""",
"""    await updateDoc(doc(db, "circles", circleDoc.id), {
      members: arrayUnion(currentUser.uid),
      [`memberDetails.${currentUser.uid}`]: {
        name: currentUser.displayName || "Me",
        photoURL: currentUser.photoURL || null,
        joinedAt: new Date().toISOString(),
      }
    });
    await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(circleDoc.id) });
    setLoading(false);""",
"join by code")

# 3. Accept circle invite from notifications panel
patch(
"""                      });
                      await updateDoc(doc(db, "notifications", n.id), { read: true, accepted: true, dismissed: false });""",
"""                      });
                      await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayUnion(n.circleId) });
                      await updateDoc(doc(db, "notifications", n.id), { read: true, accepted: true, dismissed: false });""",
"accept invite notification")

# 4. Leave circle
patch(
"""                await updateDoc(doc(db, "circles", circleId), {
                  members: arrayRemove(currentUser.uid),
                });
                onBack();""",
"""                await updateDoc(doc(db, "circles", circleId), {
                  members: arrayRemove(currentUser.uid),
                });
                await updateDoc(doc(db, "users", currentUser.uid), { circleIds: arrayRemove(circleId) });
                onBack();""",
"leave circle")

open(PATH, "w").write(src)
print("\nAll 4 patches applied. Backup at src/App.jsx.bak3")
