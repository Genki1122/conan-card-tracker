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

export function caseCardsForPartnerColor(partnerColor) {
  const normalizedColor = normalizePartnerColor(partnerColor);
  if (!normalizedColor) return [];
  return caseCards
    .filter((card) => card.colors.includes(normalizedColor))
    .map((card, index) => ({ card, index }))
    .sort((left, right) => caseCardRank(left.card, normalizedColor) - caseCardRank(right.card, normalizedColor) || left.index - right.index)
    .map(({ card }) => card);
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

function caseCardRank(card, partnerColor) {
  if (card.allColors) return 2;
  if (card.colors.length === 1 && card.colors[0] === partnerColor) return 0;
  return 1;
}
