import shutil

PATH = "src/App.jsx"
shutil.copy(PATH, PATH + ".bak6")
src = open(PATH).read()

old = '{t === "friends" ? "👥 From friends" : "✉️ Email invite"}'
new = '{t === "friends" ? "👥 From friends" : "Invite via Code or Email"}'

n = src.count(old)
if n != 1:
    raise SystemExit(f"ABORT: anchor found {n} times (expected 1). No changes written.")

open(PATH, "w").write(src.replace(old, new))
print("OK: tab renamed to 'Invite via Code or Email'. Backup at src/App.jsx.bak6")
