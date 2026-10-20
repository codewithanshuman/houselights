#!/bin/sh
# Read-only, unprivileged Linux host snapshot. No package installation, process
# arguments, environment dumps, service restarts, network probes or file writes.
set -eu
export LC_ALL=C

section() { printf '\n%s\n' "$1"; }
section 'Architecture and logical CPUs'
uname -m
getconf _NPROCESSORS_ONLN
section 'Load averages'
uptime
section 'Memory in MiB'
if command -v free >/dev/null 2>&1; then free -m; else cat /proc/meminfo; fi
section 'Filesystem space for / and /var/lib'
df -h / /var/lib
section 'CPU, swapping and I/O sample (first row is since boot)'
if command -v vmstat >/dev/null 2>&1; then vmstat 1 5; else printf 'vmstat unavailable\n'; fi
section 'Listening TCP endpoints (no process arguments)'
if command -v ss >/dev/null 2>&1; then ss -H -ltn; else printf 'ss unavailable\n'; fi
section 'Docker availability'
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version || true
  if docker info --format 'Architecture={{.Architecture}} CPUs={{.NCPU}} MemoryBytes={{.MemTotal}} RunningContainers={{.ContainersRunning}}' 2>/dev/null; then
    docker stats --no-stream --format 'CPU={{.CPUPerc}} Memory={{.MemUsage}} PIDs={{.PIDs}}' || true
  else
    printf 'Docker daemon unavailable to this login; no privilege changes attempted.\n'
  fi
else
  printf 'Docker not installed\n'
fi
section 'Interpretation'
printf 'This short sample is not a capacity guarantee. Review metrics during normal livestream load before deployment.\n'
