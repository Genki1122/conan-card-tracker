export const partnerColors = [
  { id: "blue", label: "青" },
  { id: "green", label: "緑" },
  { id: "white", label: "白" },
  { id: "red", label: "赤" },
  { id: "yellow", label: "黄" },
  { id: "black", label: "黒" }
];

const allColors = partnerColors.map((color) => color.id);

export const caseCards = [
  { id: "heisei-holmes", name: "平成のホームズ", colors: ["blue"] },
  { id: "kisaki-lawyer-sos", name: "妃弁護士SOS", colors: ["blue"] },
  { id: "troublesome-difficult-case", name: "厄介な難事件", colors: ["blue"] },
  { id: "pro-soccer-player-threat", name: "プロサッカー選手脅迫事件", colors: ["blue"] },
  { id: "blue-castle-exploration", name: "青の古城探索事件", colors: ["blue"] },
  { id: "the-black-knight", name: "The Black Knight", colors: ["blue"] },
  { id: "which-deduction-show", name: "どっちの推理ショー", colors: ["blue", "green"] },
  { id: "kid-puzzle-box", name: "怪盗キッドの絡繰箱", colors: ["blue", "white"] },
  { id: "red-and-black-crash", name: "赤と黒のクラッシュ", colors: ["blue", "red"] },
  { id: "pasture-embers", name: "牧場に堕ちた火種", colors: ["blue", "yellow"] },
  { id: "white-world", name: "白の世界", colors: ["blue", "black"] },
  { id: "betrayal-street-corner", name: "裏切りの街角", colors: ["blue", "black"] },
  { id: "kudo-shinichi-new-york", name: "工藤新一NYの事件", colors: ["blue", "black"] },
  { id: "diplomat-murder", name: "外交官殺人事件", colors: ["blue", "green"] },
  { id: "naniwa-serial-murder", name: "浪花の連続殺人事件", colors: ["green"] },
  { id: "love-deduction-kendo", name: "恋と推理の剣道大会", colors: ["green"] },
  { id: "onimaru-unification", name: "鬼丸天下統一プロジェクト", colors: ["green"] },
  { id: "reason-became-butler", name: "執事になった理由", colors: ["green"] },
  { id: "osaka-double-mystery", name: "大阪ダブルミステリー浪花剣士と太閤の城", colors: ["green"] },
  { id: "fairy-lip", name: "妖精の唇", colors: ["green", "white"] },
  { id: "targeted-lip", name: "狙われた唇", colors: ["green", "white"] },
  { id: "west-detective-vs-english-teacher", name: "西の名探偵vs英語教師", colors: ["green", "red"] },
  { id: "poirot-riddle", name: "謎解きは喫茶ポアロで", colors: ["green", "yellow"] },
  { id: "full-moon-dual-mystery", name: "満月の夜の2元ミステリー", colors: ["green", "black"] },
  { id: "kid-teleportation-magic", name: "怪盗キッドの瞬間移動魔術", colors: ["white"] },
  { id: "sonoko-dangerous-summer", name: "園子のアブない夏物語", colors: ["white"] },
  { id: "legendary-treasure-hunt", name: "伝説の宝探し", colors: ["white"] },
  { id: "sun-halo-scroll", name: "日輪の後光の巻", colors: ["white"] },
  { id: "scarlet-temptation-scroll", name: "緋色の誘惑の巻", colors: ["white"] },
  { id: "edogawa-conan-kidnapping", name: "江戸川コナン誘拐事件", colors: ["white"] },
  { id: "conan-vs-kid-blushing-mermaid", name: "コナンvsキッド 赤面の人魚", colors: ["white", "red"] },
  { id: "jet-black-mystery-train", name: "漆黒の特急", colors: ["white", "black"] },
  { id: "kid-four-masterpieces", name: "怪盗キッドと四名画", colors: ["white", "yellow"] },
  { id: "kid-vs-amuro-queens-bangs", name: "キッドvs安室 王妃の前髪", colors: ["white", "yellow"] },
  { id: "scarlet-return", name: "緋色の帰還", colors: ["red"] },
  { id: "shogi-board", name: "太閤名人の将棋盤", colors: ["red"] },
  { id: "wavering-heart", name: "揺れる心", colors: ["red"] },
  { id: "hidden-antique-tray", name: "骨董盆は隠せない", colors: ["red"] },
  { id: "red-woman-tragedy", name: "赤女の悲劇", colors: ["red", "yellow"] },
  { id: "scarlet-truth", name: "緋色の真相", colors: ["red", "yellow"] },
  { id: "betrayal-sanction", name: "裏切りの制裁", colors: ["red", "black"] },
  { id: "dear-dear-nemesis", name: "愛しい愛しい⋯宿敵さん", colors: ["red", "black"] },
  { id: "captured-detective", name: "囚われた刑事", colors: ["yellow"] },
  { id: "azusa-enomoto-kidnapping", name: "榎本梓誘拐事件", colors: ["yellow"] },
  { id: "sealed-secret", name: "閉ざされた秘密", colors: ["yellow"] },
  { id: "metropolitan-police-hostages", name: "揺れる警視庁1200万人の人質", colors: ["yellow"] },
  { id: "wind-goddess", name: "風の女神", colors: ["yellow"] },
  { id: "five-who-had-met", name: "出会っていた5人組", colors: ["yellow"] },
  { id: "detective-who-never-returned", name: "帰らざる刑事", colors: ["yellow"] },
  { id: "red-wall-death-mansion", name: "死亡の館、赤い壁", colors: ["yellow"] },
  { id: "chihaya-jugo-matchmaking-party", name: "千速と重悟の婚活パーティー", colors: ["yellow"] },
  { id: "betrayal-target", name: "裏切りの矛先", colors: ["yellow", "black"] },
  { id: "goodbye-great-detective", name: "あばよ⋯名探偵!!", colors: ["black"] },
  { id: "black-impact", name: "ブラックインパクト!", colors: ["black"] },
  { id: "criminals-crimes", name: "犯人たちの犯行", colors: ["black"] },
  { id: "gathered-detectives", name: "集められた名探偵", colors: allColors, allColors: true },
  { id: "crimson-school-trip", name: "紅の修学旅行", colors: allColors, allColors: true },
  { id: "detectives-eye", name: "探偵の目", colors: allColors, allColors: true }
];

const colorById = new Map(partnerColors.map((color) => [color.id, color]));
const caseCardById = new Map(caseCards.map((card) => [card.id, card]));
const caseCardByName = new Map(caseCards.map((card) => [card.name, card]));

export function normalizePartnerColor(value) {
  return colorById.has(value) ? value : "";
}

export function partnerColorLabel(value) {
  return colorById.get(value)?.label || "未記録";
}

export function caseCardColorLabel(card) {
  if (!card) return "";
  if (card.allColors) return "5色";
  return card.colors.map((color) => colorById.get(color)?.label || "").filter(Boolean).join("/");
}

export function caseCardsForPartnerColor(partnerColor, usageCounts = {}) {
  const normalizedColor = normalizePartnerColor(partnerColor);
  if (!normalizedColor) return [];
  return caseCards
    .filter((card) => card.colors.includes(normalizedColor))
    .sort((left, right) => (
      caseCardUsage(usageCounts, right.id) - caseCardUsage(usageCounts, left.id)
      || left.name.localeCompare(right.name, "ja")
    ));
}

export function findCaseCardByName(name) {
  return caseCardByName.get(String(name || "").trim()) || null;
}

export function getCaseCard(id) {
  return caseCardById.get(id) || null;
}

export function isCaseCardAvailableForPartnerColor(caseCardId, partnerColor) {
  const card = getCaseCard(caseCardId);
  const color = normalizePartnerColor(partnerColor);
  return Boolean(card && color && card.colors.includes(color));
}

function caseCardUsage(usageCounts, caseCardId) {
  const value = usageCounts instanceof Map ? usageCounts.get(caseCardId) : usageCounts?.[caseCardId];
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}
