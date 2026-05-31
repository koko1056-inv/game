"use strict";
/* ============================================================
   もりのこ 〜林業タウン〜  メインエンジン
   キャンバス・アイソメトリック箱庭 + 経済・進行・クエスト
   依存: sprites.js / fx.js / audio.js （すべてローカル・外部資産なし）
   ============================================================ */
(function () {
  const S = window.Sprites, A = window.GameAudio;
  const TILE_W = S.TILE_W, TILE_H = S.TILE_H;
  const GRID = 9;                 // 9x9 マップ
  const CENTER = (GRID - 1) / 2;  // 中心
  const SAVE_KEY = "morinoko_save_v2";

  // ---- 樹種データ ----
  const SPECIES = {
    sugi:      { id:"sugi",      name:"スギ",     cost:50,  stages:[6,9,12],   yield:12, unlock:1,
      blurb:"成長が速い日本の代表的造林木。まずはこれから。" },
    karamatsu: { id:"karamatsu", name:"カラマツ", cost:90,  stages:[7,10,13],  yield:15, unlock:2,
      blurb:"寒冷地に強く、合板・土木用材に。収量が多い。" },
    hinoki:    { id:"hinoki",    name:"ヒノキ",   cost:160, stages:[9,13,17],  yield:20, unlock:3,
      blurb:"成長は遅いが高級材。手間をかける価値あり。" },
  };

  // ---- 建てられるもの ----
  const BUILDABLES = {
    sugi:      { type:"plant", species:"sugi",      icon:"sapling", name:"スギ",     unlock:1 },
    karamatsu: { type:"plant", species:"karamatsu", icon:"sapling", name:"カラマツ", unlock:2 },
    hinoki:    { type:"plant", species:"hinoki",    icon:"sapling", name:"ヒノキ",   unlock:3 },
    sawmill:   { type:"building", building:"sawmill", icon:"sawmill", name:"製材所", cost:600, unlock:3,
      blurb:"木材の売値が +50%（一次加工で付加価値）。建設は1つまで。" },
    lodge:     { type:"building", building:"lodge", icon:"lodge", name:"林業詰所", cost:450, unlock:4,
      blurb:"木の成長が +25%（手入れが行き届く）。建設は1つまで。" },
  };

  const SELL_BASE = 6;     // 木材1あたりの基本売値
  const DEPOT_CAP = 80;    // 土場の見た目満杯量

  // ---- 林業まめ知識 ----
  const TIPS = [
    "間伐(かんばつ)は混みすぎた木を間引き、残す木に光を届ける手入れです。",
    "主伐(しゅばつ)の後は再造林を。木を植え直して森を未来へつなぎます。",
    "木はCO₂を吸って育ちます。元気な森は『緑のダム』として水も蓄えます。",
    "丸太は土場(どば)に集めてまとめて運ぶと効率的。運搬は林業の要です。",
    "製材所で板材に加工すると、丸太のまま売るより価値が高まります。",
    "林業は数十年単位の長期の仕事。『次の世代のために木を植える』営みです。",
    "下刈り・枝打ち・間伐——こまめな手入れが良い木と良い森を育てます。",
    "スギは速く、ヒノキは遅く高価。樹種選びも経営判断のひとつです。",
  ];

  // ---- ゲーム状態 ----
  let state, tiles;
  let stats = {};
  let owned = { sawmill:false, lodge:false };

  function freshState() {
    return {
      coins: 200, wood: 0, level: 1, xp: 0,
      expanded: 0, tipIndex: 0,
      muted: false,
    };
  }

  function makeTiles() {
    const t = [];
    for (let gx = 0; gx < GRID; gx++) {
      t[gx] = [];
      for (let gy = 0; gy < GRID; gy++) {
        const d = Math.max(Math.abs(gx - CENTER), Math.abs(gy - CENTER));
        t[gx][gy] = { gx, gy, kind: d <= 1 ? "grass" : "locked", seed: (gx * 31 + gy * 17) % 100 };
      }
    }
    // 中央に土場（出荷拠点）を最初から設置
    t[CENTER][CENTER] = { gx:CENTER, gy:CENTER, kind:"building", building:"depot", seed:0, scale:0 };
    return t;
  }

  // ---- レベル ----
  function xpForLevel(l) { return Math.round(80 * Math.pow(l, 1.4)); }

  // ============================================================
  //  キャンバス・カメラ
  // ============================================================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let cw = 0, ch = 0, dpr = 1;
  const cam = { x: 0, y: 0, zoom: 1, tzoom: 1 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth; ch = window.innerHeight;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  function worldOf(gx, gy) {
    return { x: (gx - gy) * TILE_W / 2, y: (gx + gy) * TILE_H / 2 };
  }
  function toScreen(wx, wy) {
    return { x: (wx - cam.x) * cam.zoom + cw / 2, y: (wy - cam.y) * cam.zoom + ch / 2 };
  }
  function tileScreen(gx, gy) { const w = worldOf(gx, gy); return toScreen(w.x, w.y); }

  function centerCamera() {
    const c = worldOf(CENTER, CENTER);
    cam.x = c.x; cam.y = c.y;
    cam.zoom = cam.tzoom = Math.min(1.1, Math.max(0.62, cw / 900));
  }

  // ============================================================
  //  描画
  // ============================================================
  let t0 = performance.now();
  let selected = null; // {gx,gy}

  function draw(now) {
    const dt = Math.min(50, now - t0); t0 = now;
    const time = now / 1000;

    update(dt, now);
    cam.zoom += (cam.tzoom - cam.zoom) * 0.18;

    // 背景（空〜草地のグラデ）
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, "#bfe8c8");
    bg.addColorStop(1, "#8fcf9c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    // タイルを奥→手前で
    const order = [];
    for (let gx = 0; gx < GRID; gx++)
      for (let gy = 0; gy < GRID; gy++)
        order.push(tiles[gx][gy]);
    order.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy) || a.gx - b.gx);

    // 1) 地面
    for (const tl of order) {
      const s = tileScreen(tl.gx, tl.gy);
      if (s.x < -160 || s.x > cw + 160 || s.y < -160 || s.y > ch + 200) continue;
      withZoom(s, () => {
        if (tl.kind === "locked") S.drawLockedTile(ctx, 0, 0, {});
        else S.drawGrassTile(ctx, 0, 0, { seed: tl.seed });
      });
    }

    // 2) 選択ハイライト
    if (selected) {
      const tl = tiles[selected.gx][selected.gy];
      if (tl.kind !== "locked" || true) {
        const s = tileScreen(selected.gx, selected.gy);
        const pulse = 0.25 + 0.12 * Math.sin(time * 4);
        withZoom(s, () => S.drawTileHighlight(ctx, 0, 0, `rgba(255,210,77,${pulse})`));
      }
    }
    // 配置モードの候補ハイライト
    if (placeMode && hoverTile) {
      const ok = canPlaceAt(hoverTile);
      const s = tileScreen(hoverTile.gx, hoverTile.gy);
      withZoom(s, () => S.drawTileHighlight(ctx, 0, 0, ok ? "rgba(120,230,120,0.5)" : "rgba(240,90,90,0.5)"));
    }

    // 3) オブジェクト（木・建物）
    for (const tl of order) {
      const s = tileScreen(tl.gx, tl.gy);
      if (s.x < -200 || s.x > cw + 200 || s.y < -260 || s.y > ch + 240) continue;
      withZoom(s, () => drawObject(tl, time));
    }

    // 4) パーティクル・フロートテキスト（スクリーン空間）
    window.FX.draw(ctx);

    requestAnimationFrame(draw);
  }

  // ズーム＋平行移動でローカル描画
  function withZoom(s, fn) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(cam.zoom, cam.zoom);
    fn();
    ctx.restore();
  }

  function drawObject(tl, time) {
    if (tl.kind === "tree") {
      const sp = SPECIES[tl.species];
      const sway = Math.sin(time * 1.6 + tl.seed) * (0.01 + tl.stage * 0.012);
      const grow = tl.scale != null ? tl.scale : 1;
      S.drawTree(ctx, 0, 0, tl.stage, { sway, scale: grow });
      if (tl.stage < 3) {
        // 成長中：進捗リング
        const p = stageProgress(tl);
        S.drawProgressRing(ctx, 0, -treeTop(tl), p);
      } else {
        // 主伐可：バッジを上下にぴょこぴょこ
        const bob = Math.sin(time * 3 + tl.seed) * 3;
        S.drawReadyBadge(ctx, 0, -treeTop(tl) - 6, bob);
      }
    } else if (tl.kind === "building") {
      const sc = tl.scale != null ? tl.scale : 1;
      ctx.save(); ctx.scale(sc, sc);
      if (tl.building === "depot") S.drawDepot(ctx, 0, 0, Math.min(1, state.wood / DEPOT_CAP));
      else if (tl.building === "sawmill") S.drawSawmill(ctx, 0, 0, { t: time });
      else if (tl.building === "lodge") S.drawLodge(ctx, 0, 0);
      ctx.restore();
    }
  }
  function treeTop(tl) { return [30, 46, 72, 96][tl.stage] || 50; }

  function stageProgress(tl) {
    if (tl.stage >= 3) return 1;
    const total = tl._stageDur || 1;
    const elapsed = total - Math.max(0, (tl.nextAt - Date.now()) / 1000);
    return Math.max(0, Math.min(1, elapsed / total));
  }

  // ============================================================
  //  更新
  // ============================================================
  let lastTipAt = 0;
  function update(dt, now) {
    window.FX.update(dt);
    const t = Date.now();
    for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) {
      const tl = tiles[gx][gy];
      // 設置アニメ（ぽん！）
      if (tl.scale != null && tl.scale < 1) {
        tl.scale = Math.min(1, tl.scale + dt / 220);
      }
      // 樹木の成長（段階境界をチェーンしてオフラインでも正しく追いつく）
      if (tl.kind === "tree" && tl.stage < 3) {
        while (tl.stage < 3 && t >= tl.nextAt) {
          tl.stage++;
          if (tl.stage < 3) {
            const sp = SPECIES[tl.species];
            tl._stageDur = sp.stages[tl.stage] / growthMult();
            tl.nextAt = tl.nextAt + tl._stageDur * 1000;
          } else {
            tl.scale = 0.9;
            const b = screenBurst(gx, gy, 0);
            window.FX.burst(b[0], b[1], "sparkle", { count: 8 });
          }
        }
      }
    }
  }

  function screenBurst(gx, gy, dy) {
    const s = tileScreen(gx, gy);
    return [s.x, s.y - (dy || 30) * cam.zoom];
  }

  function startStage(tl) {
    const sp = SPECIES[tl.species];
    const dur = sp.stages[tl.stage] / growthMult();
    tl._stageDur = dur;
    tl.nextAt = Date.now() + dur * 1000;
  }
  function growthMult() { return owned.lodge ? 1.25 : 1; }
  function sellMult() { return owned.sawmill ? 1.5 : 1; }

  // ============================================================
  //  入力（パン・ズーム・タップ）
  // ============================================================
  const pointers = new Map();
  let dragging = false, moved = 0, downAt = 0, downPos = null, pinchDist = 0;
  let hoverTile = null;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true; moved = 0; downAt = performance.now();
      downPos = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      pinchDist = pinchDistance();
    }
    A && A.init();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) {
      if (placeMode) { hoverTile = pickTile(e.clientX, e.clientY, true); }
      return;
    }
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const d = pinchDistance();
      if (pinchDist > 0) {
        cam.tzoom = clamp(cam.tzoom * (d / pinchDist), 0.5, 1.9);
        cam.zoom = cam.tzoom;
      }
      pinchDist = d;
      return;
    }
    if (dragging) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
      if (placeMode) hoverTile = pickTile(e.clientX, e.clientY, true);
    }
  });

  function endPointer(e) {
    if (pointers.has(e.pointerId)) pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (dragging && moved < 8 && performance.now() - downAt < 400) {
        handleTap(downPos.x, downPos.y);
      }
      dragging = false;
    }
    pinchDist = 0;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.tzoom = clamp(cam.tzoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.5, 1.9);
  }, { passive: false });

  function pinchDistance() {
    const p = [...pointers.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // タイル選択（ヒットテスト：手前から）
  function pickTile(sx, sy, silent) {
    const order = [];
    for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) order.push(tiles[gx][gy]);
    order.sort((a, b) => (b.gx + b.gy) - (a.gx + a.gy) || b.gx - a.gx);
    for (const tl of order) {
      const s = tileScreen(tl.gx, tl.gy);
      // オブジェクトの当たり（中心上方の矩形）
      if (tl.kind === "tree" || tl.kind === "building") {
        const w = 64 * cam.zoom, top = 100 * cam.zoom, bot = 22 * cam.zoom;
        if (sx > s.x - w / 2 && sx < s.x + w / 2 && sy > s.y - top && sy < s.y + bot) return tl;
      }
      // 地面ダイヤ
      if (pointInDiamond(sx - s.x, sy - s.y, TILE_W * cam.zoom, TILE_H * cam.zoom)) return tl;
    }
    return null;
  }
  function pointInDiamond(x, y, w, h) {
    return Math.abs(x) / (w / 2) + Math.abs(y) / (h / 2) <= 1;
  }

  function handleTap(sx, sy) {
    const tl = pickTile(sx, sy);
    if (placeMode) {
      if (tl && canPlaceAt(tl)) commitPlace(tl);
      else { A.play("error"); toast("そこには置けません", "warn"); }
      return;
    }
    if (!tl) { closeCard(); selected = null; return; }
    selected = { gx: tl.gx, gy: tl.gy };
    A.play("click");
    openCard(tl);
  }

  // ============================================================
  //  アクション
  // ============================================================
  function plant(tl, speciesId) {
    const sp = SPECIES[speciesId];
    if (state.coins < sp.cost) { A.play("error"); toast("コインが足りません", "warn"); return false; }
    state.coins -= sp.cost;
    tl.kind = "tree"; tl.species = speciesId; tl.stage = 0; tl.scale = 0.2;
    startStage(tl);
    stats.planted = (stats.planted || 0) + 1;
    addXp(2);
    A.play("plant");
    const [bx, by] = screenBurst(tl.gx, tl.gy, 10);
    window.FX.burst(bx, by, "dust", { count: 8 });
    window.FX.burst(bx, by, "sparkle", { count: 5 });
    flash(`-¥${sp.cost}`, tl, "#e2674f");
    bumpQuest("plant");
    save(); refreshHUD();
    return true;
  }

  function harvest(tl) {
    const sp = SPECIES[tl.species];
    const amount = sp.yield;
    state.wood += amount;
    stats.harvested = (stats.harvested || 0) + 1;
    addXp(5);
    A.play("chop");
    const [bx, by] = screenBurst(tl.gx, tl.gy, 40);
    window.FX.burst(bx, by, "woodchips", { count: 14 });
    window.FX.burst(bx, by, "leaves", { count: 10 });
    flash(`+${amount} 木`, tl, "#8a5a30", -50);
    // 伐採跡地（再造林を促す）
    tl.kind = "grass"; delete tl.species; delete tl.stage;
    bumpQuest("harvest");
    if (Math.random() < 0.5) maybeTip();
    save(); refreshHUD();
    if (selected && selected.gx === tl.gx && selected.gy === tl.gy) openCard(tl);
  }

  function thin(tl) {
    // 間伐：少量の木材＋成長促進
    const sp = SPECIES[tl.species];
    const amount = Math.round(sp.yield * 0.25);
    state.wood += amount;
    addXp(2);
    // 残りの成長を早める
    if (tl.nextAt) tl.nextAt -= 2500;
    A.play("thin");
    const [bx, by] = screenBurst(tl.gx, tl.gy, 40);
    window.FX.burst(bx, by, "leaves", { count: 8 });
    flash(`間伐 +${amount} 木`, tl, "#3f8f37", -50);
    toast("間伐で残す木がよく育つようになりました", "tip");
    save(); refreshHUD();
    openCard(tl);
  }

  function sellWood() {
    if (state.wood <= 0) { A.play("error"); toast("出荷する木材がありません", "warn"); return; }
    const market = 0.85 + Math.random() * 0.3;
    const price = SELL_BASE * sellMult() * market;
    const gain = Math.round(state.wood * price);
    const soldWood = state.wood;
    state.coins += gain;
    state.wood = 0;
    stats.sells = (stats.sells || 0) + 1;
    addXp(Math.max(3, Math.round(soldWood / 3)));
    A.play("ship"); A.play("coin");
    const dep = depotTile();
    const [bx, by] = screenBurst(dep.gx, dep.gy, 30);
    window.FX.burst(bx, by, "coins", { count: 16 });
    window.FX.floatText(bx, by - 40, `+¥${gain.toLocaleString()}`, { color: "#e29a18", size: 22 });
    const trend = market >= 1 ? "好調" : "やや軟調";
    toast(`木材 ${soldWood} を出荷！ 市況${trend} → +¥${gain.toLocaleString()}`, "good");
    bumpQuest("sell");
    save(); refreshHUD();
    if (selected) openCard(tiles[selected.gx][selected.gy]);
  }

  function expand(tl) {
    const cost = expandCost();
    if (state.coins < cost) { A.play("error"); toast("コインが足りません", "warn"); return; }
    state.coins -= cost;
    tl.kind = "grass"; tl.scale = 0.2;
    state.expanded++;
    addXp(8);
    A.play("build");
    const [bx, by] = screenBurst(tl.gx, tl.gy, 10);
    window.FX.burst(bx, by, "sparkle", { count: 12 });
    window.FX.burst(bx, by, "dust", { count: 10 });
    toast("新しい土地を開拓しました！", "good");
    bumpQuest("expand");
    save(); refreshHUD();
    openCard(tl);
  }
  function expandCost() { return Math.round(200 * Math.pow(1.4, state.expanded)); }

  function buildOn(tl, key) {
    const b = BUILDABLES[key];
    if (owned[b.building]) { toast("すでに建設済みです", "warn"); return false; }
    if (state.coins < b.cost) { A.play("error"); toast("コインが足りません", "warn"); return false; }
    state.coins -= b.cost;
    tl.kind = "building"; tl.building = b.building; tl.scale = 0.2;
    owned[b.building] = true;
    addXp(12);
    A.play("build");
    const [bx, by] = screenBurst(tl.gx, tl.gy, 20);
    window.FX.burst(bx, by, "sparkle", { count: 14 });
    window.FX.burst(bx, by, "dust", { count: 12 });
    toast(`${b.name}を建設しました！`, "good");
    bumpQuest("build:" + b.building);
    save(); refreshHUD(); buildBar();
    return true;
  }

  function addXp(n) {
    state.xp += n;
    let need = xpForLevel(state.level);
    while (state.xp >= need) {
      state.xp -= need;
      state.level++;
      onLevelUp();
      need = xpForLevel(state.level);
    }
  }
  function onLevelUp() {
    A.play("levelup");
    window.FX.burst(cw / 2, ch / 2, "sparkle", { count: 24, power: 1.4 });
    toast(`レベル ${state.level} になりました！`, "level");
    // 解放通知
    for (const k in BUILDABLES) {
      if (BUILDABLES[k].unlock === state.level) {
        const b = BUILDABLES[k];
        toast(`🔓 ${b.name}${b.type === "plant" ? "が植えられます" : "が建てられます"}`, "tip");
      }
    }
    bumpQuest("level");
    buildBar();
  }

  function flash(text, tl, color, dy) {
    const [bx, by] = screenBurst(tl.gx, tl.gy, dy ? -dy : 20);
    window.FX.floatText(bx, by, text, { color: color || "#fff", size: 18 });
  }

  function maybeTip() {
    const now = performance.now();
    if (now - lastTipAt < 12000) return;
    lastTipAt = now;
    toast("💡 " + TIPS[state.tipIndex % TIPS.length], "tip");
    state.tipIndex++;
  }

  // ============================================================
  //  配置モード（建築バー）
  // ============================================================
  let placeMode = null; // BUILDABLES key

  function startPlace(key) {
    const b = BUILDABLES[key];
    if (state.level < b.unlock) { A.play("error"); toast(`レベル${b.unlock}で解放されます`, "warn"); return; }
    if (b.type === "building" && owned[b.building]) { toast("すでに建設済みです", "warn"); return; }
    placeMode = key;
    closeCard();
    A.play("click");
    const ph = document.getElementById("place-hint");
    const name = b.type === "plant" ? `${b.name}の苗木` : b.name;
    document.getElementById("place-hint-text").textContent = `${name} を置く場所をタップ`;
    ph.classList.remove("hidden");
  }
  function cancelPlace() {
    placeMode = null; hoverTile = null;
    document.getElementById("place-hint").classList.add("hidden");
  }
  function canPlaceAt(tl) { return tl && tl.kind === "grass"; }
  function commitPlace(tl) {
    const b = BUILDABLES[placeMode];
    let ok = false;
    if (b.type === "plant") ok = plant(tl, b.species);
    else ok = buildOn(tl, placeMode);
    if (ok && (b.type === "building" || !canAfford(b))) cancelPlace();
    // 連続で植えられるよう、苗木で資金が続く限り配置モード維持
    if (ok && b.type === "plant" && !canAfford(b)) cancelPlace();
  }
  function canAfford(b) {
    const cost = b.type === "plant" ? SPECIES[b.species].cost : b.cost;
    return state.coins >= cost;
  }

  // ============================================================
  //  HUD / アクションカード
  // ============================================================
  const $ = (id) => document.getElementById(id);

  function refreshHUD() {
    $("val-coins").textContent = Math.round(state.coins).toLocaleString();
    $("val-wood").textContent = state.wood;
    $("val-level").textContent = state.level;
    const need = xpForLevel(state.level);
    $("xp-fill").style.width = Math.min(100, (state.xp / need) * 100) + "%";
    $("xp-text").textContent = `${state.xp}/${need}`;
    const claimable = QUESTS.filter(q => questDone(q) && !q.claimed).length;
    const badge = $("quest-badge");
    badge.textContent = claimable;
    badge.classList.toggle("hidden", claimable === 0);
    $("btn-sound").textContent = state.muted ? "🔇" : "🔊";
  }

  function depotTile() {
    for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++)
      if (tiles[gx][gy].building === "depot") return tiles[gx][gy];
    return tiles[CENTER][CENTER];
  }

  function coinCostSpan(n) {
    return `<span class="cost"><canvas width="16" height="16" data-ic="coin"></canvas>${n.toLocaleString()}</span>`;
  }

  function openCard(tl) {
    const card = $("action-card");
    const iconBox = $("card-icon");
    const acts = $("card-actions");
    iconBox.innerHTML = ""; acts.innerHTML = "";

    let title = "", sub = "", iconKind = "leaf";

    if (tl.kind === "grass") {
      title = "空き地"; sub = "苗木を植えるか、施設を建てましょう。"; iconKind = "leaf";
      // 植えられる樹種
      for (const k in BUILDABLES) {
        const b = BUILDABLES[k];
        if (state.level < b.unlock) continue;
        if (b.type === "plant") {
          const sp = SPECIES[b.species];
          acts.appendChild(makeBtn(`${sp.name}を植える`, coinCostSpan(sp.cost),
            state.coins >= sp.cost, "green", () => { plant(tl, b.species); }));
        } else {
          if (owned[b.building]) continue;
          acts.appendChild(makeBtn(`${b.name}を建てる`, coinCostSpan(b.cost),
            state.coins >= b.cost, "blue", () => { buildOn(tl, k); }));
        }
      }
    } else if (tl.kind === "tree") {
      const sp = SPECIES[tl.species];
      const stName = ["苗木", "若木", "成木", "主伐期"][tl.stage];
      iconKind = tl.stage >= 2 ? "tree" : "sapling";
      title = `${sp.name}（${stName}）`;
      if (tl.stage < 3) {
        const left = Math.max(0, Math.ceil((tl.nextAt - Date.now()) / 1000));
        sub = `成長中… 次の段階まで約${left}秒。${sp.blurb}`;
      } else {
        sub = `主伐できます！ 収穫で木材 ${sp.yield} を得ます。伐ったら再造林を。`;
      }
      if (tl.stage === 2) {
        acts.appendChild(makeBtn("間伐する", "", true, "ghost", () => thin(tl)));
      }
      if (tl.stage === 3) {
        acts.appendChild(makeBtn(`🪓 主伐する（+${sp.yield} 木）`, "", true, "gold", () => harvest(tl)));
      }
    } else if (tl.kind === "building") {
      if (tl.building === "depot") {
        iconKind = "depot";
        title = "土場（出荷拠点）";
        const price = Math.round(SELL_BASE * sellMult());
        sub = `木材を市場へ出荷して現金化。現在の在庫 ${state.wood}（目安 ¥${(state.wood * price).toLocaleString()}／市況変動あり）。`;
        acts.appendChild(makeBtn("🚚 出荷する", "", state.wood > 0, "gold", () => sellWood()));
      } else if (tl.building === "sawmill") {
        iconKind = "sawmill"; title = "製材所";
        sub = "丸太を板材に加工し、木材の売値が +50%。出荷収入がアップします。";
      } else if (tl.building === "lodge") {
        iconKind = "lodge"; title = "林業詰所";
        sub = "下刈り・枝打ちなどの手入れで、木の成長が +25% に。";
      }
    } else if (tl.kind === "locked") {
      iconKind = "leaf"; title = "未開拓地";
      sub = "ここを切り開けば、植林できる土地が増えます。";
      acts.appendChild(makeBtn("⛏️ 開拓する", coinCostSpan(expandCost()),
        state.coins >= expandCost(), "blue", () => expand(tl)));
    }

    $("card-title").textContent = title;
    $("card-sub").textContent = sub;
    iconBox.appendChild(S.makeIcon(iconKind, 64));
    card.classList.remove("hidden");
    paintIcons(card);
  }

  function makeBtn(label, costHtml, enabled, kind, onClick) {
    const b = document.createElement("button");
    b.className = "btn " + (kind || "green");
    b.innerHTML = label + (costHtml || "");
    b.disabled = !enabled;
    b.addEventListener("click", () => { if (!b.disabled) onClick(); });
    return b;
  }
  function closeCard() { $("action-card").classList.add("hidden"); selected = null; }

  // 建築バー
  function buildBar() {
    const bar = $("buildbar");
    bar.innerHTML = "";
    for (const k in BUILDABLES) {
      const b = BUILDABLES[k];
      const item = document.createElement("div");
      item.className = "build-item";
      const locked = state.level < b.unlock;
      const built = b.type === "building" && owned[b.building];
      const cost = b.type === "plant" ? SPECIES[b.species].cost : b.cost;
      item.innerHTML =
        `<canvas width="52" height="52" data-ic="${b.icon}"></canvas>` +
        `<div class="bi-name">${b.name}</div>` +
        `<div class="bi-cost"><canvas width="14" height="14" data-ic="coin"></canvas>${cost.toLocaleString()}</div>`;
      if (locked) {
        item.classList.add("locked");
        item.innerHTML += `<div class="bi-lock">🔒<small>Lv${b.unlock}</small></div>`;
      } else if (built) {
        item.classList.add("locked");
        item.innerHTML += `<div class="bi-lock">✅<small>建設済</small></div>`;
      } else {
        item.addEventListener("click", () => startPlace(k));
      }
      bar.appendChild(item);
    }
    paintIcons(bar);
  }

  // data-ic を持つcanvasにアイコンを描画
  function paintIcons(root) {
    (root || document).querySelectorAll("canvas[data-ic]").forEach(cv => {
      if (cv._painted) return;
      cv._painted = true;
      const kind = cv.getAttribute("data-ic");
      const ic = S.makeIcon(kind, cv.width);
      cv.getContext("2d").drawImage(ic, 0, 0);
    });
  }

  // ============================================================
  //  クエスト
  // ============================================================
  const QUESTS = [
    { id:"q1", title:"はじめの一歩", desc:"苗木を 3本 植えよう。林業は植林から始まります。",
      key:"plant", goal:3, reward:{coins:80, xp:20} },
    { id:"q2", title:"収穫の喜び", desc:"木を 2本 主伐しよう。伐ったら再造林を忘れずに。",
      key:"harvest", goal:2, reward:{coins:120, wood:8} },
    { id:"q3", title:"商売の基本", desc:"土場から木材を 1回 出荷しよう。運搬は林業の要。",
      key:"sell", goal:1, reward:{coins:140, xp:20} },
    { id:"q4", title:"規模を広げる", desc:"未開拓地を 1区画 開拓しよう。",
      key:"expand", goal:1, reward:{coins:180, xp:30} },
    { id:"q5", title:"一人前の育林家", desc:"レベル 3 に到達しよう。育林は長い目で。",
      key:"level", goal:3, reward:{coins:260} },
    { id:"q6", title:"付加価値づくり", desc:"製材所を建てよう。加工すると木材の価値が上がります。",
      key:"build:sawmill", goal:1, reward:{coins:240} },
  ];
  // 進捗カウンタ（statsから算出 or 専用）
  function questValue(q) {
    if (q.key === "plant") return stats.planted || 0;
    if (q.key === "harvest") return stats.harvested || 0;
    if (q.key === "sell") return stats.sells || 0;
    if (q.key === "expand") return state.expanded || 0;
    if (q.key === "level") return state.level || 1;
    if (q.key === "build:sawmill") return owned.sawmill ? 1 : 0;
    if (q.key === "build:lodge") return owned.lodge ? 1 : 0;
    return 0;
  }
  function questDone(q) { return questValue(q) >= q.goal; }
  function bumpQuest() { refreshHUD(); if (!$("quest-panel").classList.contains("hidden")) renderQuests(); }

  function renderQuests() {
    const list = $("quest-list");
    list.innerHTML = "";
    QUESTS.forEach(q => {
      const val = Math.min(questValue(q), q.goal);
      const done = questDone(q);
      const div = document.createElement("div");
      div.className = "quest" + (q.claimed ? " done" : "");
      const r = q.reward;
      const rewardStr =
        (r.coins ? `<canvas width="16" height="16" data-ic="coin"></canvas>${r.coins}` : "") +
        (r.wood ? ` <canvas width="16" height="16" data-ic="wood"></canvas>${r.wood}` : "") +
        (r.xp ? ` ⭐${r.xp}` : "");
      div.innerHTML =
        `<div class="quest-title">${q.claimed ? "✅" : (done ? "🎁" : "🎯")} ${q.title}</div>` +
        `<div class="quest-desc">${q.desc}</div>` +
        `<div class="quest-bar"><div class="quest-bar-fill" style="width:${(val / q.goal) * 100}%"></div></div>` +
        `<div class="quest-foot"><div class="quest-reward">${rewardStr}</div></div>`;
      const foot = div.querySelector(".quest-foot");
      if (q.claimed) {
        const s = document.createElement("span"); s.style.fontWeight = "800"; s.style.color = "#3f8f37";
        s.textContent = "受取済"; foot.appendChild(s);
      } else if (done) {
        const btn = document.createElement("button");
        btn.className = "btn gold"; btn.textContent = "受け取る";
        btn.addEventListener("click", () => claimQuest(q));
        foot.appendChild(btn);
      } else {
        const s = document.createElement("span"); s.style.fontSize = "0.78rem"; s.style.color = "#6b4a25";
        s.textContent = `${val} / ${q.goal}`; foot.appendChild(s);
      }
      list.appendChild(div);
    });
    paintIcons(list);
  }

  function claimQuest(q) {
    if (q.claimed || !questDone(q)) return;
    q.claimed = true;
    const r = q.reward;
    if (r.coins) state.coins += r.coins;
    if (r.wood) state.wood += r.wood;
    if (r.xp) addXp(r.xp);
    A.play("coin"); A.play("levelup");
    window.FX.burst(cw / 2, ch / 3, "coins", { count: 18 });
    toast(`クエスト達成！ 報酬を受け取りました`, "good");
    save(); refreshHUD(); renderQuests();
  }

  // ============================================================
  //  パネル / ボタン配線
  // ============================================================
  function openPanel(id) { A.play("whoosh"); $(id).classList.remove("hidden"); }
  function closePanel(id) { $(id).classList.add("hidden"); }

  function wireUI() {
    $("card-close").addEventListener("click", () => closeCard());
    $("place-cancel").addEventListener("click", () => cancelPlace());
    $("btn-quests").addEventListener("click", () => { renderQuests(); openPanel("quest-panel"); });
    $("btn-menu").addEventListener("click", () => { updateMenu(); openPanel("menu-panel"); });
    $("btn-sound").addEventListener("click", toggleSound);
    $("btn-help").addEventListener("click", () => { closePanel("menu-panel"); renderHelp(); openPanel("help-panel"); });
    $("btn-reset").addEventListener("click", reset);
    document.querySelectorAll(".panel-close").forEach(b =>
      b.addEventListener("click", () => closePanel(b.getAttribute("data-close"))));
    document.querySelectorAll(".panel").forEach(p =>
      p.addEventListener("click", e => { if (e.target === p) closePanel(p.id); }));
    $("btn-start").addEventListener("click", startGame);
  }

  function toggleSound() {
    state.muted = !state.muted;
    A.setMuted(state.muted);
    if (!state.muted) A.startAmbient();
    refreshHUD(); save();
  }

  function updateMenu() {
    const treeCount = countTrees();
    $("menu-stat").innerHTML =
      `🌲 育成中の木: <b>${treeCount}</b> 本<br>` +
      `📦 木材在庫: <b>${state.wood}</b><br>` +
      `🗺️ 開拓した土地: <b>${state.expanded}</b> 区画<br>` +
      `⭐ レベル: <b>${state.level}</b>（次まで ${xpForLevel(state.level) - state.xp} XP）<br>` +
      `🏭 施設: ${owned.sawmill ? "製材所 " : ""}${owned.lodge ? "詰所" : ""}${(!owned.sawmill && !owned.lodge) ? "なし" : ""}`;
  }
  function countTrees() {
    let n = 0;
    for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++)
      if (tiles[gx][gy].kind === "tree") n++;
    return n;
  }

  function renderHelp() {
    const tips = TIPS.map(t => `<div class="tipcard">💡 ${t}</div>`).join("");
    $("help-body").innerHTML =
      `<h3>遊び方</h3>` +
      `<p>① 空き地（明るい芝マス）をタップして<b>苗木を植える</b>。<br>` +
      `② 時間が経つと木が成長します（🌱→🌿→🌲→🌳）。<br>` +
      `③ 🌳マークが出たら木をタップして<b>主伐（収穫）</b>。木材が手に入ります。<br>` +
      `④ 中央の<b>土場</b>をタップして<b>出荷</b>すると現金に。市況で値段が変わります。<br>` +
      `⑤ コインで<b>土地の開拓</b>や<b>製材所・詰所</b>を建てて経営を拡大！</p>` +
      `<h3>操作</h3>` +
      `<p>ドラッグで移動 / ホイール・ピンチで拡大縮小 / タップで選択。</p>` +
      `<h3>林業まめ知識</h3>` + tips;
  }

  // ============================================================
  //  セーブ / ロード
  // ============================================================
  function save() {
    try {
      const treeData = [];
      for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) {
        const t = tiles[gx][gy];
        if (t.kind === "tree") treeData.push({ gx, gy, species: t.species, stage: t.stage, nextAt: t.nextAt, dur: t._stageDur });
        else if (t.kind === "grass" && !(Math.max(Math.abs(gx-CENTER),Math.abs(gy-CENTER))<=1)) treeData.push({ gx, gy, grass: true });
        else if (t.kind === "building" && t.building !== "depot") treeData.push({ gx, gy, building: t.building });
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        state, stats, owned,
        quests: QUESTS.map(q => ({ id: q.id, claimed: !!q.claimed })),
        tiles: treeData, v: 2,
      }));
    } catch (e) { /* localStorage不可でも続行 */ }
  }

  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
    if (!data || data.v !== 2) return false;
    state = Object.assign(freshState(), data.state);
    stats = data.stats || {};
    owned = Object.assign({ sawmill: false, lodge: false }, data.owned);
    tiles = makeTiles();
    (data.tiles || []).forEach(td => {
      const t = tiles[td.gx][td.gy];
      if (td.grass) { t.kind = "grass"; }
      else if (td.building) { t.kind = "building"; t.building = td.building; }
      else { t.kind = "tree"; t.species = td.species; t.stage = td.stage; t.nextAt = td.nextAt; t._stageDur = td.dur; }
    });
    (data.quests || []).forEach(qs => { const q = QUESTS.find(x => x.id === qs.id); if (q) q.claimed = qs.claimed; });
    return true;
  }

  function reset() {
    if (!confirm("最初からやり直しますか？ 現在の森は失われます。")) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    QUESTS.forEach(q => q.claimed = false);
    state = freshState(); stats = {}; owned = { sawmill: false, lodge: false };
    tiles = makeTiles();
    selected = null; cancelPlace();
    closePanel("menu-panel");
    centerCamera(); buildBar(); refreshHUD();
    toast("新しい山林からスタート！", "good");
  }

  // ============================================================
  //  トースト
  // ============================================================
  function toast(msg, type) {
    const box = $("toasts");
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 2600);
    while (box.children.length > 4) box.removeChild(box.firstChild);
  }

  // ============================================================
  //  起動
  // ============================================================
  let started = false;
  function startGame() {
    if (started) return;
    started = true;
    $("intro").classList.add("hidden");
    A.init();
    if (!state.muted) { A.setMuted(false); A.startAmbient(); }
    else A.setMuted(true);
    toast("ようこそ！ まずは空き地に苗木を植えましょう 🌱", "tip");
  }

  function boot() {
    resize();
    if (!load()) {
      state = freshState();
      stats = {};
      owned = { sawmill: false, lodge: false };
      tiles = makeTiles();
    }
    centerCamera();
    wireUI();
    buildBar();
    refreshHUD();
    paintIcons(document);
    requestAnimationFrame(draw);
    // 自動セーブ
    setInterval(save, 8000);
    window.addEventListener("beforeunload", save);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
