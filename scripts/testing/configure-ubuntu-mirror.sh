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
# When the mirror does not answer after three attempts, the runner keeps its
# own APT sources: an unreachable mirror must not fail the job before any test.
if curl --fail --silent --show-error --location --connect-timeout 10 --max-time 30 \
  --retry 2 --retry-delay 5 --retry-all-errors \
  --output /dev/null "${mirror}/dists/noble-security/InRelease"; then
  printf '%s\n' "$mirror" | sudo tee /etc/apt/apt-mirrors.txt
else
  echo "::warning::Ubuntu mirror ${mirror} is unreachable; keeping the runner's APT sources."
fi
