#!/usr/bin/env sh
set -eu

hook_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
root="${CODEX_PROJECT_DIR:-$hook_root}"
cd "$root"

input_file=$(mktemp "${TMPDIR:-/tmp}/code-moniker-hook.XXXXXX")
trap 'rm -f "$input_file"' EXIT HUP INT TERM
cat > "$input_file"
files=$('/Users/user/.cargo/bin/code-moniker' agent tool-files codex "$input_file" 2>/dev/null) || {
	printf '%s\n' 'code-moniker hook could not inspect tool input' >&2
	exit 2
}

scope='.'
set -- "$scope"
while IFS= read -r file; do
	[ -n "$file" ] || continue
	# Tool calls also report paths they deleted or renamed away; the check has
	# nothing to read there. Accept absolute, project-relative, and
	# scope-relative paths; `check --file` resolves the same three forms.
	case "$file" in
		/*) existing_file="$file" ;;
		*)
			existing_file="$file"
			[ -f "$existing_file" ] || existing_file="$scope/$file"
			;;
	esac
	[ -f "$existing_file" ] || continue
	case "$existing_file" in
		*.ts|*.tsx|*.mts|*.cts)
			if ! HALL_DISPATCH_FILE="$existing_file" "$hook_root/node_modules/.bin/vitest" run "$hook_root/tests/meta/exhaustive-dispatch.test.mjs" --root "$hook_root" >&2; then
				exit 2
			fi
			;;
	esac
	set -- "$@" --file "$file"
done <<CODE_MONIKER_FILES
$files
CODE_MONIKER_FILES

if [ "$#" -eq 1 ]; then
	exit 0
fi

exec '/Users/user/.cargo/bin/code-moniker' check --rules '.code-moniker.toml' --format codex-hook --max-violations 10 "$@"
