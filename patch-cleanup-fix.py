import shutil

PATH = "src/App.jsx"
shutil.copy(PATH, PATH + ".bak4")
src = open(PATH).read()

old = """        } catch (err) {
          // Prayer not accessible — remove from circle to keep count accurate
          toRemove.push(prayerId);
        }"""

new = """        } catch (err) {
          // Read failed (permissions/network) — NOT proof of deletion; skip, don't remove
          console.warn("Could not read circle prayer", prayerId, err);
        }"""

n = src.count(old)
if n != 1:
    raise SystemExit(f"ABORT: anchor found {n} times (expected 1). No changes written.")

open(PATH, "w").write(src.replace(old, new))
print("OK: cleanup now removes only on confirmed non-existence. Backup at src/App.jsx.bak4")
