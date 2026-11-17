#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Ubuntu mirror configuration is restricted to GitHub Actions runners." >&2
  exit 1
fi

# Linux Kernel Archives mirrors Ubuntu's signed archive. Keep the runner's
# existing APT sources, suites and Ubuntu signing key configuration intact.
mirror='https://mirrors.edge.kernel.org/ubuntu'
test -f /etc/apt/apt-mirrors.txt
# The mirror goes first and the runner's own sources stay behind it as lower
# priorities: APT falls back to them file by file when the mirror stops
# answering, during the probe or in the middle of an installation.
if curl --fail --silent --show-error --location --connect-timeout 10 --max-time 30 \
  --retry 2 --retry-delay 5 --retry-all-errors \
  --output /dev/null "${mirror}/dists/noble-security/InRelease"; then
  runner_sources="$(awk 'NF { print $1 "\tpriority:" NR + 1 }' /etc/apt/apt-mirrors.txt)"
  printf '%s\tpriority:1\n%s\n' "$mirror" "$runner_sources" | sudo tee /etc/apt/apt-mirrors.txt
else
  echo "::warning::Ubuntu mirror ${mirror} is unreachable; keeping the runner's APT sources."
fi
