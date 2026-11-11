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
curl --fail --silent --show-error --location --connect-timeout 10 --max-time 30 \
  --output /dev/null "${mirror}/dists/noble-security/InRelease"
printf '%s\n' "$mirror" | sudo tee /etc/apt/apt-mirrors.txt
