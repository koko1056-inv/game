"use strict";

/* ============================================================
   森を育てよう 〜林業経営シミュレーション〜
   バニラ JavaScript / ビルド不要
   ============================================================ */

// ---- 樹種データ ----------------------------------------------------------
// growth: 1季ごとに増える材積係数 / mature: 主伐できる年齢(年) / price: 1m³あたりの単価(円)
const SPECIES = {
  sugi: {
    name: "スギ",
    emoji: "🌲",
    seedCost: 300,
    growth: 0.12,      // m³/季
    matureAge: 8,      // 年
    price: 13000,      // 円/m³
    desc: "成長が速く扱いやすい日本の代表的な造林樹種。建築材に広く使われる。",
  },
  hinoki: {
    name: "ヒノキ",
    emoji: "🌲",
    seedCost: 500,
    growth: 0.08,
    matureAge: 11,
    price: 28000,
    desc: "成長は遅いが高価。香りと耐久性に優れ、高級建築材になる。",
  },
  karamatsu: {
    name: "カラマツ",
    emoji: "🌲",
    seedCost: 400,
    growth: 0.10,
    matureAge: 9,
    price: 16000,
    desc: "寒冷地に強い針葉樹。合板や土木用材として需要が高い。",
  },
};

const SEASONS = ["春", "夏", "秋", "冬"];

// ---- 林業まめ知識 --------------------------------------------------------
const TIPS = [
  "間伐(かんばつ)とは、混みすぎた木を一部切り、残す木に光と養分を行き渡らせる作業です。",
  "皆伐(かいばつ)・主伐の後は『再造林』で苗を植え直すことが、森を持続させる鍵です。",
  "木は二酸化炭素(CO₂)を吸って成長します。若く元気な森ほどよく吸収します。",
  "丸太は山から『土場(どば)』へ集めてから、トラックでまとめて運ぶと効率的です。",
  "ハーベスタやフォワーダなどの林業機械は、作業の安全性と生産性を大きく高めます。",
  "スギは植えてから収穫まで数十年。林業は『次の世代のために木を植える』長期の仕事です。",
  "木材の価格(山元立木価格)は樹種・品質・市場で変動します。経営には見通しが大切です。",
  "下刈り(したがり)は、苗木が雑草に負けないように夏場に草を刈る大切な手入れです。",
  "適切に手入れされた人工林は、土砂災害を防ぎ、水を蓄える『緑のダム』にもなります。",
  "間伐材も、チップ・燃料・木製品として活用すれば貴重な収入源になります。",
];

// ---- ゲーム状態 ----------------------------------------------------------
const COLS = 6;
const ROWS = 4;
const TOTAL = COLS * ROWS;

const game = {
  money: 50000,
  year: 1,
  seasonIndex: 0, // 0..3
  stock: 0,       // 土場の木材在庫 (m³)
  workers: 1,
  machineLevel: 0,
  eco: 0,
  unlocked: 8,    // 開拓済みマス数(最初の2行)
  cells: [],
  selected: null,
  landCost: 4000,
  tipIndex: 0,
};

// セル: { state: 'locked'|'empty'|'tree', species, ageQ (年齢を季単位で), volume }
function initCells() {
  game.cells = [];
  for (let i = 0; i < TOTAL; i++) {
    game.cells.push({
      state: i < game.unlocked ? "empty" : "locked",
      species: null,
      ageQ: 0,
      volume: 0,
    });
  }
}

// ---- ユーティリティ ------------------------------------------------------
const $ = (id) => document.getElementById(id);
const yen = (n) => "¥" + Math.round(n).toLocaleString("ja-JP");
const ageYears = (cell) => Math.floor(cell.ageQ / 4);

function stageOf(cell) {
  if (cell.state !== "tree") return null;
  const y = ageYears(cell);
  const mature = SPECIES[cell.species].matureAge;
  if (y < 1) return { key: "seedling", label: "苗木", emoji: "🌱" };
  if (y < 4) return { key: "young", label: "若木", emoji: "🌿" };
  if (y < mature) return { key: "grown", label: "成木", emoji: "🌲" };
  return { key: "ready", label: "主伐期", emoji: "🌳" };
}

function machineDiscount() {
  // 機械レベルが上がるほど運搬費・伐採費が安くなる
  return Math.max(0.4, 1 - game.machineLevel * 0.2);
}

// ---- ログ ----------------------------------------------------------------
function log(msg, type = "") {
  const el = document.createElement("div");
  el.className = "log-entry" + (type ? " " + type : "");
  const when = `${game.year}年目 ${SEASONS[game.seasonIndex]}`;
  el.innerHTML = `<span class="when">${when}</span>${msg}`;
  const logEl = $("log");
  logEl.prepend(el);
  while (logEl.children.length > 40) logEl.removeChild(logEl.lastChild);
}

function nextTip() {
  const t = TIPS[game.tipIndex % TIPS.length];
  game.tipIndex++;
  log("💡 まめ知識: " + t, "tip");
}

// ---- 描画 ----------------------------------------------------------------
function render() {
  // 統計
  $("stat-time").textContent = `${game.year}年目 ${SEASONS[game.seasonIndex]}`;
  $("stat-money").textContent = yen(game.money);
  $("stat-stock").textContent = game.stock.toFixed(1) + " m³";
  $("stat-workers").textContent = game.workers + "人";
  $("stat-eco").textContent = Math.round(game.eco);

  // グリッド
  const grid = $("grid");
  grid.innerHTML = "";
  game.cells.forEach((cell, i) => {
    const btn = document.createElement("button");
    btn.className = "cell " + cell.state;
    if (game.selected === i) btn.classList.add("selected");

    if (cell.state === "locked") {
      btn.textContent = "🔒";
    } else if (cell.state === "empty") {
      btn.textContent = "⬛";
    } else {
      const st = stageOf(cell);
      btn.textContent = st.emoji;
      const ageEl = document.createElement("span");
      ageEl.className = "age";
      ageEl.textContent = `${SPECIES[cell.species].name}${ageYears(cell)}年`;
      btn.appendChild(ageEl);
    }
    btn.addEventListener("click", () => selectCell(i));
    grid.appendChild(btn);
  });

  renderActions();
  renderShop();
}

function renderShop() {
  $("btn-buy-land").innerHTML =
    `🗺️ 土地を購入 <span class="cost">${yen(game.landCost)}</span>`;
  $("btn-buy-land").disabled =
    game.unlocked >= TOTAL || game.money < game.landCost;

  const hireCost = hireCostNow();
  $("btn-hire").innerHTML =
    `👷 作業員を雇う <span class="cost">${yen(hireCost)}/季</span>`;

  const machineCost = machineCostNow();
  $("btn-buy-machine").innerHTML = game.machineLevel >= 3
    ? `🚜 機械は最高レベルです`
    : `🚜 林業機械を購入(Lv${game.machineLevel}→${game.machineLevel + 1}) <span class="cost">${yen(machineCost)}</span>`;
  $("btn-buy-machine").disabled =
    game.machineLevel >= 3 || game.money < machineCost;

  const shipCost = shipCostNow();
  $("btn-ship").disabled = game.stock <= 0;
  $("btn-ship").innerHTML = game.stock > 0
    ? `🚚 木材を出荷する (${game.stock.toFixed(1)}m³ → 約${yen(estimateRevenue())})`
    : `🚚 出荷する木材がありません`;
}

function hireCostNow() {
  return 1500 + game.workers * 500;
}
function machineCostNow() {
  return 12000 * (game.machineLevel + 1);
}
function shipCostNow() {
  return 2000 * machineDiscount();
}

// 在庫の推定売上(平均単価で概算)
function estimateRevenue() {
  return game.stockValue ? game.stockValue - shipCostNow() : 0;
}

// ---- セル選択と作業メニュー ---------------------------------------------
function selectCell(i) {
  const cell = game.cells[i];
  if (cell.state === "locked") {
    log("そのマスはまだ未開拓です。『土地を購入』で開拓できます。", "warn");
    return;
  }
  game.selected = i;
  render();
}

function renderActions() {
  const info = $("cell-info");
  const actions = $("actions");
  actions.innerHTML = "";

  if (game.selected === null) {
    info.textContent = "マスを選択してください。";
    return;
  }
  const cell = game.cells[game.selected];

  if (cell.state === "empty") {
    info.innerHTML = "🟫 <strong>空き地</strong>。苗木を植えて森を育てましょう。";
    addAction("🌱 苗木を植える", null, () => openPlantModal());
  } else if (cell.state === "tree") {
    const sp = SPECIES[cell.species];
    const st = stageOf(cell);
    info.innerHTML =
      `${st.emoji} <strong>${sp.name}</strong>（${st.label}・${ageYears(cell)}年）<br>` +
      `材積: 約 ${cell.volume.toFixed(2)} m³ / 推定価値: ${yen(cell.volume * sp.price)}`;

    // 間伐: 成木以上で可能
    if (st.key === "grown" || st.key === "ready") {
      addAction("✂️ 間伐する", thinCost(), () => doThin(game.selected),
        game.money < thinCost());
    }
    // 主伐: 主伐期で推奨、成木でも可
    if (st.key === "ready") {
      addAction("🪓 主伐(収穫)する", harvestCost(), () => doHarvest(game.selected),
        game.money < harvestCost());
    } else if (st.key === "grown") {
      addAction("🪓 主伐(まだ早い)", harvestCost(), () => doHarvest(game.selected),
        game.money < harvestCost());
    } else {
      const note = document.createElement("p");
      note.style.fontSize = "0.78rem";
      note.style.color = "#67756c";
      note.textContent = "まだ若いので、もう少し育ててから伐採しましょう。";
      actions.appendChild(note);
    }
  }
}

function addAction(label, cost, handler, disabled = false) {
  const btn = document.createElement("button");
  btn.className = "action-btn";
  btn.innerHTML = cost
    ? `${label} <span class="cost">${yen(cost)}</span>`
    : label;
  btn.disabled = disabled;
  btn.addEventListener("click", handler);
  $("actions").appendChild(btn);
}

function thinCost() { return Math.round(800 * machineDiscount()); }
function harvestCost() { return Math.round(2500 * machineDiscount()); }

// ---- 作業アクション ------------------------------------------------------
function openPlantModal() {
  const body = $("modal-body");
  body.innerHTML = "";
  $("modal-title").textContent = "植える樹種を選ぶ";
  Object.entries(SPECIES).forEach(([key, sp]) => {
    const btn = document.createElement("button");
    btn.className = "species-btn";
    btn.disabled = game.money < sp.seedCost;
    btn.innerHTML =
      `<strong>${sp.name}</strong>（苗木 ${yen(sp.seedCost)}）` +
      `<span class="desc">${sp.desc}<br>成長速度: ${"★".repeat(Math.round(sp.growth * 30))} ／ 単価: ${yen(sp.price)}/m³ ／ 主伐目安: ${sp.matureAge}年</span>`;
    btn.addEventListener("click", () => {
      plantTree(game.selected, key);
      closeModal();
    });
    body.appendChild(btn);
  });
  $("modal").classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
}

function plantTree(i, speciesKey) {
  const cell = game.cells[i];
  const sp = SPECIES[speciesKey];
  if (game.money < sp.seedCost) { log("資金が足りません。", "warn"); return; }
  game.money -= sp.seedCost;
  cell.state = "tree";
  cell.species = speciesKey;
  cell.ageQ = 0;
  cell.volume = 0.02;
  log(`🌱 ${sp.name}の苗木を植えました（${yen(sp.seedCost)}）。`);
  if (Math.random() < 0.5) nextTip();
  render();
}

function doThin(i) {
  const cell = game.cells[i];
  const cost = thinCost();
  if (game.money < cost) return;
  game.money -= cost;
  // 間伐: 一部の材を土場へ。残す木の成長(volume)が少し増えるボーナス
  const thinned = cell.volume * 0.2;
  game.stock += thinned;
  addStockValue(thinned, cell.species);
  cell.volume *= 0.85;       // 本数が減るぶん見かけの材積は少し減る
  cell.thinBonus = (cell.thinBonus || 0) + 0.15; // 今後の成長促進
  game.eco += 3;
  log(`✂️ 間伐しました（−${yen(cost)}）。間伐材 ${thinned.toFixed(2)}m³ を土場へ。残った木がよく育つようになります。`, "money");
  if (Math.random() < 0.6) nextTip();
  render();
}

function doHarvest(i) {
  const cell = game.cells[i];
  const cost = harvestCost();
  if (game.money < cost) return;
  game.money -= cost;
  game.stock += cell.volume;
  addStockValue(cell.volume, cell.species);
  log(`🪓 ${SPECIES[cell.species].name}を主伐し、${cell.volume.toFixed(2)}m³ を土場へ運びました（伐採費 −${yen(cost)}）。`, "money");
  // 伐採跡地は空き地に。再造林を促す
  cell.state = "empty";
  cell.species = null;
  cell.ageQ = 0;
  cell.volume = 0;
  log("🌱 伐採跡地です。『再造林』で植え直すと森が続きます。", "tip");
  render();
}

// 在庫の金額価値を樹種単価込みで積み上げる
function addStockValue(volume, speciesKey) {
  game.stockValue = (game.stockValue || 0) + volume * SPECIES[speciesKey].price;
}

function shipTimber() {
  if (game.stock <= 0) { log("出荷する木材がありません。", "warn"); return; }
  const cost = shipCostNow();
  if (game.money < cost) { log("運搬費が払えません。資金を確保しましょう。", "warn"); return; }
  // 市況変動 ±15%
  const market = 0.85 + Math.random() * 0.3;
  const gross = (game.stockValue || 0) * market;
  const net = gross - cost;
  game.money += net;
  log(`🚚 木材 ${game.stock.toFixed(1)}m³ を出荷！ 市況${market >= 1 ? "好調" : "やや軟調"}(${(market * 100 - 100).toFixed(0)}%) 売上 ${yen(gross)} − 運搬費 ${yen(cost)} ＝ <strong>${yen(net)}</strong>`, "money");
  game.stock = 0;
  game.stockValue = 0;
  render();
}

// ---- 経営アクション ------------------------------------------------------
function buyLand() {
  if (game.unlocked >= TOTAL) { log("これ以上拡張できる土地はありません。", "warn"); return; }
  if (game.money < game.landCost) { log("資金が足りません。", "warn"); return; }
  game.money -= game.landCost;
  game.cells[game.unlocked].state = "empty";
  game.unlocked++;
  log(`🗺️ 新しい土地を開拓しました（−${yen(game.landCost)}）。植林できるマスが増えました。`, "money");
  game.landCost = Math.round(game.landCost * 1.35);
  render();
}

function hireWorker() {
  const cost = hireCostNow();
  // 雇用は前払いの初期費用。以降、季ごとに人件費がかかる
  if (game.money < cost) { log("資金が足りません。", "warn"); return; }
  game.money -= cost;
  game.workers++;
  log(`👷 作業員を雇いました（−${yen(cost)}）。毎季の作業がはかどります。人件費にご注意を。`, "money");
  render();
}

function buyMachine() {
  if (game.machineLevel >= 3) return;
  const cost = machineCostNow();
  if (game.money < cost) { log("資金が足りません。", "warn"); return; }
  game.money -= cost;
  game.machineLevel++;
  log(`🚜 林業機械を導入しました（Lv${game.machineLevel}・−${yen(cost)}）。伐採費・運搬費が下がります。`, "money");
  if (Math.random() < 0.7) nextTip();
  render();
}

// ---- 季節を進める --------------------------------------------------------
function nextSeason() {
  // 成長処理
  let grew = 0;
  game.cells.forEach((cell) => {
    if (cell.state === "tree") {
      cell.ageQ += 1;
      const sp = SPECIES[cell.species];
      const bonus = 1 + (cell.thinBonus || 0);
      // 主伐期を過ぎると成長は鈍化
      const slow = ageYears(cell) > sp.matureAge ? 0.5 : 1;
      cell.volume += sp.growth * bonus * slow;
      grew++;
      // 生きている木はCO2を吸収
      game.eco += 0.5;
    }
  });

  // 人件費(作業員ぶん)
  const wage = game.workers * 1200;
  game.money -= wage;

  // 季節を進める
  game.seasonIndex++;
  if (game.seasonIndex >= 4) {
    game.seasonIndex = 0;
    game.year++;
  }

  log(`⏭️ 季節が進みました。${grew}本の木が成長。人件費 −${yen(wage)}。`);

  // 春には軽いイベント
  if (game.seasonIndex === 0 && game.year > 1) {
    nextTip();
  }
  // 季節イベント(低確率)
  maybeEvent();

  if (game.money < 0) {
    log("⚠️ 資金がマイナスです！ 木を出荷して現金を確保しましょう。", "warn");
  }
  render();
}

function maybeEvent() {
  const r = Math.random();
  if (r < 0.08) {
    // 台風・病害などで一部の木がダメージ
    const trees = game.cells.filter((c) => c.state === "tree");
    if (trees.length > 0) {
      const victim = trees[Math.floor(Math.random() * trees.length)];
      const lost = victim.volume * 0.3;
      victim.volume = Math.max(0.02, victim.volume - lost);
      log(`🌀 台風が通過し、一部の木が傷つきました（−${lost.toFixed(2)}m³）。森林保険や手入れの大切さを実感します。`, "warn");
    }
  } else if (r < 0.13) {
    // 補助金
    const grant = 3000 + Math.floor(Math.random() * 4000);
    game.money += grant;
    log(`🏛️ 森林整備の補助金を受け取りました（+${yen(grant)}）。林業は公的支援も活用します。`, "money");
  }
}

// ---- 初期化 --------------------------------------------------------------
function start() {
  initCells();
  $("btn-next").addEventListener("click", nextSeason);
  $("btn-ship").addEventListener("click", shipTimber);
  $("btn-buy-land").addEventListener("click", buyLand);
  $("btn-hire").addEventListener("click", hireWorker);
  $("btn-buy-machine").addEventListener("click", buyMachine);
  $("modal-close").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });

  log("ようこそ！ あなたは新米の林業経営者です。苗木を植え、育て、伐って、運んで売る——森を育てながら経営を大きくしましょう。", "tip");
  log("まずは空き地マスを選び『苗木を植える』から始めましょう。", "");
  render();
}

document.addEventListener("DOMContentLoaded", start);
