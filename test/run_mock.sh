#!/bin/sh
# usage: sh test/run_mock.sh [path to cs2mapping clone] [extra mock options]
CM=${1:-../cs2mapping}; shift 2>/dev/null
D=$(cd "$(dirname "$0")/.." && pwd); T=$(mktemp -d)
echo '[{"name":"ttt_hud","cls":"custom_hud_layout","origin":[0,0,0],"angles":[0,0,0]},{"name":"ttt_params","cls":"info_map_parameters","origin":[0,0,0],"angles":[0,0,0]}]' > "$T/ents.json"
JS="$D/addon/maps/scripts/ttt.js"; HUD="$D/addon/panorama/layout/custom_game/ttt_hud.xml"
sh "$CM/create/test/tscheck.sh" "$JS" || exit 1
for o in "players=16 seconds=900 seed=5 held churn" "players=24 seconds=900 seed=9 silent unassigned resetfirst" \
         "players=64 seconds=600 seed=2 held churn hudwipe" "players=8 seconds=300 warmup norespawn" "players=2 seconds=200"; do
  echo "== $o"; node "$CM/create/test/mock_point_script.mjs" "$JS" "$T/ents.json" $o hud="$HUD" "$@" | grep -E "^rounds|^script time|^OK|ERRORS|PROBLEMS" || exit 1
done
