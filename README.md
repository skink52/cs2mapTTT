# cs2mapTTT: Trouble in Terrorist Town for any CS2 map

> **AI-generated code.** Written by Claude (Anthropic) for skink52. MIT licence. Tested on a mock engine only until the TESTING notes say otherwise.

One cs_script (`ttt.js`) plus an optional HUD. No server plugins. Works on any map once the map has a `point_script` pointing at it.

## Install (per map)

1. Copy `addon/` into `content\csgo_addons\<your addon>\` (merges into `maps\scripts\` and `panorama\`).
2. Add to the map (Hammer, anywhere):
   - `point_script`: targetname `ttt_script`, cs_script `maps/scripts/ttt.vjs`
   - `custom_hud_layout`: targetname `ttt_hud`, layout `panorama/layout/custom_game/ttt_hud.vxml` (optional but strongly recommended: roles, shop, messages)
   - or run `python3 patch_vmap.py <map.vmap> <out.vmap> "" tools/ttt_patch.json` from [cs2mapping/create](https://github.com/skink52/cs2mapping/tree/main/create) (re-runnable).
3. Build the map. HUD: also `resourcecompiler -f -i` the xml and css (the command-line build doesn't compile panorama).

A map's `info_map_parameters` is used to end rounds if present; otherwise the round clock is used.

## Gameplay

| | |
|---|---|
| Prep (25 s) | No damage, dead respawn, everyone gets a random primary. |
| Roles | 25% traitors (min 1), detectives from 8 players (1 per 8). Detectives are public (blue tint, Zeus). |
| Win | All traitors dead → innocents. All others dead → traitors. Clock out → innocents. |
| Clock | Haste: 3:30 + 20 s per innocent death, capped at 6:00. |
| Bodies | E on a body: everyone learns name + role. Detective: weapon, time, and a 45 s DNA trail to the killer. |
| Shop | Traitor/detective: double-tap F (inspect). W/S select, E buy, F/jump close. Credits from deaths. |
| Karma | Damaging your own side costs karma; low karma scales your damage down (min 40%). |
| Killers hidden | Lethal player hits are turned into world kills: killfeed shows the death, never the killer. TTT score via scoreboard score. |
| Chat | `!ttt` shows controls. |

Tunables: the `CONFIG` block at the top of `ttt.js` (times, ratios, shop items, `APPLY_CVARS` off to keep a server's own config).

## Limits (CS2)

- The killfeed itself can't be removed by a map. `TRY_HIDE_KILLFEED` sends the client cvar `cl_drawhud_force_deathnotices -1` (unreliable from script, and may stay set on the player's client after leaving), off by default. `KILLFEED_MASK` draws a black box over the feed area as a test; CS2's own HUD normally draws over custom HUDs.
- Ragdolls are client-side: bodies are found by looking at where the player died.
- Bots shoot everyone (`mp_teammates_are_enemies 1`); use `bot_quota 0`.
- Scoreboard shows who is dead. Dead/alive voice: `sv_deadtalk 0`, `sv_talk_enemy_dead 0` (cvar names unverified in CS2).
- Plugins that force teams, respawn, spawn protection or TK punishment break it.

## Test

`sh test/run_mock.sh <path to cs2mapping clone>`: type-check plus mock-engine scenarios (churn, silent slot changes, warmup, 64 players).
