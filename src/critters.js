"use strict";
/* ============================================================
   critters.js — かわいい動物・黄金の木・病気マーカーのプロシージャル描画
   外部画像なし。すべて2Dキャンバスにベクター調で描画。
   sprites.js と同じ規約: ctx は地面接地点が原点(0,0) に変換済み。
   ボディは上方向(負のY)へ描き、影は y≈+2 付近の楕円。
   光源は左上。温かい丸みのあるイラスト調(Supercell/Hay-Day風)。
   window.Critters にAPIを公開。
   ============================================================ */
(function () {
  // ---- 共通パレット(温かみのあるかわいい色) ----
  const C = {
    shadow: "rgba(40,30,20,0.18)",
    // 鳥(コマドリ風)
    birdBody: "#6f7b86",
    birdBodyHi: "#9aa6b0",
    birdBreast: "#e8743b",
    birdBreastHi: "#ff9a5e",
    birdBeak: "#f2b33a",
    // ウサギ
    rabBody: "#e9e2d6",
    rabBodyHi: "#fbf7ef",
    rabBodyLo: "#cfc6b6",
    rabInner: "#f3b7be",
    rabTail: "#ffffff",
    // リス
    sqBody: "#c97a3e",
    sqBodyHi: "#e29a5b",
    sqBelly: "#f3ddbc",
    sqTail: "#a85f2c",
    sqTailHi: "#d68e52",
    // シカ(子鹿)
    deerBody: "#d4a06a",
    deerBodyHi: "#eec39a",
    deerBelly: "#f5e6cf",
    deerSpot: "#f7ecd8",
    deerHoof: "#5b4329",
    // キツネ
    foxBody: "#e8743b",
    foxBodyHi: "#ff9a5e",
    foxBelly: "#fbeede",
    foxTailTip: "#ffffff",
    foxEar: "#7a3a1e",
    // 共通
    eye: "#3a2c22",
    eyeHi: "#ffffff",
    nose: "#3a2c22",
    cheek: "rgba(255,140,120,0.35)",
    // 黄金の木
    goldTrunk: "#a9772f",
    goldTrunkHi: "#caa055",
    goldLeafLo: "#d99a1f",
    goldLeafMid: "#f6c83a",
    goldLeafHi: "#ffe27a",
    sparkle: "#fff7d6",
    // 病気マーカー
    sickBubble: "#8a9a52",
    sickBubbleHi: "#aeb96f",
    sickBug: "#5a4a2c",
    sickBugHi: "#7c6a40",
  };

  // ---- 描画ヘルパ ----
  function ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.closePath();
  }

  function circle(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
  }

  // 地面の柔らかい影
  function groundShadow(ctx, rx, ry) {
    ctx.save();
    ctx.fillStyle = C.shadow;
    ellipse(ctx, 0, 2, rx, ry);
    ctx.fill();
    ctx.restore();
  }

  // 小さな目(白目ハイライト付き)
  function eye(ctx, x, y, r) {
    ctx.fillStyle = C.eye;
    circle(ctx, x, y, r);
    ctx.fill();
    ctx.fillStyle = C.eyeHi;
    circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.4);
    ctx.fill();
  }

  // ほっぺのチーク
  function cheek(ctx, x, y, r) {
    ctx.fillStyle = C.cheek;
    circle(ctx, x, y, r);
    ctx.fill();
  }

  // 縦方向グラデーション(下を暗く、上を明るく=左上光源の近似)
  function vGrad(ctx, yTop, yBot, hi, lo) {
    const g = ctx.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, hi);
    g.addColorStop(1, lo);
    return g;
  }

  // =========================================================
  //  動物たち  (すべて原点=地面接地点、上方向に描画)
  // =========================================================

  // --- 小鳥(コマドリ風) ---
  function drawBird(ctx, t) {
    const hop = Math.abs(Math.sin(t * 3)) * 3;       // ぴょこぴょこ跳ねる
    const flutter = Math.sin(t * 12) * 0.25;          // 羽ばたき
    groundShadow(ctx, 8, 3);
    ctx.save();
    ctx.translate(0, -hop);
    // 脚
    ctx.strokeStyle = C.birdBeak;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-2, -1);
    ctx.moveTo(2, -6); ctx.lineTo(2, -1); ctx.stroke();
    // 体(丸っこい)
    ctx.fillStyle = vGrad(ctx, -22, -6, C.birdBodyHi, C.birdBody);
    ellipse(ctx, 0, -13, 9, 9);
    ctx.fill();
    // お腹(オレンジの胸)
    ctx.fillStyle = vGrad(ctx, -18, -7, C.birdBreastHi, C.birdBreast);
    ellipse(ctx, 1.5, -10, 6, 6.5);
    ctx.fill();
    // 翼(羽ばたきで回転)
    ctx.save();
    ctx.translate(-5, -14);
    ctx.rotate(flutter);
    ctx.fillStyle = C.birdBody;
    ellipse(ctx, 0, 0, 5, 3);
    ctx.fill();
    ctx.restore();
    // 頭(体と一体の丸)
    ctx.fillStyle = vGrad(ctx, -26, -16, C.birdBodyHi, C.birdBody);
    ellipse(ctx, 4, -19, 6.5, 6);
    ctx.fill();
    // くちばし
    ctx.fillStyle = C.birdBeak;
    ctx.beginPath();
    ctx.moveTo(10, -20); ctx.lineTo(15, -18.5); ctx.lineTo(10, -17);
    ctx.closePath(); ctx.fill();
    // 尾
    ctx.fillStyle = C.birdBody;
    ctx.beginPath();
    ctx.moveTo(-7, -13); ctx.lineTo(-15, -10); ctx.lineTo(-7, -9);
    ctx.closePath(); ctx.fill();
    // 目とチーク
    eye(ctx, 6, -20, 1.6);
    cheek(ctx, 3, -17, 2);
    ctx.restore();
  }

  // --- ウサギ ---
  function drawRabbit(ctx, t) {
    const breathe = Math.sin(t * 2) * 0.6;             // 呼吸の上下
    const earTw = Math.sin(t * 1.5) * 0.18;            // 耳のひくつき
    groundShadow(ctx, 11, 3.5);
    ctx.save();
    ctx.translate(0, breathe);
    // 後脚
    ctx.fillStyle = C.rabBodyLo;
    ellipse(ctx, -7, -4, 5, 3);
    ctx.fill();
    ellipse(ctx, 7, -4, 5, 3);
    ctx.fill();
    // 体
    ctx.fillStyle = vGrad(ctx, -22, -3, C.rabBodyHi, C.rabBody);
    ellipse(ctx, 0, -11, 10, 10);
    ctx.fill();
    // しっぽ(ふわふわ)
    ctx.fillStyle = C.rabTail;
    circle(ctx, -10, -8, 4);
    ctx.fill();
    // 頭
    ctx.fillStyle = vGrad(ctx, -30, -16, C.rabBodyHi, C.rabBody);
    ellipse(ctx, 6, -20, 7, 7);
    ctx.fill();
    // 耳(2本、左右で違う角度+ひくつき)
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.translate(4 + i * 4, -25);
      ctx.rotate((i === 0 ? -0.25 : 0.05) + earTw * (i === 0 ? 1 : -1));
      ctx.fillStyle = C.rabBody;
      ellipse(ctx, 0, -8, 2.6, 9);
      ctx.fill();
      ctx.fillStyle = C.rabInner;     // 耳の内側ピンク
      ellipse(ctx, 0, -8, 1.2, 6.5);
      ctx.fill();
      ctx.restore();
    }
    // 顔
    eye(ctx, 8, -21, 1.6);
    ctx.fillStyle = C.nose;
    circle(ctx, 12, -19, 1.1);
    ctx.fill();
    cheek(ctx, 9, -18, 2);
    ctx.restore();
  }

  // --- リス ---
  function drawSquirrel(ctx, t) {
    const sway = Math.sin(t * 2.2) * 0.2;              // しっぽの揺れ
    const bob = Math.sin(t * 2.2) * 0.5;
    groundShadow(ctx, 10, 3.2);
    ctx.save();
    ctx.translate(0, bob);
    // 大きなふさふさしっぽ(体の後ろでカール、揺れる)
    ctx.save();
    ctx.translate(-8, -8);
    ctx.rotate(sway);
    ctx.fillStyle = vGrad(ctx, -30, -2, C.sqTailHi, C.sqTail);
    ctx.beginPath();
    // 上に伸びてカールする太い形
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(-14, -6, -10, -22);
    ctx.quadraticCurveTo(-6, -34, 4, -30);
    ctx.quadraticCurveTo(-2, -24, -2, -16);
    ctx.quadraticCurveTo(-2, -6, 4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 体
    ctx.fillStyle = vGrad(ctx, -20, -3, C.sqBodyHi, C.sqBody);
    ellipse(ctx, 1, -10, 8, 9);
    ctx.fill();
    // お腹(薄い色)
    ctx.fillStyle = C.sqBelly;
    ellipse(ctx, 4, -8, 4, 6);
    ctx.fill();
    // 頭
    ctx.fillStyle = vGrad(ctx, -26, -14, C.sqBodyHi, C.sqBody);
    ellipse(ctx, 6, -18, 6, 5.5);
    ctx.fill();
    // 耳(房毛)
    ctx.fillStyle = C.sqBody;
    circle(ctx, 3, -23, 2.2);
    ctx.fill();
    circle(ctx, 9, -23, 2.2);
    ctx.fill();
    // 顔
    eye(ctx, 8, -19, 1.6);
    ctx.fillStyle = C.nose;
    circle(ctx, 12, -17.5, 1);
    ctx.fill();
    cheek(ctx, 9, -16, 1.8);
    ctx.restore();
  }

  // --- 子鹿 ---
  function drawDeer(ctx, t) {
    const headBob = Math.sin(t * 1.8) * 1.2;           // 頭のゆるやかな上下
    groundShadow(ctx, 12, 3.5);
    ctx.save();
    // 細い脚
    ctx.strokeStyle = C.deerHoof;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-6, -10); ctx.lineTo(-6, 0);
    ctx.moveTo(6, -10); ctx.lineTo(6, 0);
    ctx.moveTo(-2, -10); ctx.lineTo(-2, 0);
    ctx.moveTo(9, -10); ctx.lineTo(9, 0);
    ctx.strokeStyle = C.deerBody;
    ctx.stroke();
    // ひづめ(先端だけ濃く)
    ctx.strokeStyle = C.deerHoof;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-6, -1.5); ctx.lineTo(-6, 0);
    ctx.moveTo(6, -1.5); ctx.lineTo(6, 0);
    ctx.moveTo(-2, -1.5); ctx.lineTo(-2, 0);
    ctx.moveTo(9, -1.5); ctx.lineTo(9, 0);
    ctx.stroke();
    // 体
    ctx.fillStyle = vGrad(ctx, -24, -8, C.deerBodyHi, C.deerBody);
    ellipse(ctx, 1, -15, 11, 8);
    ctx.fill();
    // お腹
    ctx.fillStyle = C.deerBelly;
    ellipse(ctx, 1, -11, 8, 4);
    ctx.fill();
    // 白い斑点
    ctx.fillStyle = C.deerSpot;
    const spots = [[-4, -18], [3, -17], [-1, -14], [6, -19], [-6, -14]];
    for (const [sx, sy] of spots) { circle(ctx, sx, sy, 1.3); ctx.fill(); }
    // しっぽ
    ctx.fillStyle = C.deerSpot;
    circle(ctx, -10, -16, 2.2);
    ctx.fill();
    // 首と頭(頭はbobで上下)
    ctx.save();
    ctx.translate(9, -22 + headBob);
    ctx.fillStyle = vGrad(ctx, -10, 6, C.deerBodyHi, C.deerBody);
    // 首
    ctx.beginPath();
    ctx.moveTo(-6, 8); ctx.lineTo(-2, 8); ctx.lineTo(3, -4); ctx.lineTo(-3, -3);
    ctx.closePath(); ctx.fill();
    // 頭(細長い顔)
    ellipse(ctx, 3, -5, 5, 4.5);
    ctx.fill();
    // マズル
    ctx.fillStyle = C.deerBelly;
    ellipse(ctx, 6, -3, 3, 2.6);
    ctx.fill();
    // 耳
    ctx.fillStyle = C.deerBody;
    ellipse(ctx, -1, -9, 2, 3.5);
    ctx.fill();
    ellipse(ctx, 4, -10, 2, 3.5);
    ctx.fill();
    // 顔
    eye(ctx, 4, -6, 1.4);
    ctx.fillStyle = C.nose;
    circle(ctx, 8, -3, 1);
    ctx.fill();
    cheek(ctx, 5, -3.5, 1.6);
    ctx.restore();
    ctx.restore();
  }

  // --- キツネ ---
  function drawFox(ctx, t) {
    const bob = Math.sin(t * 2) * 0.6;
    const tailSway = Math.sin(t * 2.4) * 0.18;
    groundShadow(ctx, 12, 3.5);
    ctx.save();
    ctx.translate(0, bob);
    // 大きなしっぽ(白い先端、揺れる)
    ctx.save();
    ctx.translate(-8, -8);
    ctx.rotate(tailSway);
    ctx.fillStyle = vGrad(ctx, -6, 4, C.foxBodyHi, C.foxBody);
    ctx.beginPath();
    ctx.moveTo(2, -4);
    ctx.quadraticCurveTo(-18, -8, -16, 2);
    ctx.quadraticCurveTo(-14, 8, -2, 4);
    ctx.closePath();
    ctx.fill();
    // 白い先端
    ctx.fillStyle = C.foxTailTip;
    ellipse(ctx, -15, 0, 3.5, 3.5);
    ctx.fill();
    ctx.restore();
    // 脚
    ctx.fillStyle = C.foxEar;
    ctx.fillRect(-5, -6, 2.5, 6);
    ctx.fillRect(4, -6, 2.5, 6);
    // 体
    ctx.fillStyle = vGrad(ctx, -20, -4, C.foxBodyHi, C.foxBody);
    ellipse(ctx, 0, -10, 9, 8);
    ctx.fill();
    // お腹
    ctx.fillStyle = C.foxBelly;
    ellipse(ctx, 2, -7, 5, 4.5);
    ctx.fill();
    // 頭
    ctx.fillStyle = vGrad(ctx, -26, -14, C.foxBodyHi, C.foxBody);
    ellipse(ctx, 6, -18, 6.5, 6);
    ctx.fill();
    // とがった耳(内側濃い)
    for (const [ex, rot] of [[2, -0.3], [10, 0.25]]) {
      ctx.save();
      ctx.translate(ex, -23);
      ctx.rotate(rot);
      ctx.fillStyle = C.foxBody;
      ctx.beginPath();
      ctx.moveTo(-2.5, 2); ctx.lineTo(0, -6); ctx.lineTo(2.5, 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.foxEar;
      ctx.beginPath();
      ctx.moveTo(-1.2, 1); ctx.lineTo(0, -3.5); ctx.lineTo(1.2, 1);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 白いマズル
    ctx.fillStyle = C.foxBelly;
    ellipse(ctx, 9, -15, 3.5, 3);
    ctx.fill();
    // 顔
    eye(ctx, 6, -19, 1.6);
    ctx.fillStyle = C.nose;
    circle(ctx, 12, -15, 1.2);
    ctx.fill();
    cheek(ctx, 8, -14, 1.8);
    ctx.restore();
  }

  // 動物タイプ → 描画関数
  const ANIMALS = {
    bird: drawBird,
    rabbit: drawRabbit,
    squirrel: drawSquirrel,
    deer: drawDeer,
    fox: drawFox,
  };

  // =========================================================
  //  公開API
  // =========================================================

  // かわいい動物を地面接地点に描画
  function draw(ctx, type, t, opts) {
    if (!ctx) return;
    const fn = ANIMALS[type];
    if (!fn) return;                 // 未知タイプは安全に何もしない
    const o = opts || {};
    const scale = o.scale || 1;
    const time = (typeof t === "number" && isFinite(t)) ? t : 0;
    ctx.save();
    try {
      if (scale !== 1) ctx.scale(scale, scale);
      if (o.flip) ctx.scale(-1, 1);  // 左向きに反転
      fn(ctx, time);
    } catch (e) {
      /* 描画は決して致命的にしない */
    }
    ctx.restore();
  }

  // 黄金の木(きらめく魔法のツリー) stage 0..3
  function drawGoldenTree(ctx, stage, t, opts) {
    if (!ctx) return;
    const o = opts || {};
    const scale = o.scale || 1;
    const time = (typeof t === "number" && isFinite(t)) ? t : 0;
    const st = Math.max(0, Math.min(3, (stage | 0)));
    // 成長段階でサイズを変える(下段は小さい)
    const sizeByStage = [0.45, 0.7, 1.0, 1.18][st];
    ctx.save();
    try {
      ctx.scale(scale * sizeByStage, scale * sizeByStage);

      // 影
      groundShadow(ctx, 26, 8);

      const sway = Math.sin(time * 1.2) * 0.03;

      // 幹
      ctx.save();
      ctx.translate(0, 0);
      ctx.rotate(sway);
      ctx.fillStyle = vGrad(ctx, -40, 0, C.goldTrunkHi, C.goldTrunk);
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.quadraticCurveTo(-4, -22, -3.5, -38);
      ctx.lineTo(3.5, -38);
      ctx.quadraticCurveTo(4, -22, 5, 0);
      ctx.closePath();
      ctx.fill();
      // 幹のハイライト(左上光源)
      ctx.fillStyle = "rgba(255,240,180,0.5)";
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.quadraticCurveTo(-3, -22, -2.5, -36);
      ctx.lineTo(-0.5, -36);
      ctx.quadraticCurveTo(-1.5, -22, -1.5, -4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 黄金の葉(重なる丸blob)
      const foliageY = -44;
      const blobs = [
        [0, foliageY, 24],
        [-16, foliageY + 8, 16],
        [16, foliageY + 8, 16],
        [-9, foliageY - 12, 15],
        [9, foliageY - 12, 15],
      ];
      // 下地(濃い金)
      ctx.fillStyle = C.goldLeafLo;
      for (const [bx, by, br] of blobs) { circle(ctx, bx, by + 2, br); ctx.fill(); }
      // 中間色
      ctx.fillStyle = C.goldLeafMid;
      for (const [bx, by, br] of blobs) { circle(ctx, bx, by, br * 0.92); ctx.fill(); }
      // ハイライト(左上)
      ctx.fillStyle = C.goldLeafHi;
      for (const [bx, by, br] of blobs) {
        circle(ctx, bx - br * 0.3, by - br * 0.35, br * 0.45);
        ctx.fill();
      }

      // きらめき(時間でパルスする星型の点)
      const sparkles = [
        [-12, foliageY - 6, 0.0],
        [14, foliageY - 2, 1.1],
        [2, foliageY - 16, 2.0],
        [-18, foliageY + 10, 0.6],
        [10, foliageY + 12, 1.7],
        [-2, foliageY + 4, 2.6],
      ];
      for (const [sx, sy, phase] of sparkles) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 3 + phase);
        if (pulse < 0.08) continue;
        const r = 1.2 + pulse * 2.2;
        ctx.save();
        ctx.globalAlpha = 0.4 + pulse * 0.6;
        ctx.fillStyle = C.sparkle;
        // 4方向の光条で星っぽく
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r * 0.3, sy - r * 0.3);
        ctx.lineTo(sx + r, sy);
        ctx.lineTo(sx + r * 0.3, sy + r * 0.3);
        ctx.lineTo(sx, sy + r);
        ctx.lineTo(sx - r * 0.3, sy + r * 0.3);
        ctx.lineTo(sx - r, sy);
        ctx.lineTo(sx - r * 0.3, sy - r * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } catch (e) {
      /* no-op */
    }
    ctx.restore();
  }

  // 病気/害虫マーカー(木の上に浮かぶ吹き出し+小さな虫)
  function drawSickMarker(ctx, t, opts) {
    if (!ctx) return;
    const o = opts || {};
    const scale = o.scale || 1;
    const time = (typeof t === "number" && isFinite(t)) ? t : 0;
    const bob = Math.sin(time * 2.5) * 2;     // ふわふわ上下
    ctx.save();
    try {
      ctx.scale(scale, scale);
      ctx.translate(0, bob);

      // やや病んだ緑茶色の吹き出しバブル
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ellipse(ctx, 0, 1, 11, 4);             // 小さな浮遊影
      ctx.fill();

      ctx.fillStyle = vGrad(ctx, -22, -2, C.sickBubbleHi, C.sickBubble);
      circle(ctx, 0, -11, 11);
      ctx.fill();
      // 吹き出しのしっぽ(下向き)
      ctx.beginPath();
      ctx.moveTo(-4, -3); ctx.lineTo(0, 4); ctx.lineTo(4, -3);
      ctx.closePath();
      ctx.fillStyle = C.sickBubble;
      ctx.fill();

      // 小さな虫(害虫)
      ctx.save();
      ctx.translate(0, -11);
      const wiggle = Math.sin(time * 8) * 0.15;
      ctx.rotate(wiggle);
      // 体(2節)
      ctx.fillStyle = vGrad(ctx, -4, 4, C.sickBugHi, C.sickBug);
      ellipse(ctx, 0, 1.5, 4.5, 3.5);
      ctx.fill();
      ctx.fillStyle = C.sickBug;
      circle(ctx, 0, -3, 3.2);                // 頭
      ctx.fill();
      // 脚
      ctx.strokeStyle = C.sickBug;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-4, 0); ctx.lineTo(-7, -1.5);
      ctx.moveTo(-4, 2); ctx.lineTo(-7, 3);
      ctx.moveTo(4, 0); ctx.lineTo(7, -1.5);
      ctx.moveTo(4, 2); ctx.lineTo(7, 3);
      ctx.stroke();
      // 触角
      ctx.beginPath();
      ctx.moveTo(-1.5, -5.5); ctx.lineTo(-3, -8);
      ctx.moveTo(1.5, -5.5); ctx.lineTo(3, -8);
      ctx.stroke();
      // 目
      ctx.fillStyle = C.eyeHi;
      circle(ctx, -1.2, -3.5, 0.9); ctx.fill();
      circle(ctx, 1.2, -3.5, 0.9); ctx.fill();
      ctx.fillStyle = C.eye;
      circle(ctx, -1.2, -3.3, 0.45); ctx.fill();
      circle(ctx, 1.2, -3.3, 0.45); ctx.fill();
      ctx.restore();
    } catch (e) {
      /* no-op */
    }
    ctx.restore();
  }

  // ---- 公開 ----
  window.Critters = {
    draw: draw,
    drawGoldenTree: drawGoldenTree,
    drawSickMarker: drawSickMarker,
    types: ["bird", "rabbit", "squirrel", "deer", "fox"],
  };
})();
