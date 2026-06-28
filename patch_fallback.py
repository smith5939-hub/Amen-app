import os, sys

path = os.path.expanduser("~/Local Projects/Amen-app/src/App.jsx")
with open(path) as f:
    src = f.read()
with open(path + ".bak4", "w") as f:
    f.write(src)

def patch(src, old, new, label):
    n = src.count(old)
    if n != 1:
        print(f"  ✗ {label}: anchor found {n} times (expected 1) — ABORTING, nothing written")
        sys.exit(1)
    print(f"  ✓ {label}")
    return src.replace(old, new)

# --- Add the helper right before the first sync function ---
helper = '''// Returns a clean display name, avoiding Apple private-relay gibberish
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

async function syncLatestGoogleProfileToFirestore'''
src = patch(src, 'async function syncLatestGoogleProfileToFirestore', helper, "add safeDisplayName helper")

# --- Site 1: syncLatestGoogleProfileToFirestore ---
src = patch(src,
'''        displayName:
          googleProfile?.displayName ||
          firebaseUser.displayName ||
          fallbackName,''',
'''        displayName: safeDisplayName(googleProfile?.displayName || firebaseUser.displayName, firebaseUser.email),''',
"route sync (Google-latest) through helper")

# --- Site 2: syncGoogleProfileToFirestore ---
src = patch(src,
'        displayName: firebaseUser.displayName || fallbackName,',
'        displayName: safeDisplayName(firebaseUser.displayName, firebaseUser.email),',
"route sync (Google) through helper")

# --- Site 3: Apple handler, givenName branch ---
src = patch(src,
'''              : firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Friend",''',
'''              : safeDisplayName(firebaseUser.displayName, firebaseUser.email),''',
"route Apple (givenName branch) through helper")

# --- Site 4: Apple handler, fallback branch ---
src = patch(src,
'            displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Friend",',
'            displayName: safeDisplayName(firebaseUser.displayName, firebaseUser.email),',
"route Apple (fallback branch) through helper")

with open(path, "w") as f:
    f.write(src)
print("All fallback patches applied. Backup at src/App.jsx.bak4")
