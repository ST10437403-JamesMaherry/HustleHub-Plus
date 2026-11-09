#!/usr/bin/env bash
set -euo pipefail

# Capture a clean personal-repository snapshot and embed the current engineering playbook.
REPO_ROOT="${1:-$HOME/Documents/GitHub/HustleHub-Plus}"
SNAPSHOT_OUTPUT_DIR="${SNAPSHOT_OUTPUT_DIR:-$HOME/Desktop}"

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  printf 'HustleHub+ repository not found: %s\n' "$REPO_ROOT" >&2
  exit 1
fi

cd "$REPO_ROOT"

# Verify the repository identity and required release branch.
ORIGIN_URL="$(git config --get remote.origin.url)"
case "$ORIGIN_URL" in
  */HustleHub-Plus|*/HustleHub-Plus.git) ;;
  *)
    printf 'Unexpected origin; expected a HustleHub-Plus repository: %s\n' "$ORIGIN_URL" >&2
    exit 1
    ;;
esac

if [[ "$(git branch --show-current)" != "main" ]]; then
  printf 'Switch to personal main before creating a source snapshot.\n' >&2
  exit 1
fi

if [[ ! -f HUSTLEHUB_PLAYBOOK.md ]]; then
  printf 'Missing HUSTLEHUB_PLAYBOOK.md in repository root.\n' >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  printf 'Working tree is not clean; review and commit changes first.\n' >&2
  git status --short >&2
  exit 1
fi

# Fast-forward to the exact personal origin/main commit without merging unrelated history.
git fetch origin main
git merge --ff-only origin/main

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  printf 'Working tree changed after sync; refusing snapshot.\n' >&2
  exit 1
fi

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  printf 'Local main differs from origin/main; refusing snapshot.\n' >&2
  exit 1
fi

mkdir -p "$SNAPSHOT_OUTPUT_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
PLAYBOOK_PATH="$SNAPSHOT_OUTPUT_DIR/HustleHub_Engineering_Playbook_${STAMP}.md"
cp HUSTLEHUB_PLAYBOOK.md "$PLAYBOOK_PATH"

# Capture tracked text only; exclude binary assets and known sensitive paths.
python3 - "$REPO_ROOT" "$SNAPSHOT_OUTPUT_DIR" "$PLAYBOOK_PATH" "$STAMP" <<'PY'
from datetime import datetime
from hashlib import sha256
from pathlib import Path
import re
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
output_dir = Path(sys.argv[2]).expanduser().resolve()
playbook = Path(sys.argv[3])
stamp = sys.argv[4]


def git(*args):
    return subprocess.run(
        ['git', *args], cwd=root, check=True, capture_output=True
    ).stdout.decode('utf-8', errors='replace').strip()


# Keep executable code, configuration templates, and project documentation.
allowed_extensions = {
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.css', '.scss',
    '.json', '.md', '.mmd', '.html', '.xml', '.yml', '.yaml', '.toml',
    '.properties', '.txt', '.sql', '.sh', '.py', '.c', '.h', '.cs', '.java', '.kt', '.conf',
}
allowed_names = {
    '.gitignore', '.dockerignore', '.editorconfig', '.nvmrc', '.env.example',
    'Dockerfile', 'Makefile', 'Procfile', 'LICENSE',
}
excluded_names = {
    'postman_environment.json', 'part3_security_environment.json',
    'credentials.json', 'service-account.json', 'serviceAccount.json',
    'firebase-adminsdk.json', '.npmrc', '.pypirc',
}
excluded_folders = {
    'node_modules', '.git', 'dist', 'build', 'coverage',
    '.venv', 'venv', '.cache', 'playwright-report', 'test-results',
    '__pycache__', '.next', 'certs', '.scannerwork',
}

# Remove common credential formats while retaining the surrounding logic.
patterns = [
    (re.compile(r'ghp_[A-Za-z0-9]{20,}'), '[REDACTED_GITHUB_TOKEN]'),
    (re.compile(r'github_pat_[A-Za-z0-9_]{20,}'), '[REDACTED_GITHUB_TOKEN]'),
    (re.compile(r'glpat-[A-Za-z0-9_-]{16,}'), '[REDACTED_ACCESS_TOKEN]'),
    (re.compile(r'AIza[0-9A-Za-z_-]{25,}'), '[REDACTED_API_KEY]'),
    (re.compile(r'sk-[A-Za-z0-9_-]{24,}'), '[REDACTED_API_KEY]'),
    (re.compile(r'Bearer\s+eyJ[A-Za-z0-9._-]{30,}', re.I), 'Bearer [REDACTED_JWT]'),
    (re.compile(r'mongodb(?:\+srv)?://[^\s\x22\x27<>]+', re.I), '[REDACTED_DATABASE_URI]'),
    (re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'), '[REDACTED_PRIVATE_KEY_HEADER]'),
]
credential_line = re.compile(
    r'^\s*(?:[-*]\s*)?(?:\*\*)?(?:admin|demo)?\s*'
    r'(?:password|api key|grafana token|sonar token|jwt secret|mongo uri)\b'
    r'(?:\*\*)?\s*[:=]\s*\S+',
    re.I,
)
credential_table = re.compile(
    r'^\s*\|\s*(?:\*\*)?(?:admin\s*)?'
    r'(?:password|api[ _-]?key|access[ _-]?token|jwt[ _-]?secret|'
    r'mongo[ _-]?uri|grafana[ _-]?token|sonar[ _-]?token)'
    r'(?:\*\*)?\s*\|',
    re.I,
)

tracked = sorted(filter(None, git('ls-files', '-z').split('\x00')))
captured, excluded, redactions = [], [], []

for rel in tracked:
    path = Path(rel)
    name = path.name
    lower = name.lower()
    if (
        any(part in excluded_folders for part in path.parts[:-1])
        or path.parts[0] == 'evidence'
        or (lower.startswith('.env') and lower != '.env.example')
        or name in excluded_names
        or lower.endswith(('.pem', '.key', '.p12', '.pfx', '.crt', '.cer'))
        or 'private-key' in lower or 'service-account' in lower
    ):
        excluded.append((rel, 'sensitive path or evidence asset'))
        continue

    if path.suffix.lower() not in allowed_extensions and name not in allowed_names:
        excluded.append((rel, 'non-text or other file type'))
        continue

    try:
        raw = (root / path).read_bytes()
        if len(raw) > 2_000_000 or b'\x00' in raw:
            excluded.append((rel, 'large or binary'))
            continue
        contents = raw.decode('utf-8')
    except (OSError, UnicodeDecodeError):
        excluded.append((rel, 'unreadable or non-UTF-8'))
        continue

    lines = []
    for line_no, line in enumerate(contents.splitlines(), 1):
        clean = line
        if path.suffix.lower() in {'.md', '.txt'} and (
            credential_line.search(clean) or credential_table.search(clean)
        ):
            clean = '[REDACTED_CREDENTIAL_LINE]'
        else:
            for pattern, replacement in patterns:
                clean = pattern.sub(replacement, clean)
        if clean != line:
            redactions.append((rel, line_no))
        lines.append(clean)
    captured.append((rel, '\n'.join(lines)))

head = git('rev-parse', 'HEAD')
remote_head = git('rev-parse', 'origin/main')
if head != remote_head:
    raise SystemExit('Source changed after initial sync. No source snapshot written.')

output = output_dir / f'HustleHub_Personal_Source_Snapshot_{stamp}.txt'
with output.open('w', encoding='utf-8') as out:
    out.write('HUSTLEHUB+ | PERSONAL MAIN | SOURCE-OF-TRUTH SNAPSHOT\n')
    out.write('=' * 78 + '\n')
    out.write(f'Created (local): {datetime.now().astimezone().isoformat()}\n')
    out.write(f'Personal repository: {git("config", "--get", "remote.origin.url")}\n')
    out.write(f'Branch: {git("branch", "--show-current")}\n')
    out.write(f'HEAD / origin/main: {head}\n')
    out.write(f'Tracked files: {len(tracked)}\n')
    out.write(f'Text source files: {len(captured)}\n')
    out.write(f'Excluded file contents: {len(excluded)}\n')
    out.write(f'Redacted source lines: {len(redactions)}\n')
    out.write('Snapshot from a clean, synchronized personal Git working tree.\n')
    out.write('Binary evidence is represented by its filename in the manifest only.\n')
    out.write('No ignored local environments, certificate contents, or secrets are intended to be included.\n')
    out.write('Verify the redaction report before sharing; automated filtering is not a guarantee.\n\n')
    out.write('HUSTLEHUB ENGINEERING PLAYBOOK AND NEXT-CHAT INSTRUCTIONS\n')
    out.write('-' * 78 + '\n')
    out.write(playbook.read_text(encoding='utf-8') + '\n\n')
    out.write('RECENT GIT HISTORY (latest 80 subjects)\n')
    out.write('-' * 78 + '\n')
    out.write(git('log', '--format=%h %s', '-80') + '\n\n')
    out.write('TRACKED FILE MANIFEST (filenames only)\n')
    out.write('-' * 78 + '\n')
    out.write('\n'.join(tracked) + '\n\n')
    out.write('EXCLUDED FILE CONTENTS\n')
    out.write('-' * 78 + '\n')
    out.write('\n'.join(f'{rel} | {reason}' for rel, reason in excluded) + '\n\n')
    out.write('SOURCE SAFETY REDACTIONS (filename and line only)\n')
    out.write('-' * 78 + '\n')
    out.write('\n'.join(f'{rel}:{line}' for rel, line in redactions) or '(none)')
    out.write('\n\nCOMPLETE TRACKED TEXT SOURCE\n' + '=' * 78 + '\n')
    for rel, contents in captured:
        out.write(f'\n===== BEGIN FILE: {rel} =====\n')
        out.write(contents + '\n')
        out.write(f'===== END FILE: {rel} =====\n')

print('\nPERSONAL HUSTLEHUB+ SNAPSHOT CREATED')
print(f'Repository: {root}')
print(f'Commit: {head}')
print(f'Snapshot: {output}')
print(f'Playbook: {playbook}')
print(f'Text files: {len(captured)} | Excluded: {len(excluded)} | Redactions: {len(redactions)}')
print(f'SHA-256: {sha256(output.read_bytes()).hexdigest()}')
print('Review the snapshot for secrets before uploading it to the next chat.')
PY
