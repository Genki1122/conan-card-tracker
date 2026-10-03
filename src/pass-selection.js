export const passLabels = {
  pass1: "1パス",
  pass2: "2パス",
  pass3: "3パス",
  pass12: "1&2パス",
  pass13: "1&3パス",
  pass23: "2&3パス",
  pass123: "1&2&3パス",
  true: "パス有"
};

export function selectedPassNumbers(value) {
  return /^pass(?:1|2|3|12|13|23|123)$/.test(String(value))
    ? String(value).slice(4).split("")
    : [];
}

export function passValueFromNumbers(numbers) {
  const selected = new Set(numbers.map(String));
  const digits = ["1", "2", "3"].filter(number => selected.has(number)).join("");
  return digits ? `pass${digits}` : "none";
}

export function passFieldMarkup({ name, label, value = "none", multiple = false }) {
  const selected = [false, "false", null, undefined, ""].includes(value) ? "none" : String(value);
  const numbers = selectedPassNumbers(selected);
  if (!multiple) {
    const options = ["none", "pass1", "pass2", "pass3", "pass12"];
    // Preserve imported preview combinations and legacy records on unrelated edits.
    if (!options.includes(selected)) options.push(selected);
    return `<label>${escapeHtml(label)}<select name="${escapeHtml(name)}">${options.map(option =>
      `<option value="${escapeHtml(option)}"${option === selected ? " selected" : ""}>${escapeHtml(option === "none" ? "無し" : passLabels[option] || "パス有（詳細不明）")}</option>`
    ).join("")}</select></label>`;
  }
  const legacy = selected !== "none" && numbers.length === 0;
  return `<fieldset class="pass-picker" data-pass-picker>
    <legend>${escapeHtml(label)}${legacy ? '<span class="pass-legacy-state" data-pass-legacy title="パス有（詳細不明）" aria-label="以前の記録はパス有。番号は不明です">有</span>' : ""}</legend>
    <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(selected)}" data-pass-value>
    <div class="pass-number-options">
      ${["1", "2", "3"].map(number => `<label class="pass-number-option">
        <input type="checkbox" value="${number}" data-pass-number aria-label="${escapeHtml(label)} ${number}パス"${numbers.includes(number) ? " checked" : ""}>
        <span>${number}</span>
      </label>`).join("")}
    </div>
  </fieldset>`;
}

export function updatePassPicker(field) {
  const value = field.querySelector("[data-pass-value]");
  if (!value) return;
  value.value = passValueFromNumbers([...field.querySelectorAll("[data-pass-number]:checked")].map(input => input.value));
  field.querySelector("[data-pass-legacy]")?.remove();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
