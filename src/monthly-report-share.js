const SUMMARY_IMAGE_WIDTH = 1080;
const SUMMARY_IMAGE_HEIGHT = 1350;
const HISTORY_IMAGE_WIDTH = 1080;
const HISTORY_IMAGE_MIN_HEIGHT = 1350;
const HISTORY_IMAGE_MAX_HEIGHT = 1920;
const HISTORY_MAX_EVENTS = 30;

const colors = {
  background: "#100d14",
  panel: "#1d1923",
  panelStrong: "#251f2d",
  line: "#3a3342",
  text: "#f5f1fa",
  muted: "#aaa2b6",
  gold: "#e5b949",
  purple: "#9d7bff",
  blue: "#69b6f7",
  red: "#ff6f8d"
};

const fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif';
const placementLabels = {
  champion: "優勝",
  second: "2位",
  top4: "ベスト4"
};

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function percentage(value) {
  return `${number(value).toFixed(1)}%`;
}

function recordText(record = {}) {
  return `${number(record.wins)}-${number(record.losses)}-${number(record.draws)}`;
}

function shortDate(value) {
  const [, , month, day] = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/) || [];
  return month && day ? `${Number(month)}/${Number(day)}` : "--/--";
}

export function monthlyOutcomeLabel(event = {}) {
  const placement = placementLabels[event.placement] || "";
  const random = event.randomPrizeWon && event.placement !== "champion" ? "ランダム" : "";
  return [placement, random].filter(Boolean).join("・");
}

export function buildMonthlyHistoryRows(report = {}) {
  const events = Array.isArray(report.events) ? report.events : [];
  const visible = events.slice(0, HISTORY_MAX_EVENTS);
  return {
    rows: visible.map((event) => ({
      date: shortDate(event.date),
      eventName: event.name || "大会名未設定",
      deckName: event.deckName || "デッキ未設定",
      outcome: monthlyOutcomeLabel(event),
      record: recordText(event.record)
    })),
    hiddenCount: Math.max(0, events.length - visible.length)
  };
}

export function historyImageLayout(eventCount = 0) {
  const count = Math.min(HISTORY_MAX_EVENTS, Math.max(0, number(eventCount)));
  const rowHeight = count <= 12 ? 70 : count <= 20 ? 58 : 44;
  const contentHeight = 300 + (count * rowHeight) + 90;
  return {
    width: HISTORY_IMAGE_WIDTH,
    height: Math.min(HISTORY_IMAGE_MAX_HEIGHT, Math.max(HISTORY_IMAGE_MIN_HEIGHT, contentHeight)),
    rowHeight,
    fontSize: count <= 12 ? 30 : count <= 20 ? 26 : 22
  };
}

export function monthlyShareText(report = {}, {
  monthLabel = "今月",
  recordTypeLabel = "チャレンジ",
  sessionUnit = "大会"
} = {}) {
  return [
    `${monthLabel}の対戦記録`,
    `${recordTypeLabel} ${number(report.sessionCount)}${sessionUnit} ${recordText(report.summary)}`,
    `勝率 ${percentage(report.summary?.winRate)}`,
    "#コナカノート"
  ].join("\n");
}

function setFont(context, size, weight = 700) {
  context.font = `${weight} ${size}px ${fontFamily}`;
}

function drawRoundedRect(context, x, y, width, height, radius, { fill, stroke } = {}) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  if (fill) {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }
}

function ellipsizedText(context, value, maxWidth) {
  const text = String(value || "");
  if (context.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped && context.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return clipped ? `${clipped}…` : "…";
}

function drawText(context, value, x, y, {
  size = 28,
  weight = 700,
  color = colors.text,
  align = "left",
  maxWidth
} = {}) {
  setFont(context, size, weight);
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  const text = maxWidth ? ellipsizedText(context, value, maxWidth) : String(value || "");
  context.fillText(text, x, y);
}

function drawDivider(context, y, left = 54, right = 1026) {
  context.fillStyle = colors.line;
  context.fillRect(left, y, right - left, 2);
}

function drawBrandHeader(context, label, monthCode) {
  context.fillStyle = colors.gold;
  context.fillRect(0, 0, SUMMARY_IMAGE_WIDTH, 8);
  drawText(context, "コナンカード戦績ノート", 54, 70, { size: 24, weight: 800, color: colors.muted });
  drawText(context, label, 1026, 70, { size: 20, weight: 800, color: colors.gold, align: "right" });
  drawText(context, monthCode, 1026, 124, { size: 32, weight: 900, align: "right" });
}

function drawStat(context, x, label, value, note = "") {
  drawText(context, label, x, 310, { size: 21, weight: 800, color: colors.muted });
  drawText(context, value, x, 382, { size: 58, weight: 900 });
  if (note) drawText(context, note, x, 420, { size: 21, weight: 800, color: colors.muted });
}

function awardItems(awards = {}) {
  return [
    ["優勝", number(awards.champion), colors.gold],
    ["2位", number(awards.second), "#d2cadc"],
    ["ベスト4", number(awards.top4), "#a79caf"],
    ["ランダム", number(awards.random), colors.purple]
  ].filter(([, count]) => count > 0);
}

function drawAwardChip(context, x, y, label, count, tone) {
  setFont(context, 23, 800);
  const width = Math.max(142, context.measureText(label).width + 94);
  drawRoundedRect(context, x, y, width, 54, 10, { fill: colors.panelStrong, stroke: tone });
  drawText(context, label, x + 18, y + 36, { size: 22, weight: 800, color: tone });
  drawText(context, String(count), x + width - 18, y + 37, { size: 26, weight: 900, align: "right" });
  return width;
}

function recordColor(record = {}) {
  if (number(record.wins) > number(record.losses)) return colors.blue;
  if (number(record.wins) < number(record.losses)) return colors.red;
  return colors.gold;
}

function createCanvas(documentRef, width, height) {
  const canvas = documentRef.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function renderMonthlySummaryCanvas(report = {}, {
  documentRef = document,
  username = "PLAYER",
  monthLabel = "今月",
  monthCode = "",
  recordTypeLabel = "チャレンジ",
  sessionUnit = "大会"
} = {}) {
  const canvas = createCanvas(documentRef, SUMMARY_IMAGE_WIDTH, SUMMARY_IMAGE_HEIGHT);
  const context = canvas.getContext("2d");
  context.fillStyle = colors.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawBrandHeader(context, "MONTHLY REPORT", monthCode);

  drawText(context, username, 54, 132, { size: 27, weight: 800, color: colors.purple, maxWidth: 560 });
  drawText(context, `${monthLabel}の対戦記録`, 54, 218, { size: 62, weight: 900 });
  drawText(context, recordTypeLabel, 1026, 218, { size: 26, weight: 800, color: colors.muted, align: "right" });
  drawDivider(context, 248);

  drawStat(context, 54, `参加${sessionUnit}`, String(number(report.sessionCount)), `${number(report.summary?.total)}戦`);
  drawStat(context, 276, "戦績", recordText(report.summary));
  drawStat(context, 650, "勝率", percentage(report.summary?.winRate));
  drawStat(context, 865, "パス率", percentage(report.passUsage?.rate), `${number(report.passUsage?.used)} / ${number(report.passUsage?.total)}戦`);

  drawDivider(context, 460);
  drawText(context, "大会結果", 54, 518, { size: 24, weight: 900 });
  const awards = awardItems(report.awards);
  if (awards.length) {
    let awardX = 54;
    awards.forEach(([label, count, tone]) => {
      const width = drawAwardChip(context, awardX, 542, label, count, tone);
      awardX += width + 14;
    });
  } else {
    drawText(context, "入賞・ランダム賞の記録なし", 54, 581, { size: 24, weight: 700, color: colors.muted });
  }

  drawText(context, "使用デッキ", 54, 666, { size: 24, weight: 900 });
  drawText(context, "大会数 / 戦績 / 勝率", 1026, 666, { size: 20, weight: 800, color: colors.muted, align: "right" });
  drawDivider(context, 688);
  const decks = (report.decks || []).slice(0, 6);
  if (!decks.length) {
    drawText(context, "この月の対戦記録はありません", 54, 756, { size: 28, color: colors.muted });
  }
  decks.forEach((deck, index) => {
    const y = 742 + (index * 82);
    drawText(context, String(index + 1).padStart(2, "0"), 54, y + 32, { size: 20, weight: 900, color: colors.gold });
    drawText(context, deck.name, 105, y + 32, { size: 29, weight: 900, maxWidth: 430 });
    drawText(context, `${number(deck.sessions)}${sessionUnit}`, 620, y + 32, { size: 23, weight: 800, color: colors.muted });
    drawText(context, recordText(deck), 790, y + 32, { size: 27, weight: 900, color: recordColor(deck), align: "right" });
    drawText(context, percentage(deck.winRate), 1026, y + 32, { size: 27, weight: 900, align: "right" });
    drawDivider(context, y + 58);
  });

  drawText(context, "#コナカノート", 54, 1294, { size: 24, weight: 900, color: colors.gold });
  drawText(context, "CONAN CARD TRACKER", 1026, 1294, { size: 20, weight: 800, color: colors.muted, align: "right" });
  return canvas;
}

function drawOutcomeChip(context, label, x, centerY, maxWidth, fontSize) {
  if (!label) return;
  setFont(context, fontSize, 900);
  const width = Math.min(maxWidth, context.measureText(label).width + 28);
  const height = fontSize + 18;
  drawRoundedRect(context, x + maxWidth - width, centerY - (height / 2), width, height, 8, {
    fill: colors.panelStrong,
    stroke: label.includes("ランダム") ? colors.purple : colors.gold
  });
  drawText(context, ellipsizedText(context, label, width - 20), x + maxWidth - 12, centerY + (fontSize * 0.34), {
    size: fontSize,
    weight: 900,
    color: label.includes("ランダム") ? "#cbbcff" : "#f1cf78",
    align: "right"
  });
}

export function renderMonthlyHistoryCanvas(report = {}, {
  documentRef = document,
  username = "PLAYER",
  monthLabel = "今月",
  monthCode = "",
  recordTypeLabel = "チャレンジ",
  sessionUnit = "大会",
  historyTitle = `${monthLabel} 参加${sessionUnit}`
} = {}) {
  const history = buildMonthlyHistoryRows(report);
  const layout = historyImageLayout(history.rows.length);
  const canvas = createCanvas(documentRef, layout.width, layout.height);
  const context = canvas.getContext("2d");
  context.fillStyle = colors.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawBrandHeader(context, "EVENT ARCHIVE", monthCode);

  drawText(context, username, 54, 132, { size: 27, weight: 800, color: colors.purple, maxWidth: 520 });
  drawText(context, historyTitle, 54, 210, { size: 56, weight: 900, maxWidth: 700 });
  drawText(context, `${number(report.sessionCount)}${sessionUnit}`, 1026, 210, { size: 34, weight: 900, color: colors.gold, align: "right" });
  drawText(context, recordTypeLabel, 1026, 246, { size: 21, weight: 800, color: colors.muted, align: "right" });

  drawRoundedRect(context, 38, 266, 1004, layout.height - 346, 18, { fill: colors.panel });
  drawText(context, "日付", 62, 306, { size: 19, weight: 900, color: colors.muted });
  drawText(context, "大会・店舗名", 150, 306, { size: 19, weight: 900, color: colors.muted });
  drawText(context, "使用デッキ", 478, 306, { size: 19, weight: 900, color: colors.muted });
  drawText(context, "大会結果", 738, 306, { size: 19, weight: 900, color: colors.muted });
  drawText(context, "戦績", 1018, 306, { size: 19, weight: 900, color: colors.muted, align: "right" });

  const rowStart = 322;
  history.rows.forEach((row, index) => {
    const top = rowStart + (index * layout.rowHeight);
    const baseline = top + (layout.rowHeight / 2) + (layout.fontSize * 0.34);
    context.fillStyle = index % 2 === 0 ? "#211c27" : colors.panel;
    context.fillRect(48, top, 984, layout.rowHeight);
    drawText(context, row.date, 62, baseline, { size: layout.fontSize, weight: 900, maxWidth: 72 });
    drawText(context, row.eventName, 150, baseline, { size: layout.fontSize, weight: 900, maxWidth: 304 });
    drawText(context, row.deckName, 478, baseline, {
      size: layout.fontSize,
      weight: 800,
      color: "#d4cddd",
      maxWidth: row.outcome ? 236 : 414
    });
    drawOutcomeChip(context, row.outcome, 738, top + (layout.rowHeight / 2), 164, Math.max(17, layout.fontSize - 4));
    const tone = row.record.startsWith("0-") ? colors.red : colors.text;
    drawText(context, row.record, 1018, baseline, { size: layout.fontSize, weight: 900, color: tone, align: "right" });
  });

  if (!history.rows.length) {
    drawText(context, "この月の大会記録はありません", 540, 430, { size: 30, color: colors.muted, align: "center" });
  }
  if (history.hiddenCount > 0) {
    drawText(context, `ほか ${history.hiddenCount}${sessionUnit}`, 1026, layout.height - 98, { size: 22, weight: 800, color: colors.muted, align: "right" });
  }
  drawText(context, "#コナカノート", 54, layout.height - 34, { size: 24, weight: 900, color: colors.gold });
  drawText(context, "CONAN CARD TRACKER", 1026, layout.height - 34, { size: 20, weight: 800, color: colors.muted, align: "right" });
  return canvas;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("画像の生成に失敗しました"));
    }, "image/png");
  });
}

export async function createMonthlyReportFiles(report = {}, options = {}) {
  if (options.documentRef?.fonts?.ready) await options.documentRef.fonts.ready;
  const summaryCanvas = renderMonthlySummaryCanvas(report, options);
  const historyCanvas = renderMonthlyHistoryCanvas(report, options);
  const [summaryBlob, historyBlob] = await Promise.all([
    canvasBlob(summaryCanvas),
    canvasBlob(historyCanvas)
  ]);
  const FileCtor = options.FileCtor || File;
  const slug = String(options.month || "monthly").replace(/[^0-9-]/g, "") || "monthly";
  return [
    new FileCtor([summaryBlob], `conan-note-${slug}-summary.png`, { type: "image/png" }),
    new FileCtor([historyBlob], `conan-note-${slug}-events.png`, { type: "image/png" })
  ];
}

export function canShareMonthlyReport(files, navigatorRef = navigator) {
  if (!navigatorRef?.share || !navigatorRef?.canShare) return false;
  try {
    return Boolean(navigatorRef.canShare({ files }));
  } catch {
    return false;
  }
}
