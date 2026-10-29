// ttt.js: Trouble in Terrorist Town for any CS2 map, one cs_script. AI-generated (Claude), MIT. github.com/skink52/cs2mapTTT
import { Instance, CSPlayerPawn, CSPlayerController, CustomHudLayout, PointTemplate, BaseModelEntity, CSGearSlot, CSWeaponType, CSInputs,
         CSDamageFlags, CSDamageTypes, CSRoundEndReason, CSMoveType } from "cs_script/point_script";

const CONFIG = {
    APPLY_CVARS: true,
    PREP_TIME: 25,
    ROUND_TIME: 360,
    HASTE_START: 210,
    HASTE_PER_DEATH: 20,
    POST_TIME: 8,
    MIN_PLAYERS: 3,
    TRAITOR_RATIO: 0.25,
    DETECTIVE_MIN_PLAYERS: 8,
    DETECTIVE_RATIO: 0.125,
    HIDE_KILLER: true,
    TRY_HIDE_KILLFEED: false,
    HUD_IN_KILLFEED: true,
    HIDE_NATIVE_HUD: true,
    GIVE_PRIMARY: true,
    PRIMARIES: ["weapon_ak47", "weapon_m4a1", "weapon_famas", "weapon_galilar", "weapon_mp7", "weapon_ump45", "weapon_mac10",
                "weapon_mp9", "weapon_p90", "weapon_nova", "weapon_xm1014", "weapon_ssg08"],
    BODY_RANGE: 110,
    BODY_CONE: 0.8,
    DNA_TIME: 45,
    RADAR_TIME: 60,
    KARMA_START: 1000, KARMA_MAX: 1000, KARMA_MIN_MULT: 0.4,
    KARMA_HURT: 0.5, KARMA_KILL: 60, KARMA_GOOD_KILL: 15, KARMA_CLEAN_ROUND: 40,
    TRAITOR_CREDITS: 2, DETECTIVE_CREDITS: 1, CREDIT_EVERY_N_DEATHS: 3,
    SHOP_CURSOR: false,
    SHOP_TIMEOUT: 20,
    CHAT_ANNOUNCE: true,
    NOHUD_TRAITOR_ITEM: "weapon_decoy",
    DETECTIVE_TINT: { r: 120, g: 160, b: 255, a: 255 },
    HUD_NAME: "ttt_hud",
    HUD_BUDGET: 600,
    CARRY: true,
    CARRY_CLASSES: ["prop_physics", "prop_physics_multiplayer", "prop_physics_override", "prop_ragdoll", "func_physbox"],
    CARRY_RANGE: 110, CARRY_HOLD_TIME: 0.35, CARRY_DIST: 70, CARRY_GAIN: 12, CARRY_MAX_SPEED: 900, CARRY_BREAK_DIST: 200, CARRY_THROW: 550,
    BODY_TEMPLATE: "ttt_body_tpl",
    BODY_MAX: 48,
    HIDE_CLIENT_RAGDOLL: true,
};

const SHOP = {
    2: [
        { id: "armor", name: "Kevlar + helmet", cost: 1 },
        { id: "knife", name: "Assassin knife (one hit)", cost: 1 },
        { id: "m4s", name: "Silenced M4A1-S", cost: 1 },
        { id: "radar", name: "Radar (" + CONFIG.RADAR_TIME + "s)", cost: 1 },
        { id: "nades", name: "HE + Molotov", cost: 1 },
        { id: "heal", name: "2 x Healthshot", cost: 1 },
        { id: "awp", name: "AWP", cost: 2 },
    ],
    3: [
        { id: "armor", name: "Kevlar + helmet", cost: 1 },
        { id: "heal", name: "2 x Healthshot", cost: 1 },
        { id: "taser", name: "Zeus x27", cost: 1 },
        { id: "radar", name: "Radar (" + CONFIG.RADAR_TIME + "s)", cost: 1 },
        { id: "util", name: "Smoke + Flash", cost: 1 },
    ],
};
const SHOP_ROWS = 7;

const R_NONE = 0, R_INN = 1, R_TRA = 2, R_DET = 3;
const ROLE_NAME = ["", "INNOCENT", "TRAITOR", "DETECTIVE"];
const ROLE_CLS = ["", "stInn", "stTra", "stDet"];
const P_WAIT = 0, P_PREP = 1, P_ACTIVE = 2, P_POST = 3;
const DIRS = ["ahead", "ahead-left", "left", "behind-left", "behind", "behind-right", "right", "ahead-right"];

class PState {
    constructor(slot) {
        this.slot = slot;
        this.role = R_NONE;
        this.karma = CONFIG.KARMA_START;
        this.cleanRound = true;
        this.credits = 0;
        this.knife = false;
        this.radarUntil = 0;
        this.trackSlot = -1;
        this.trackUntil = 0;
        this.shopOpen = false;
        this.shopSel = 0;
        this.shopAt = 0;
        this.lastF = -10;
        this.prevKeys = 0;
        this.frozen = false;
        this.msg = "";
        this.msgUntil = 0;
        this.lastHit = null;
        this.pendingKill = false;
        this.name = "";
        this.hud = new Map();
        this.loadoutAt = 0;
        this.ctrl = null;
        this.hold = null;
        this.useAt = -1;
        this.grabTried = false;
        this.pendingAttacker = undefined;
        this.deathModel = "";
        this.scaled = false;
        this.scoreDelta = 0;
        this.nativeAt = 0;
        this.radarText = "";
    }
}

let players = new Map();
let phase = P_WAIT;
let phaseEnd = 0;
let roundEnded = false;
let endFallbackAt = 0;
let bodies = [];
let killQueue = [];
let deathsSinceCredit = 0;
let globalMsg = "";
let globalMsgUntil = 0;
let tick = 0;
let now = 0;
let hud = undefined;
let hudFails = 0;
let hudBudget = 0;
let killing = false;
let lastStatus = "";
let thinkStarted = false;
let activeCap = 0;
let waitAnnounced = "";
let waitAnnouncedAt = -100;

const st = (slot) => { let p = players.get(slot); if (!p) { p = new PState(slot); players.set(slot, p); } return p; };
const clean = (s) => String(s).replace(/[;"\\\n\r]/g, "").slice(0, 40);
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const say = (t) => { if (CONFIG.CHAT_ANNOUNCE) Instance.ServerCommand("say " + clean(t).slice(0, 120)); };
const log = (t) => Instance.Msg("[ttt] " + t);

function toPawn(ent) {
    if (ent instanceof CSPlayerPawn) return ent;
    if (ent instanceof CSPlayerController) return ent.GetPlayerPawn();
    return undefined;
}
function slotOf(ent) {
    try {
        if (ent instanceof CSPlayerController) return ent.GetPlayerSlot();
        if (ent instanceof CSPlayerPawn) { const c = ent.GetPlayerController(); return c ? c.GetPlayerSlot() : -1; }
    } catch (e) { }
    return -1;
}
function pawnOf(slot) {
    const c = Instance.GetPlayerController(slot);
    if (!c) return undefined;
    const p = c.GetPlayerPawn();
    return p && p.IsValid() ? p : undefined;
}
function liveControllers() {
    const out = [];
    for (const c of Instance.GetAllPlayerControllers()) {
        try { if (c && c.IsValid() && c.IsConnected()) out.push(c); } catch (e) { }
    }
    return out;
}
function isAlive(slot) { const p = pawnOf(slot); return !!p && p.IsAlive(); }
function side(role) { return role === R_TRA ? 2 : (role === R_INN || role === R_DET) ? 1 : 0; }

function applyCvars(respawn) {
    if (!CONFIG.APPLY_CVARS) return;
    Instance.ServerCommand([
        "mp_teammates_are_enemies 1", "mp_friendlyfire 1", "mp_autokick 0", "mp_respawn_immunitytime 0", "mp_freezetime 0",
        "mp_ignore_round_win_conditions 1", "mp_roundtime 15", "mp_round_restart_delay " + CONFIG.POST_TIME, "mp_give_player_c4 0",
        "mp_buy_anywhere 0", "mp_buytime 0", "mp_startmoney 0", "mp_maxmoney 0", "mp_afterroundmoney 0", "mp_playercashawards 0",
        "mp_teamcashawards 0", "mp_free_armor 0", "sv_disable_radar 1", "mp_solid_teammates 1", "mp_death_drop_gun 1",
        "sv_alltalk 1", "sv_deadtalk 0", "sv_talk_enemy_dead 0", "sv_talk_enemy_living 1", "mp_halftime 0",
        "mp_respawn_on_death_t " + (respawn ? 1 : 0), "mp_respawn_on_death_ct " + (respawn ? 1 : 0),
    ].join(";"));
}

// ------------------------------------------------------------------ HUD
function findHud() {
    if (hudFails > 5) return undefined;
    if (hud && hud.IsValid()) return hud;
    hud = undefined;
    const e = Instance.FindEntityByName(CONFIG.HUD_NAME);
    if (e instanceof CustomHudLayout) hud = e;
    else for (const h of Instance.FindEntitiesByClass("custom_hud_layout")) if (h instanceof CustomHudLayout) { hud = h; break; }
    if (hud) for (const p of players.values()) p.hud.clear();
    return hud;
}
function hudVar(p, panel, v, value) {
    const k = panel + "." + v;
    if (p.hud.get(k) === value || hudBudget <= 0) return;
    try { hud.SetDialogVariableStringForPlayer(p.slot, panel, v, value); p.hud.set(k, value); hudBudget--; }
    catch (e) { hudFails++; log("hud var failed " + e); }
}
function hudCls(p, panel, cls, on) {
    const k = panel + "#" + cls;
    if (p.hud.get(k) === on || hudBudget <= 0) return;
    try { hud.SetHasClassForPlayer(p.slot, panel, cls, on); p.hud.set(k, on); hudBudget--; }
    catch (e) { hudFails++; log("hud class failed " + e); }
}
function resetHud(slot) {
    const p = players.get(slot);
    if (p) p.hud.clear();
    if (findHud()) try { hud.ResetForPlayer(slot); } catch (e) { }
}

function dirText(from, yaw, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.0254;
    let rel = Math.atan2(dy, dx) * 180 / Math.PI - yaw;
    rel = ((rel % 360) + 540) % 360 - 180;
    const d = DIRS[((Math.round(rel / 45) % 8) + 8) % 8];
    const v = dz > 150 ? ", above" : dz < -150 ? ", below" : "";
    return Math.round(dist) + "m " + d + v;
}

function drawHud(p, c) {
    const pawn = c.GetPlayerPawn();
    const alive = !!pawn && pawn.IsValid() && pawn.IsAlive();
    hudCls(p, "Ttt", "stOn", true);
    hudCls(p, "Ttt", "stKF", CONFIG.HUD_IN_KILLFEED);
    hudCls(p, "Ttt", "stNoNat", CONFIG.HIDE_NATIVE_HUD && alive);
    if (CONFIG.HIDE_NATIVE_HUD && alive) {
        hudVar(p, "Hp", "hp", String(Math.max(0, Math.round(pawn.GetHealth()))));
        hudVar(p, "Ar", "ar", pawn.GetArmor() > 0 ? String(Math.round(pawn.GetArmor())) : "");
        let ammo = "";
        const w = pawn.GetActiveWeapon();
        if (w) {
            let t = -1;
            try { t = w.GetData().GetType(); } catch (e) { }
            ammo = t === CSWeaponType.KNIFE || t === CSWeaponType.GRENADE || t === CSWeaponType.STACKABLEITEM || t === CSWeaponType.EQUIPMENT || t < 0
                ? weaponName(w) : w.GetClipAmmo() + " / " + w.GetReserveAmmo();
        }
        hudVar(p, "Ammo", "ammo", ammo);
        hudCls(p, "Cross", "stScope", pawn.IsScoped());
    }
    let roleCls = "stSpec", role = "SPECTATING", sub = "", info = "", track = "";
    const left = phaseEnd - now;
    if (phase === P_WAIT) { roleCls = "stWait"; role = Instance.IsWarmupPeriod() ? "WARMUP" : "WAITING"; sub = "TTT starts next round"; }
    else if (phase === P_PREP) { roleCls = "stPrep"; role = "PREPARING"; sub = "Roles in " + mmss(left); }
    else {
        if (alive && p.role) { roleCls = ROLE_CLS[p.role]; role = ROLE_NAME[p.role]; }
        sub = phase === P_POST ? "Round over" : (p.role === R_TRA || !alive ? "Time " + mmss(left) : "Haste " + mmss(left));
    }
    if (phase >= P_ACTIVE) {
        if (alive && p.role === R_TRA) info = "Traitors: " + traitorNames(p.slot) + "\nCredits " + p.credits;
        else if (alive && p.role === R_DET) info = "Credits " + p.credits + "   E on a body: inspect / DNA";
        else if (!alive) info = "Traitors: " + traitorNames(-1);
    }
    if (alive) info += (info ? (p.role === R_TRA ? "   " : "\n") : "") + "Karma " + Math.round(p.karma);
    if (alive && p.trackSlot >= 0 && now < p.trackUntil) {
        const t = pawnOf(p.trackSlot);
        if (t && t.IsAlive()) track = "DNA: " + dirText(pawn.GetAbsOrigin(), pawn.GetEyeAngles().yaw, t.GetAbsOrigin()) + " (" + Math.ceil(p.trackUntil - now) + "s)";
        else p.trackUntil = 0;
    }
    if (alive && now < p.radarUntil && tick % 32 === 0) p.radarText = radarText(p, pawn);
    if (alive && now < p.radarUntil) track += (track ? "\n" : "") + (p.radarText || "");
    for (const k of ROLE_CLS.concat(["stSpec", "stWait", "stPrep"])) if (k) hudCls(p, "Ttt", k, k === roleCls);
    const K = CONFIG.HUD_IN_KILLFEED ? "K" : "";
    hudVar(p, K + "Role", "role", role);
    hudVar(p, K + "Sub", "sub", sub);
    hudVar(p, K + "Info", "info", info);
    hudVar(p, K + "Track", "track", track);
    hudVar(p, "MsgA", "msga", now < globalMsgUntil ? globalMsg : "");
    hudVar(p, "MsgB", "msgb", now < p.msgUntil ? p.msg : "");
    const items = SHOP[p.role] || [];
    const open = p.shopOpen && alive;
    hudCls(p, "ShopBox", "stOpen", open);
    if (open) {
        hudVar(p, "ShopTitle", "title", ROLE_NAME[p.role] + " SHOP - credits " + p.credits);
        for (let i = 0; i < SHOP_ROWS; i++) {
            const it = items[i];
            hudVar(p, "ShopL" + i, "row", it ? it.name + "  [" + it.cost + "]" : "");
            hudCls(p, "Shop" + i, "stSel", !!it && i === p.shopSel);
            hudCls(p, "Shop" + i, "stOff", !it || it.cost > p.credits);
        }
    }
}
function traitorNames(exceptSlot) {
    const n = [];
    for (const q of players.values()) if (q.role === R_TRA && q.slot !== exceptSlot) n.push(q.name + (isAlive(q.slot) ? "" : " (dead)"));
    return n.length ? n.join(", ") : "none";
}
function radarText(p, pawn) {
    const me = pawn.GetAbsOrigin(), yaw = pawn.GetEyeAngles().yaw, list = [];
    for (const q of players.values()) {
        if (q.slot === p.slot || !q.role || (p.role === R_TRA && q.role === R_TRA)) continue;
        const t = pawnOf(q.slot);
        if (!t || !t.IsAlive()) continue;
        const o = t.GetAbsOrigin();
        list.push({ d: (o.x - me.x) ** 2 + (o.y - me.y) ** 2 + (o.z - me.z) ** 2, o });
    }
    list.sort((a, b) => a.d - b.d);
    return "Radar " + Math.ceil(p.radarUntil - now) + "s: " + (list.slice(0, 3).map(e => dirText(me, yaw, e.o)).map((t, i) => (i === 2 ? "\n" : i ? ", " : "") + t).join("") || "nobody");
}
function tell(slot, text, secs = 6) {
    const p = st(slot); p.msg = text; p.msgUntil = now + secs;
    if (!findHud()) log("to " + p.name + ": " + text);
}
function announce(text, secs = 7) { globalMsg = text; globalMsgUntil = now + secs; say(text); }

// ------------------------------------------------------------------ rounds
function onRoundStart() {
    roundEnded = false; endFallbackAt = 0; bodies = []; heldBy.clear(); killQueue = []; deathsSinceCredit = 0; globalMsgUntil = 0;
    for (const p of players.values()) {
        if (p.role && p.cleanRound) p.karma = Math.min(CONFIG.KARMA_MAX, p.karma + CONFIG.KARMA_CLEAN_ROUND);
        p.scoreDelta = 0; p.role = R_NONE; p.credits = 0; p.knife = false; p.radarUntil = 0; p.trackUntil = 0; p.trackSlot = -1; p.cleanRound = true;
        p.lastHit = null; p.pendingKill = false; closeShop(p); p.msgUntil = 0; p.hold = null;
    }
    if (Instance.IsWarmupPeriod()) { phase = P_WAIT; applyCvars(true); return; }
    phase = P_PREP; phaseEnd = now + CONFIG.PREP_TIME;
    applyCvars(true);
    Instance.SetRoundRemainingTime(CONFIG.PREP_TIME + CONFIG.ROUND_TIME + 20);
    for (const c of liveControllers()) { const p = st(c.GetPlayerSlot()); p.loadoutAt = now + 0.5; tint(c.GetPlayerPawn(), false); }
    announce("Preparing - roles are dealt in " + CONFIG.PREP_TIME + "s", 5);
}

function startActive() {
    const cands = [];
    for (const c of liveControllers()) {
        const pawn = c.GetPlayerPawn(), team = c.GetTeamNumber();
        if ((team === 2 || team === 3) && pawn && pawn.IsValid() && pawn.IsAlive()) cands.push(c);
    }
    if (cands.length < CONFIG.MIN_PLAYERS) {
        phaseEnd = now + 5;
        const w = cands.length + "/" + CONFIG.MIN_PLAYERS;
        if (w !== waitAnnounced || now - waitAnnouncedAt > 60) { waitAnnounced = w; waitAnnouncedAt = now; announce("Waiting for players (" + w + ")", 8); }
        else globalMsgUntil = now + 6;
        return;
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const nT = Math.max(1, Math.floor(cands.length * CONFIG.TRAITOR_RATIO));
    const nD = cands.length >= CONFIG.DETECTIVE_MIN_PLAYERS ? Math.max(1, Math.floor(cands.length * CONFIG.DETECTIVE_RATIO)) : 0;
    const hasHud = !!findHud();
    cands.forEach((c, i) => {
        const p = st(c.GetPlayerSlot()); p.name = clean(c.GetPlayerName()); p.ctrl = c;
        p.role = i < nT ? R_TRA : i < nT + nD ? R_DET : R_INN;
        p.credits = p.role === R_TRA ? CONFIG.TRAITOR_CREDITS : p.role === R_DET ? CONFIG.DETECTIVE_CREDITS : 0;
        const pawn = c.GetPlayerPawn();
        if (p.role === R_DET) { tint(pawn, true); give(pawn, "weapon_taser"); }
        if (p.role === R_TRA && !hasHud && CONFIG.NOHUD_TRAITOR_ITEM) give(pawn, CONFIG.NOHUD_TRAITOR_ITEM);
        tell(p.slot, p.role === R_TRA ? "You are a TRAITOR. Kill the innocents. Double-tap F for the shop."
            : p.role === R_DET ? "You are the DETECTIVE. Find the traitors. Double-tap F for the shop."
            : "You are INNOCENT. Survive and find the traitors.", 8);
    });
    phase = P_ACTIVE; activeCap = now + CONFIG.ROUND_TIME; phaseEnd = Math.min(activeCap, now + CONFIG.HASTE_START); waitAnnounced = "";
    applyCvars(false);
    Instance.SetRoundRemainingTime(phaseEnd - now + 20);
    const dets = cands.filter(c => st(c.GetPlayerSlot()).role === R_DET).map(c => st(c.GetPlayerSlot()).name);
    announce("Roles dealt: " + nT + " traitor" + (nT > 1 ? "s" : "") + (dets.length ? ". Detective: " + dets.join(", ") : ""), 7);
    if (!hasHud && CONFIG.NOHUD_TRAITOR_ITEM) say("No TTT HUD on this map: traitors were given a " + CONFIG.NOHUD_TRAITOR_ITEM.replace("weapon_", ""));
}

function checkWin() {
    if (phase !== P_ACTIVE || roundEnded) return;
    let inn = 0, tra = 0;
    for (const p of players.values()) {
        if (!p.role || p.pendingKill || !isAlive(p.slot)) continue;
        if (p.role === R_TRA) tra++; else inn++;
    }
    if (tra === 0) endRound(R_INN, "All traitors are dead");
    else if (inn === 0) endRound(R_TRA, "The traitors killed everyone");
    else if (now >= phaseEnd) endRound(R_INN, "Time ran out");
}

function endRound(winner, why) {
    roundEnded = true; phase = P_POST; phaseEnd = now + CONFIG.POST_TIME;
    for (const p of players.values()) {
        closeShop(p);
        let d = p.scoreDelta + (p.role && side(p.role) === side(winner) && isAlive(p.slot) ? 1 : 0);
        p.scoreDelta = 0;
        if (d) { const c = Instance.GetPlayerController(p.slot); if (c) c.AddScore(d); }
    }
    announce((winner === R_TRA ? "TRAITORS WIN. " : "INNOCENTS WIN. ") + why + ". Traitors: " + traitorNames(-1), CONFIG.POST_TIME + 2);
    const reason = winner === R_TRA ? CSRoundEndReason.TERRORISTS_WIN : CSRoundEndReason.CTS_WIN;
    Instance.ServerCommand("mp_ignore_round_win_conditions 0;mp_default_team_winner_no_objective " + (winner === R_TRA ? 2 : 3));
    const imp = Instance.FindEntitiesByClass("info_map_parameters")[0];
    if (imp) Instance.EntFireAtTarget({ target: imp, input: "FireWinCondition", value: reason, delay: 0.1 });
    endFallbackAt = now + (imp ? 3 : 0.2);
}

// ------------------------------------------------------------------ players
function nativeHud(pawn, visible) {
    try { if (pawn && pawn.IsValid()) Instance.EntFireAtTarget({ target: pawn, input: "SetHUDVisibility", value: visible }); } catch (e) { }
}
function tint(pawn, det) {
    try { if (pawn && pawn.IsValid()) pawn.SetColor(det ? CONFIG.DETECTIVE_TINT : { r: 255, g: 255, b: 255, a: 255 }); } catch (e) { }
}
function give(pawn, cls) {
    if (!pawn || !pawn.IsValid() || !pawn.IsAlive()) return;
    if (cls !== "weapon_healthshot" && pawn.FindWeapon(cls)) return;
    pawn.GiveNamedItem(cls, false);
}
function giveLoadout(pawn) {
    if (!CONFIG.GIVE_PRIMARY || !pawn || !pawn.IsValid() || !pawn.IsAlive()) return;
    if (pawn.FindWeaponBySlot(CSGearSlot.RIFLE)) return;
    pawn.GiveNamedItem(CONFIG.PRIMARIES[Math.floor(Math.random() * CONFIG.PRIMARIES.length)], false);
}
function freeze(p, pawn, on) {
    if (p.frozen === on) return;
    p.frozen = on;
    try { if (pawn && pawn.IsValid()) pawn.SetMoveType(on ? CSMoveType.NONE : CSMoveType.WALK); } catch (e) { }
}
function closeShop(p) {
    if (!p.shopOpen && !p.frozen) return;
    p.shopOpen = false;
    freeze(p, pawnOf(p.slot), false);
    if (CONFIG.SHOP_CURSOR && findHud()) try { hud.SetInputCaptureEnabled(p.slot, false); } catch (e) { }
}
function openShop(p, pawn) {
    if (!findHud() || !SHOP[p.role] || phase !== P_ACTIVE) return;
    p.shopOpen = true; p.shopSel = 0; p.shopAt = now;
    if (CONFIG.SHOP_CURSOR) { try { hud.SetInputCaptureEnabled(p.slot, true); } catch (e) { } }
    else if (pawn.GetGroundEntity()) freeze(p, pawn, true);
}
function buy(p, pawn, idx) {
    const it = (SHOP[p.role] || [])[idx];
    if (!it) return;
    if (it.cost > p.credits) { tell(p.slot, "Not enough credits", 3); return; }
    p.credits -= it.cost;
    switch (it.id) {
        case "armor": pawn.SetArmor(100); pawn.SetHasHelmet(true); break;
        case "knife": p.knife = true; break;
        case "m4s": { const w = pawn.FindWeaponBySlot(CSGearSlot.RIFLE); if (w) pawn.DropWeapon(w); give(pawn, "weapon_m4a1_silencer"); break; }
        case "awp": { const w = pawn.FindWeaponBySlot(CSGearSlot.RIFLE); if (w) pawn.DropWeapon(w); give(pawn, "weapon_awp"); break; }
        case "radar": p.radarUntil = now + CONFIG.RADAR_TIME; p.radarText = ""; break;
        case "nades": give(pawn, "weapon_hegrenade"); give(pawn, "weapon_molotov"); break;
        case "heal": pawn.GiveNamedItem("weapon_healthshot", false); pawn.GiveNamedItem("weapon_healthshot", false); break;
        case "taser": give(pawn, "weapon_taser"); break;
        case "util": give(pawn, "weapon_smokegrenade"); give(pawn, "weapon_flashbang"); break;
    }
    tell(p.slot, "Bought " + it.name, 3);
}

const KEYS = [CSInputs.FORWARD, CSInputs.BACK, CSInputs.USE, CSInputs.LOOK_AT_WEAPON, CSInputs.JUMP, CSInputs.RELOAD];
function playerInput(p, c, pawn) {
    if (phase === P_WAIT && !CONFIG.CARRY) { p.prevKeys = 0; return; }
    let keys = 0;
    if (p.shopOpen) { for (let i = 0; i < 5; i++) if (pawn.IsInputPressed(KEYS[i])) keys |= 1 << i; }
    else {
        if (pawn.IsInputPressed(CSInputs.USE)) keys |= 4;
        if (SHOP[p.role] && phase === P_ACTIVE && pawn.IsInputPressed(CSInputs.LOOK_AT_WEAPON)) keys |= 8;
        if (p.hold && pawn.IsInputPressed(CSInputs.RELOAD)) keys |= 32;
    }
    const down = keys & ~p.prevKeys;
    p.prevKeys = keys;
    if (p.shopOpen) {
        const n = (SHOP[p.role] || []).length;
        if (down & 1) p.shopSel = (p.shopSel + n - 1) % n;
        if (down & 2) p.shopSel = (p.shopSel + 1) % n;
        if (down & 4) buy(p, pawn, p.shopSel);
        if ((down & 8) || (down & 16) || now - p.shopAt > CONFIG.SHOP_TIMEOUT) closeShop(p);
        return;
    }
    if (down & 8) {
        if (now - p.lastF < 0.45 && SHOP[p.role]) { openShop(p, pawn); p.lastF = -10; } else p.lastF = now;
    }
    if (p.hold) {
        if (down & 4) { drop(p, null); p.grabTried = true; }
        else if (down & 32) drop(p, pawn);
    } else if (down & 4) {
        p.useAt = now; p.grabTried = false;
        if (phase >= P_ACTIVE) searchBody(p, pawn);
    } else if ((keys & 4) && CONFIG.CARRY && !p.grabTried && now - p.useAt >= CONFIG.CARRY_HOLD_TIME) {
        p.grabTried = true; tryGrab(p, pawn);
    }
    if (p.hold) carry(p, pawn);
}

// ------------------------------------------------------------------ carrying (props and bodies)
const heldBy = new Map();
function forward(a) {
    const py = a.pitch * Math.PI / 180, yw = a.yaw * Math.PI / 180;
    return { x: Math.cos(py) * Math.cos(yw), y: Math.cos(py) * Math.sin(yw), z: -Math.sin(py) };
}
function tryGrab(p, pawn) {
    const eye = pawn.GetEyePosition(), f = forward(pawn.GetEyeAngles()), r = CONFIG.CARRY_RANGE;
    const tr = Instance.TraceLine({ start: eye, end: { x: eye.x + f.x * r, y: eye.y + f.y * r, z: eye.z + f.z * r }, ignoreEntity: pawn });
    let e = tr.didHit ? tr.hitEntity : undefined;
    if (!e || e instanceof CSPlayerPawn || e.IsWorld()) return;
    if (!CONFIG.CARRY_CLASSES.includes(e.GetClassName()) && !bodies.some(b => b.ent === e)) return;
    if (heldBy.has(e) || pawn.GetGroundEntity() === e) return;
    p.hold = e; heldBy.set(e, p.slot);
}
function drop(p, throwerPawn) {
    const e = p.hold;
    p.hold = null;
    if (!e) return;
    heldBy.delete(e);
    if (!throwerPawn) return;
    try {
        const f = forward(throwerPawn.GetEyeAngles()), v = throwerPawn.GetAbsVelocity(), t = CONFIG.CARRY_THROW;
        e.Teleport({ velocity: { x: v.x + f.x * t, y: v.y + f.y * t, z: v.z + f.z * t + 80 } });
    } catch (err) { }
}
function carry(p, pawn) {
    const e = p.hold;
    try {
        if (!e.IsValid() || pawn.GetGroundEntity() === e) { drop(p, null); return; }
        const eye = pawn.GetEyePosition(), f = forward(pawn.GetEyeAngles()), d = CONFIG.CARRY_DIST;
        const o = e.GetAbsOrigin();
        const dx = eye.x + f.x * d - o.x, dy = eye.y + f.y * d - o.y, dz = eye.z + f.z * d - 12 - o.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > CONFIG.CARRY_BREAK_DIST) { drop(p, null); return; }
        let k = CONFIG.CARRY_GAIN;
        if (dist * k > CONFIG.CARRY_MAX_SPEED) k = CONFIG.CARRY_MAX_SPEED / dist;
        e.Teleport({ velocity: { x: dx * k, y: dy * k, z: dz * k }, angularVelocity: { x: 0, y: 0, z: 0 } });
    } catch (err) { drop(p, null); }
}
function bodyPos(b) {
    if (b.ent) { try { if (b.ent.IsValid()) return b.ent.GetAbsOrigin(); } catch (e) { } b.ent = null; }
    return b.pos;
}
function bodyTemplate() {
    const t = Instance.FindEntityByName(CONFIG.BODY_TEMPLATE);
    return t instanceof PointTemplate ? t : undefined;
}
function spawnBody(pawn, model) {
    const tpl = bodyTemplate();
    if (!tpl || bodies.length >= CONFIG.BODY_MAX) return null;
    try {
        const o = pawn.GetAbsOrigin(), v = pawn.GetAbsVelocity();
        const ents = tpl.ForceSpawn({ x: o.x, y: o.y, z: o.z + 8 }, { pitch: 0, yaw: pawn.GetAbsAngles().yaw, roll: 0 });
        const e = ents && ents[0];
        if (!e) return null;
        if (model && e instanceof BaseModelEntity) e.SetModel(model);
        e.Teleport({ velocity: v });
        return e;
    } catch (err) { log("body spawn failed " + err); return null; }
}

// ------------------------------------------------------------------ bodies
function searchBody(p, pawn) {
    if (!bodies.length) return;
    const eye = pawn.GetEyePosition(), a = pawn.GetEyeAngles();
    const py = a.pitch * Math.PI / 180, yw = a.yaw * Math.PI / 180;
    const f = { x: Math.cos(py) * Math.cos(yw), y: Math.cos(py) * Math.sin(yw), z: -Math.sin(py) };
    let best = null, bestDot = CONFIG.BODY_CONE;
    for (const b of bodies) {
        const bp = bodyPos(b);
        const dx = bp.x - eye.x, dy = bp.y - eye.y, dz = bp.z + 12 - eye.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > CONFIG.BODY_RANGE + 40) continue;
        const dot = d < 40 ? 1 : (dx * f.x + dy * f.y + dz * f.z) / d;
        if (dot > bestDot) { bestDot = dot; best = b; }
    }
    if (!best) return;
    if (!best.found) {
        best.found = true;
        announce(p.name + " found the body of " + best.name + ". They were " + (best.role === R_INN ? "an " : "a ") + ROLE_NAME[best.role] + ".");
    }
    if (p.role === R_DET && !best.dnaTaken) {
        best.dnaTaken = true;
        const ago = Math.round(now - best.time);
        let txt = best.name + ": killed by " + best.weapon + " " + ago + "s ago.";
        if (best.killerSlot >= 0 && best.killerSlot !== best.slot && isAlive(best.killerSlot)) {
            p.trackSlot = best.killerSlot; p.trackUntil = now + CONFIG.DNA_TIME; txt += " DNA trail on the killer for " + CONFIG.DNA_TIME + "s.";
        } else txt += " No DNA trail.";
        tell(p.slot, txt, 8);
    }
}

function weaponLabel(hit) {
    if (!hit) return "unknown causes";
    if (hit.weapon) return hit.weapon;
    if (hit.types & CSDamageTypes.BLAST) return "an explosion";
    if (hit.types & CSDamageTypes.BURN) return "fire";
    if (hit.types & CSDamageTypes.FALL) return "a fall";
    return "unknown causes";
}

function onDeath(pawn, attacker, weapon) {
    const vs = slotOf(pawn);
    if (vs < 0) return;
    const p = st(vs);
    p.pendingKill = false;
    closeShop(p);
    if (p.hold) drop(p, null);
    if (!p.deathModel) { try { p.deathModel = pawn.GetModelName(); } catch (e) { } }
    if (phase < P_ACTIVE || !p.role) { p.deathModel = ""; return; }
    let ks = slotOf(attacker);
    const hit = p.lastHit && now - p.lastHit.t < 15 ? p.lastHit : null;
    if ((ks < 0 || ks === vs) && hit) ks = hit.slot;
    const wname = weapon ? weaponName(weapon) : null;
    let pos;
    try { pos = pawn.GetAbsOrigin(); } catch (e) { pos = { x: 0, y: 0, z: 0 }; }
    const ent = spawnBody(pawn, p.deathModel);
    p.deathModel = "";
    bodies.push({ slot: vs, name: p.name || "someone", role: p.role, pos, ent, time: now, killerSlot: ks, weapon: wname || weaponLabel(hit), found: false, dnaTaken: false });
    if (phase !== P_ACTIVE) return;
    const k = ks >= 0 && ks !== vs ? players.get(ks) : undefined;
    if (k && k.role) {
        const kc = Instance.GetPlayerController(ks);
        if (side(k.role) === side(p.role)) { k.karma = Math.max(0, k.karma - CONFIG.KARMA_KILL); k.cleanRound = false; if (CONFIG.HIDE_KILLER) k.scoreDelta--; else if (kc) kc.AddScore(-1); }
        else { k.karma = Math.min(CONFIG.KARMA_MAX, k.karma + CONFIG.KARMA_GOOD_KILL); if (CONFIG.HIDE_KILLER) k.scoreDelta++; else if (kc) kc.AddScore(1); }
    }
    if (p.role === R_TRA) {
        for (const q of players.values()) if (q.role === R_DET && isAlive(q.slot)) q.credits++;
    } else {
        phaseEnd = Math.min(phaseEnd + CONFIG.HASTE_PER_DEATH, activeCap);
        deathsSinceCredit++;
        const bonus = p.role === R_DET || deathsSinceCredit >= CONFIG.CREDIT_EVERY_N_DEATHS;
        if (deathsSinceCredit >= CONFIG.CREDIT_EVERY_N_DEATHS) deathsSinceCredit = 0;
        if (bonus) for (const q of players.values()) if (q.role === R_TRA && isAlive(q.slot)) { q.credits++; tell(q.slot, "+1 credit", 3); }
        Instance.SetRoundRemainingTime(phaseEnd - now + 20);
    }
}
function weaponName(w) {
    try { const n = w.GetData().GetName(); if (n) return n.replace(/^weapon_/, ""); } catch (e) { }
    try { return w.GetClassName().replace(/^weapon_/, ""); } catch (e) { return "a weapon"; }
}

// ------------------------------------------------------------------ damage
Instance.OnModifyPlayerDamage((ev) => {
    if (killing) return;
    if (phase === P_PREP) return { abort: true };
    const victim = ev.player, vs = slotOf(victim);
    const as = slotOf(ev.attacker);
    let dmg = ev.damage, changed = false;
    if (phase === P_ACTIVE && as >= 0 && as !== vs) {
        const a = st(as);
        if (a.karma < CONFIG.KARMA_MAX) { dmg *= Math.max(CONFIG.KARMA_MIN_MULT, a.karma / CONFIG.KARMA_MAX); changed = true; }
        if (a.knife && ev.weapon) {
            try { if (ev.weapon.GetData().GetType() === CSWeaponType.KNIFE) { dmg = 500; a.knife = false; changed = true; } } catch (e) { }
        }
    }
    const byPlayer = as >= 0 && as !== vs;
    if (vs >= 0 && phase === P_ACTIVE && dmg >= victim.GetHealth() && ((CONFIG.HIDE_KILLER && byPlayer) || (CONFIG.HIDE_CLIENT_RAGDOLL && bodyTemplate()))) {
        const v = st(vs);
        v.pendingKill = true;
        v.pendingAttacker = !CONFIG.HIDE_KILLER && byPlayer ? ev.attacker : undefined;
        return { damage: Math.max(1, Math.round(dmg)), damageFlags: ev.damageFlags | CSDamageFlags.PREVENT_DEATH };
    }
    if (changed) return { damage: Math.max(1, Math.round(dmg)) };
});

Instance.OnPlayerDamage((ev) => {
    if (killing) return;
    const vs = slotOf(ev.player);
    if (vs < 0) return;
    const p = st(vs), as = slotOf(ev.attacker);
    if (as >= 0 && as !== vs) {
        p.lastHit = { slot: as, t: now, types: ev.damageTypes, weapon: ev.weapon ? weaponName(ev.weapon) : null };
        const a = st(as);
        if (phase === P_ACTIVE && a.role && p.role && side(a.role) === side(p.role)) {
            a.karma = Math.max(0, a.karma - ev.damage * CONFIG.KARMA_HURT); a.cleanRound = false;
        }
    } else if (!p.lastHit || now - p.lastHit.t > 15) p.lastHit = { slot: -1, t: now, types: ev.damageTypes, weapon: null };
    if (p.shopOpen) closeShop(p);
    if (p.pendingKill) {
        if (ev.player.GetHealth() <= 1) killQueue.push(vs);
        else p.pendingKill = false;
    }
});

function runKills() {
    while (killQueue.length) {
        const vs = killQueue.shift(), p = st(vs), pawn = pawnOf(vs);
        if (!pawn || !pawn.IsAlive()) { p.pendingKill = false; continue; }
        try { p.deathModel = pawn.GetModelName(); } catch (e) { p.deathModel = ""; }
        if (CONFIG.HIDE_CLIENT_RAGDOLL && bodyTemplate()) { try { pawn.SetModelScale(0.02); p.scaled = true; } catch (e) { } }
        let attacker = p.pendingAttacker;
        try { if (attacker && !attacker.IsValid()) attacker = undefined; } catch (e) { attacker = undefined; }
        p.pendingAttacker = undefined;
        killing = true;
        try { pawn.TakeDamage({ damage: 1000, attacker, inflictor: attacker, damageTypes: attacker ? CSDamageTypes.BULLET : CSDamageTypes.GENERIC, damageFlags: CSDamageFlags.FORCE_DEATH | CSDamageFlags.IGNORE_ARMOR }); }
        catch (e) { log("kill failed " + e); }
        finally { killing = false; }
        if (pawn.IsValid() && pawn.IsAlive()) { log("hidden kill blocked; check plugins/damage settings"); p.pendingKill = false; }
    }
}

Instance.OnPlayerKill(({ player, attacker, weapon }) => onDeath(player, attacker, weapon));

// ------------------------------------------------------------------ lifecycle
Instance.OnRoundStart(() => { now = Instance.GetGameTime(); onRoundStart(); ensureThink(); });
function flushScores() {
    for (const p of players.values()) {
        if (!p.scoreDelta) continue;
        const c = Instance.GetPlayerController(p.slot);
        if (c) c.AddScore(p.scoreDelta);
        p.scoreDelta = 0;
    }
}
Instance.OnRoundEnd(() => { flushScores(); if (phase !== P_WAIT) { phase = P_POST; roundEnded = true; endFallbackAt = 0; } for (const p of players.values()) closeShop(p); });
Instance.OnPlayerConnect(({ player }) => { const s = player.GetPlayerSlot(); players.delete(s); st(s).name = clean(player.GetPlayerName()); });
Instance.OnPlayerActivate(({ player }) => {
    const s = player.GetPlayerSlot(), p = st(s); p.name = clean(player.GetPlayerName()); resetHud(s);
    if (CONFIG.TRY_HIDE_KILLFEED) Instance.ClientCommand(s, "cl_drawhud_force_deathnotices -1");
});
Instance.OnPlayerDisconnect(({ playerSlot }) => { const q = players.get(playerSlot); if (q && q.hold) drop(q, null); players.delete(playerSlot); for (const b of bodies) if (b.killerSlot === playerSlot) b.killerSlot = -1; });
Instance.OnPlayerReset(({ player }) => {
    const s = slotOf(player);
    if (s < 0) return;
    const p = st(s); p.frozen = false; p.shopOpen = false; p.pendingKill = false; p.hud.clear();
    if (p.hold) drop(p, null);
    if (p.scaled) { p.scaled = false; try { player.SetModelScale(1); } catch (e) { } }
    try { p.name = clean(player.GetPlayerController().GetPlayerName()); } catch (e) { }
    tint(player, false);
    if (phase === P_ACTIVE && !p.role) {
        p.role = R_INN;
    }
    if (phase === P_ACTIVE && p.role === R_DET) tint(player, true);
    if (phase === P_PREP || phase === P_WAIT) p.loadoutAt = now + 0.3;
    if (CONFIG.HIDE_NATIVE_HUD) { nativeHud(player, false); p.nativeAt = now + 0.5; }
    resetHud(s);
});
Instance.OnPlayerTeamChanged(({ player }) => { const s = slotOf(player); if (s >= 0) resetHud(s); });
Instance.OnCustomHudClicked(({ player, buttonId }) => {
    if (!player || !/^Shop\d$/.test(buttonId)) return;
    const p = st(player.GetPlayerSlot()), pawn = player.GetPlayerPawn();
    if (!p.shopOpen || !pawn || !pawn.IsAlive()) return;
    p.shopSel = Number(buttonId.slice(4)); buy(p, pawn, p.shopSel);
});
Instance.OnPlayerChat(({ player, text }) => {
    if (!player) return;
    const t = text.trim().toLowerCase();
    if (t === "!ttt" || t === "/ttt") tell(player.GetPlayerSlot(), "TTT: E on a body = identify. Double-tap F = shop (traitor/detective): W/S pick, E buy, F close.", 10);
});

function think() {
    Instance.SetNextThink(Instance.GetGameTime());
    try {
        now = Instance.GetGameTime(); tick++;
        hudBudget = CONFIG.HUD_BUDGET;
        if (Instance.IsWarmupPeriod() && phase !== P_WAIT) phase = P_WAIT;
        runKills();
        if (phase === P_PREP && now >= phaseEnd) startActive();
        if (phase === P_ACTIVE && tick % 8 === 0) checkWin();
        if (roundEnded && endFallbackAt && now >= endFallbackAt) {
            endFallbackAt = 0;
            Instance.ServerCommand("mp_ignore_round_win_conditions 0");
            Instance.SetRoundRemainingTime(1);
        }
        const h = findHud();
        const cs = liveControllers();
        for (const c of cs) {
            try {
                let p = st(c.GetPlayerSlot());
                if (p.ctrl !== c) {
                    if (p.ctrl) { p = new PState(p.slot); players.set(p.slot, p); resetHud(p.slot); }
                    p.ctrl = c; p.name = clean(c.GetPlayerName());
                    if (phase === P_ACTIVE && !p.role && isAlive(p.slot)) p.role = R_INN;
                }
                const pawn = c.GetPlayerPawn();
                const alive = !!pawn && pawn.IsValid() && pawn.IsAlive();
                if (alive) {
                    if (p.nativeAt && now >= p.nativeAt) { p.nativeAt = 0; if (!c.IsBot()) nativeHud(pawn, false); }
                    if (p.loadoutAt && now >= p.loadoutAt) { p.loadoutAt = 0; if (phase === P_PREP) giveLoadout(pawn); }
                    playerInput(p, c, pawn);
                } else if (p.shopOpen || p.frozen) closeShop(p);
                if (h && (tick + p.slot) % 8 === 0) drawHud(p, c);
            } catch (e) { log("player " + c.GetPlayerSlot() + ": " + e); }
        }
        if (tick % 640 === 0) {
            const s = "phase " + phase + " players " + cs.length + " hud " + (h ? "yes" : "no");
            if (s !== lastStatus) { lastStatus = s; log(s); }
        }
    } catch (e) { log("think: " + e); }
}
function ensureThink() {
    if (thinkStarted) return;
    thinkStarted = true;
    Instance.SetThink(think);
    Instance.SetNextThink(Instance.GetGameTime());
}

Instance.OnActivate(() => {
    now = Instance.GetGameTime();
    applyCvars(true);
    ensureThink();
    log("loaded; HUD " + (findHud() ? "found" : "missing (add custom_hud_layout '" + CONFIG.HUD_NAME + "')"));
});
Instance.OnScriptReload({
    before: () => { for (const p of players.values()) closeShop(p); return null; },
    after: () => { thinkStarted = false; ensureThink(); },
});
