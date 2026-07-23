import test from "node:test";
import assert from "node:assert/strict";

import { authEmailErrorMessage } from "../src/auth-feedback.js";

test("email rate limits are explained without exposing a technical error", () => {
  assert.equal(
    authEmailErrorMessage(new Error("email rate limit exceeded")),
    "短時間にメールを複数回送信したため、現在送信できません。しばらく待ってから、もう一度お試しください。"
  );
});

test("email and network failures have actionable Japanese messages", () => {
  assert.equal(
    authEmailErrorMessage(new Error("invalid email")),
    "メールアドレスの形式を確認してください。"
  );
  assert.equal(
    authEmailErrorMessage(new Error("Failed to fetch")),
    "通信に失敗しました。接続状況を確認して、もう一度お試しください。"
  );
  assert.equal(
    authEmailErrorMessage(new Error("unexpected auth error")),
    "メールを送信できませんでした。時間をおいて、もう一度お試しください。"
  );
});
