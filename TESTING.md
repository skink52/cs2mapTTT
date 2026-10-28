# In-game test list (assume passed unless reported failed)

Setup: 3+ humans (or 2 + `MIN_PLAYERS 2` for a look), `bot_quota 0`, map with both entities.

1. Console shows `[ttt] loaded; HUD found`. HUD role box visible, hidden while Tab is held.
2. Prep: no damage; dying respawns; random primary given once.
3. Roles dealt after 25 s; traitors see each other on the HUD; detective tinted blue with a Zeus.
4. Killing a player: killfeed shows no killer (world death). Killer's score changes by ±1.
5. E on a body: global message with name and role. Detective gets weapon/time and a DNA line that points at the killer.
6. Double-tap F as traitor: shop opens, W/S/E work, purchases apply (armor, assassin knife one-hit, M4A1-S, radar, nades, healthshots, AWP); F closes.
7. Last traitor dies → INNOCENTS WIN, round ends with CT win; all innocents die → TRAITORS WIN with T win.
8. Clock: 3:30 + 20 s per innocent death; time out → innocents win.
9. Karma drops after team damage; next round's damage scaled.
11. Hold E on a crate: it floats in front of you and follows; E drops, R throws; standing on it drops it.
12. With the body template: a death leaves one ragdoll (no second client ragdoll, no tiny one), it can be carried, and E on it still identifies it.
10. Late joiner during the round spectates; reconnect doesn't keep an old role.

Unverified mechanics to watch: velocity on `prop_ragdoll` (moves the whole body?), `SetModelScale(0.02)` hiding the client ragdoll, `PREVENT_DEATH` + world kill (does the victim ever stay on 1 hp?), `SetMoveType(NONE)` while shopping,
`FireWinCondition` reasons, voice cvars, `SHOP_CURSOR` clicks, `KILLFEED_MASK` vs CS2's killfeed layer.
