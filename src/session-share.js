import {
  getCaseCard,
  partnerColorLabel
} from "./card-catalog.js";

const placementLabels = {
  champion: "優勝",
  second: "2位",
  top4: "ベスト4"
};

const turnLabels = {
  first: "先",
  second: "後"
};

const resultLabels = {
  win: "○",
  loss: "× ",
  draw: "△"
};

export function buildSessionShareText({ session = {}, deck = {}, matches = [] } = {}) {
  const completedMatches = matches.filter((match) => resultLabels[match.result]);
  const wins = completedMatches.filter((match) => match.result === "win").length;
  const losses = completedMatches.filter((match) => match.result === "loss").length;
  const draws = completedMatches.filter((match) => match.result === "draw").length;
  const record = draws ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
  const outcomes = [];
  const placement = placementLabels[session.placement];
  if (placement) outcomes.push(placement);
  if (session.randomPrizeWon && session.placement !== "champion") outcomes.push("ランダム賞");

  const lines = [
    String(session.name || "大会結果").trim(),
    `使用　${String(deck.name || "未記録").trim()}`,
    `結果　${record}${outcomes.length ? `　${outcomes.join("・")}` : ""}`
  ];

  if (completedMatches.length) {
    lines.push("");
    completedMatches.forEach((match) => {
      const turn = turnLabels[match.firstPlayer] || "－";
      const result = resultLabels[match.result] || "－";
      lines.push(`${turn} ${result}｜${opponentDeckLabel(match)}`);
    });
  }

  return lines.join("\n");
}

export function buildXShareUrl(text) {
  const params = new URLSearchParams({ text: String(text || "") });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function opponentDeckLabel(match) {
  const deckName = String(match.opponentDeck || "").trim();
  if (deckName && deckName !== "不明") return deckName;
  const caseCardName = getCaseCard(match.opponentCaseCardId)?.name;
  if (caseCardName) return caseCardName;
  const color = partnerColorLabel(match.opponentPartnerColor);
  return color === "未記録" ? "不明" : color;
}
