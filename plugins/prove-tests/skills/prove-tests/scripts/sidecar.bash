#!/usr/bin/env bash
# usage: sidecar.bash <sidecar path> mutant (test and result on stdin, one per line)
sidecar=$1 kind=$2
case $kind in
  mutant) jq -Rnc '[inputs] as [$test,$result] | {kind:"mutant",test:$test,result:$result}' >> "$sidecar" ;;
  *) echo "sidecar.bash: unknown kind '$kind'" >&2; exit 2 ;;
esac
