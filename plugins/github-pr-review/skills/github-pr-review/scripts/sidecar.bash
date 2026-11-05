#!/usr/bin/env bash
# usage: sidecar.bash <sidecar path> init | step <name> | done <verdict> | pr|finding|verdict (values on stdin, one per line)
sidecar=$1 kind=$2
case $kind in
  init) mkdir -p "$(dirname "$sidecar")" && : > "$sidecar" ;;
  step) jq -nc --arg name "$3" '{kind:"step",name:$name}' >> "$sidecar" ;;
  done) jq -nc --arg verdict "$3" '{kind:"done",verdict:$verdict}' >> "$sidecar" ;;
  pr) jq -Rnc '[inputs] as [$number,$title,$url,$head] | {kind:"pr",number:($number|tonumber),title:$title,url:$url,head:$head}' >> "$sidecar" ;;
  finding) jq -Rnc '[inputs] as [$id,$tier,$path,$line,$claim] | {kind:"finding",id:($id|tonumber),tier:$tier,path:$path,line:($line|tonumber),claim:$claim}' >> "$sidecar" ;;
  verdict) jq -Rnc '[inputs] as [$id,$kept,$why] | {kind:"verdict",id:($id|tonumber),kept:($kept == "true"),why:($why // "")}' >> "$sidecar" ;;
  *) echo "sidecar.bash: unknown kind '$kind'" >&2; exit 2 ;;
esac
