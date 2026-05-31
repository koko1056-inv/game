"use strict";
/* ============================================================
   sprites.js — 手描き風プロシージャルアート（外部画像なし）
   すべてキャンバスにベクター調で描画。温かいイラスト調(Supercell風)。
   window.Sprites にAPIを公開。
   ============================================================ */
(function () {
  const TILE_W = 128; // アイソメトリックタイルの幅
  const TILE_H = 64;  // 高さ(2:1)

  // ---- 共通パレット ----
  const C = {
    grassHi: "#86d15a",
    grassMid: "#69bd45",
    grassLo: "#54a637",
    grassEdge: "#3f8a2c",
    soil: "#9b6a43",
    soilDark: "#7c5132",
    trunk: "#7a542f",
    trunkHi: "#9a6e3f",
    leafHi: "#7cc95a",
    leafMid: "#4faf4e",
    leafLo: "#2f8f3a",
    leafShadow: "#247031",
    sapling: "#8fd86b",
    coin: "#ffd24d",
    coinHi: "#fff0a8",
    coinLo: "#e6a31f",
    wood: "#c98a4f",
    woodHi: "#e6b27a",
    woodRing: "#8a5a30",
    roofRed: "#d65a4a",
    roofHi: "#e8806f",
    wall: "#f3e6c8",
    wallShade: "#d9c39a",
    stone: "#9aa0a6",
  };

  // 角丸ポリゴン用ヘルパ
  function diamondPath(ctx, cx, cy, w, h) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy);
    ctx.closePath();
  }

  // 楕円(影)
  function ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.closePath();
  }

  // ---- 地面タイル ----
  // (cx,cy) はタイル中心(画面座標)
  function drawGrassTile(ctx, cx, cy, opts = {}) {
    const w = TILE_W, h = TILE_H;
    // 側面(土)で厚みを出す
    const depth = opts.depth ?? 10;
    ctx.save();
    // 左側面
    ctx.fillStyle = C.soilDark;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx, cy + h / 2 + depth);
    ctx.lineTo(cx - w / 2, cy + depth);
    ctx.closePath();
    ctx.fill();
    // 右側面
    ctx.fillStyle = C.soil;
    ctx.beginPath();
    ctx.moveTo(cx + w / 2, cy);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx, cy + h / 2 + depth);
    ctx.lineTo(cx + w / 2, cy + depth);
    ctx.closePath();
    ctx.fill();

    // 天面(芝)グラデ
    const g = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
    g.addColorStop(0, opts.tint || C.grassHi);
    g.addColorStop(1, opts.tintLo || C.grassMid);
    diamondPath(ctx, cx, cy, w, h);
    ctx.fillStyle = g;
    ctx.fill();
    // 縁取り
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.grassEdge;
    ctx.stroke();

    // 芝の質感(小さなドット)
    if (!opts.flat) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      const seed = (opts.seed || 0);
      for (let i = 0; i < 5; i++) {
        const a = (seed * 13 + i * 47) % 100 / 100;
        const px = cx + (a - 0.5) * w * 0.6;
        const py = cy + ((((seed * 7 + i * 31) % 100) / 100) - 0.5) * h * 0.5;
        ctx.fillRect(px, py, 2, 2);
      }
    }
    ctx.restore();
  }

  function drawTileHighlight(ctx, cx, cy, color = "rgba(255,255,255,0.35)") {
    ctx.save();
    diamondPath(ctx, cx, cy, TILE_W - 4, TILE_H - 4);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
    ctx.restore();
  }

  function drawLockedTile(ctx, cx, cy, opts = {}) {
    // 暗い未開拓の森
    drawGrassTile(ctx, cx, cy, { tint: "#3c5a39", tintLo: "#2c4630", flat: true, depth: opts.depth });
    ctx.save();
    diamondPath(ctx, cx, cy, TILE_W, TILE_H);
    ctx.fillStyle = "rgba(10,20,10,0.35)";
    ctx.fill();
    // 茂みのシルエットをいくつか
    ctx.fillStyle = "#274a2b";
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 22;
      ellipse(ctx, cx + ox, cy - 4, 16, 10);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- 木(成長段階 0..3 と stump) ----
  // baseX,baseY = タイル中心。木は中心からやや上に伸びる。
  // stage: 0 苗木 / 1 若木 / 2 成木 / 3 大木(主伐期)
  function drawTreeShadow(ctx, x, y, r) {
    ctx.save();
    ellipse(ctx, x, y + 6, r, r * 0.4);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fill();
    ctx.restore();
  }

  function blob(ctx, x, y, r, fill) {
    ellipse(ctx, x, y, r, r * 0.92);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawTree(ctx, x, y, stage, opts = {}) {
    const scale = opts.scale ?? 1;
    const sway = opts.sway ?? 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    if (stage === 0) {
      // 苗木: 小さな双葉
      drawTreeShadow(ctx, 0, 0, 12);
      ctx.save();
      ctx.rotate(sway * 0.6);
      ctx.strokeStyle = "#5a8a3a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(0, -16);
      ctx.stroke();
      blob(ctx, -6, -16, 7, C.sapling);
      blob(ctx, 6, -18, 7, C.leafHi);
      blob(ctx, 0, -24, 6, C.sapling);
      ctx.restore();
      ctx.restore();
      return;
    }

    if (stage === "stump") {
      drawTreeShadow(ctx, 0, 0, 16);
      // 切り株
      ctx.fillStyle = C.trunk;
      ctx.beginPath();
      ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.lineTo(10, -16); ctx.lineTo(-10, -16); ctx.closePath();
      ctx.fill();
      ellipse(ctx, 0, -16, 11, 5); ctx.fillStyle = C.woodHi; ctx.fill();
      ellipse(ctx, 0, -16, 7, 3); ctx.strokeStyle = C.woodRing; ctx.lineWidth = 1.2; ctx.stroke();
      ellipse(ctx, 0, -16, 3, 1.4); ctx.stroke();
      ctx.restore();
      return;
    }

    // 樹高・葉量を段階で
    const cfg = {
      1: { trunkH: 26, trunkW: 7, foliage: [[0, -34, 16]], topY: -42 },
      2: { trunkH: 34, trunkW: 9, foliage: [[0, -38, 20], [-13, -30, 14], [13, -32, 14], [0, -52, 16]], topY: -64 },
      3: { trunkH: 44, trunkW: 12, foliage: [[0, -44, 26], [-18, -36, 18], [18, -38, 18], [-8, -64, 18], [10, -62, 18], [0, -78, 16]], topY: -92 },
    }[stage];

    drawTreeShadow(ctx, 0, 0, cfg.foliage[0][2] * 0.95);
    ctx.save();
    // 風で上部が揺れる: 上に行くほど大きく傾く
    ctx.transform(1, 0, sway, 1, 0, 0);

    // 幹
    const tg = ctx.createLinearGradient(-cfg.trunkW, 0, cfg.trunkW, 0);
    tg.addColorStop(0, C.trunk);
    tg.addColorStop(0.5, C.trunkHi);
    tg.addColorStop(1, C.trunk);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-cfg.trunkW * 0.6, 0);
    ctx.lineTo(cfg.trunkW * 0.6, 0);
    ctx.lineTo(cfg.trunkW * 0.42, -cfg.trunkH);
    ctx.lineTo(-cfg.trunkW * 0.42, -cfg.trunkH);
    ctx.closePath();
    ctx.fill();

    // 葉(影→中→ハイライト)
    for (const [fx, fy, fr] of cfg.foliage) { blob(ctx, fx, fy + 3, fr, C.leafShadow); }
    for (const [fx, fy, fr] of cfg.foliage) { blob(ctx, fx, fy, fr, C.leafMid); }
    for (const [fx, fy, fr] of cfg.foliage) { blob(ctx, fx - fr * 0.28, fy - fr * 0.32, fr * 0.62, C.leafHi); }
    // 一番上のきらめき
    const top = cfg.foliage[cfg.foliage.length - 1];
    blob(ctx, top[0] - top[2] * 0.3, top[1] - top[2] * 0.35, top[2] * 0.28, "rgba(255,255,255,0.5)");

    ctx.restore();
    ctx.restore();
  }

  // 成長中の進捗リング
  function drawProgressRing(ctx, x, y, p) {
    ctx.save();
    ctx.translate(x, y - 4);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#ffd24d";
    ctx.beginPath(); ctx.arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.stroke();
    ctx.restore();
  }

  // 収穫可能マーク(感嘆符の吹き出し)
  function drawReadyBadge(ctx, x, y, bob = 0) {
    ctx.save();
    ctx.translate(x, y + bob);
    ellipse(ctx, 0, 4, 12, 5); ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -6, 13, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#f4a521"; ctx.stroke();
    // 斧アイコン的な感嘆符
    ctx.fillStyle = "#e0772f";
    ctx.fillRect(-2.2, -13, 4.4, 9);
    ctx.beginPath(); ctx.arc(0, -1, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---- 建物 ----
  function drawSawmill(ctx, x, y, opts = {}) {
    const t = opts.t || 0;
    ctx.save();
    ctx.translate(x, y);
    ellipse(ctx, 0, 2, 40, 16); ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fill();
    // 壁
    ctx.fillStyle = C.wall;
    ctx.beginPath();
    ctx.moveTo(-34, -2); ctx.lineTo(34, -2); ctx.lineTo(34, -34); ctx.lineTo(-34, -34); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.wallShade;
    ctx.fillRect(-34, -2, 68, 6);
    // 屋根
    ctx.fillStyle = C.roofRed;
    ctx.beginPath();
    ctx.moveTo(-42, -32); ctx.lineTo(0, -56); ctx.lineTo(42, -32); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.roofHi;
    ctx.beginPath();
    ctx.moveTo(-42, -32); ctx.lineTo(0, -56); ctx.lineTo(0, -50); ctx.lineTo(-34, -33); ctx.closePath();
    ctx.fill();
    // ドアと窓
    ctx.fillStyle = C.trunk; ctx.fillRect(-8, -22, 16, 20);
    ctx.fillStyle = "#bfe3ff"; ctx.fillRect(-28, -26, 12, 10); ctx.fillRect(16, -26, 12, 10);
    // 回る丸ノコ
    ctx.save();
    ctx.translate(-46, -14);
    ctx.rotate(t * 6);
    ctx.fillStyle = C.stone;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#5a5f63"; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7); ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  function drawDepot(ctx, x, y, fill = 0) {
    ctx.save();
    ctx.translate(x, y);
    ellipse(ctx, 0, 2, 38, 15); ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fill();
    // 土台
    ctx.fillStyle = C.soilDark;
    ctx.beginPath();
    diamondPath(ctx, 0, -4, 70, 34); ctx.fill();
    // 丸太の山(fill 0..1 で高さ変化)
    const rows = Math.max(1, Math.round(1 + fill * 3));
    for (let r = 0; r < rows; r++) {
      const ry = -8 - r * 9;
      const count = 4 - r;
      for (let i = 0; i < count; i++) {
        const lx = -((count - 1) * 11) / 2 + i * 11 + (r % 2) * 5;
        // 丸太(端面)
        ctx.fillStyle = C.wood;
        ctx.beginPath(); ctx.ellipse(lx, ry, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.woodHi;
        ctx.beginPath(); ctx.ellipse(lx - 1, ry - 1, 4.5, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.woodRing; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(lx, ry, 3, 2.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLodge(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ellipse(ctx, 0, 2, 34, 14); ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fill();
    // ログハウス壁
    ctx.fillStyle = C.wood;
    ctx.beginPath(); ctx.moveTo(-28, -2); ctx.lineTo(28, -2); ctx.lineTo(28, -28); ctx.lineTo(-28, -28); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.woodRing; ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-28, -2 - i * 7); ctx.lineTo(28, -2 - i * 7); ctx.stroke(); }
    // 屋根
    ctx.fillStyle = "#4a7a3a";
    ctx.beginPath(); ctx.moveTo(-34, -26); ctx.lineTo(0, -48); ctx.lineTo(34, -26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#5d9149";
    ctx.beginPath(); ctx.moveTo(-34, -26); ctx.lineTo(0, -48); ctx.lineTo(0, -42); ctx.lineTo(-26, -27); ctx.closePath(); ctx.fill();
    // ドア
    ctx.fillStyle = C.trunkHi; ctx.fillRect(-7, -20, 14, 18);
    // 煙突の煙
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.arc(16, -48, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(20, -56, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---- アイコン(HUD/メニュー用) ----
  function drawCoinIcon(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    g.addColorStop(0, C.coinHi); g.addColorStop(0.6, C.coin); g.addColorStop(1, C.coinLo);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.strokeStyle = "#c8870f"; ctx.stroke();
    ctx.fillStyle = "#c8870f"; ctx.font = `bold ${r * 1.1}px serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("¥", 0, r * 0.06);
    ctx.restore();
  }

  function drawWoodIcon(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = C.wood;
      ctx.beginPath(); ctx.ellipse(i * r * 0.55, i * 2, r * 0.5, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.woodHi;
      ctx.beginPath(); ctx.ellipse(i * r * 0.55 - 1, i * 2 - 1, r * 0.3, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.woodRing; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(i * r * 0.55, i * 2, r * 0.2, r * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLeafIcon(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    blob(ctx, 0, 0, r, C.leafMid);
    blob(ctx, -r * 0.25, -r * 0.28, r * 0.5, C.leafHi);
    ctx.restore();
  }

  // 与えられたサイズの単体キャンバスにアイコンを描いて返す(DOM用)
  function makeIcon(kind, size = 40) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");
    const c = size / 2, r = size * 0.34;
    if (kind === "coin") drawCoinIcon(ctx, c, c, r);
    else if (kind === "wood") drawWoodIcon(ctx, c, c, r * 1.3);
    else if (kind === "leaf") drawLeafIcon(ctx, c, c, r);
    else if (kind === "tree") drawTree(ctx, c, size * 0.82, 2, { scale: size / 110 });
    else if (kind === "sapling") drawTree(ctx, c, size * 0.7, 0, { scale: size / 60 });
    else if (kind === "sawmill") drawSawmill(ctx, c, size * 0.86, { t: 0 });
    else if (kind === "depot") drawDepot(ctx, c, size * 0.86, 0.6);
    else if (kind === "lodge") drawLodge(ctx, c, size * 0.86);
    return cv;
  }

  window.Sprites = {
    TILE_W, TILE_H, C,
    drawGrassTile, drawTileHighlight, drawLockedTile,
    drawTree, drawProgressRing, drawReadyBadge,
    drawSawmill, drawDepot, drawLodge,
    drawCoinIcon, drawWoodIcon, drawLeafIcon, makeIcon,
  };
})();
