# cs2mapTTT: Trouble in Terrorist Town for any CS2 map

> **AI-generated code.** Written by Claude (Anthropic) for skink52. MIT licence. Tested on a mock engine only until the TESTING notes say otherwise.

One cs_script (`ttt.js`) plus an optional HUD. No server plugins. Works on any map once the map has a `point_script` pointing at it.

## Install (per map)

1. Copy `addon/` into `content\csgo_addons\<your addon>\` (merges into `maps\scripts\` and `panorama\`).
2. Add to the map (Hammer, anywhere):
   - `point_script`: targetname `ttt_script`, cs_script `maps/scripts/ttt.vjs`
   - `custom_hud_layout`: targetname `ttt_hud`, layout `panorama/layout/custom_game/ttt_hud.vxml` (optional but strongly recommended: roles, shop, messages)
   - `point_template` `ttt_body_tpl` → `prop_ragdoll` `ttt_body_src` (optional: carryable server-side bodies; keys in `tools/ttt_patch.json`)
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
| Killers hidden | During the round every lethal player hit becomes a world kill: the killfeed shows only the death. Score changes (±1 per kill, +1 for surviving winners) are held back and added at round end, so the scoreboard leaks nothing. |
| Carry | Hold E on a physics prop or body to pick it up; E drops, R throws. Can't stand on what you hold. |
| Bodies | With the body template, every death spawns a server-side ragdoll of the player's model (the client ragdoll is shrunk away), so bodies can be dragged and hidden. |
| Chat | `!ttt` shows controls. |

Tunables: the `CONFIG` block at the top of `ttt.js` (times, ratios, shop items, `APPLY_CVARS` off to keep a server's own config).

## Limits (CS2)

- The killfeed itself can't be removed by a map. On a CounterStrikeSharp server a tiny plugin can: a `HookMode.Pre` `EventPlayerDeath` handler setting
  `info.DontBroadcast = true` stops clients getting the death event (no killfeed); the server still sees it, and the scoreboard comes from networked
  player stats, so it keeps updating (expected, unverified in CS2). With that plugin, set `HIDE_KILLER: false` so kills credit the real killer.
- `HIDE_NATIVE_HUD` (on): the pawn input `SetHUDVisibility false` hides CS2's whole HUD (killfeed included, as the Dogfight addon does); the TTT HUD then draws its own health, armor, ammo and crosshair. Set false to keep CS2's HUD.
- Without the plugin: `HUD_IN_KILLFEED` (on) puts the HUD panel over the top-right killfeed area (unverified that CS2 draws it above the feed; set false for the left-side layout). `TRY_HIDE_KILLFEED` sends the client cvar `cl_drawhud_force_deathnotices -1` (unreliable, may persist on the client), off by default.
- Without the body template, ragdolls are client-side: bodies are found by looking at where the player died and can't be moved.
- Bots shoot everyone (`mp_teammates_are_enemies 1`); use `bot_quota 0`.
- Scoreboard shows who is dead. Dead/alive voice: `sv_deadtalk 0`, `sv_talk_enemy_dead 0` (cvar names unverified in CS2).
- Plugins that force teams, respawn, spawn protection or TK punishment break it.

## Test

`sh test/run_mock.sh <path to cs2mapping clone>`: type-check plus mock-engine scenarios (churn, silent slot changes, warmup, 64 players).
