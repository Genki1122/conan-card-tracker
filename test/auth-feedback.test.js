import test from "node:test";
import assert from "node:assert/strict";

import { authEmailErrorMessage, authOtpErrorMessage } from "../src/auth-feedback.js";

test("email rate limits are explained without exposing a technical error", () => {
  assert.equal(
    authEmailErrorMessage(new Error("email rate limit exceeded")),
    "メール送信の制限に達しています。連続で送信せず、時間をおいてお試しください。解消しない場合はアプリ管理者へ連絡してください。"
  );
});

test("mail provider configuration errors direct users to support without exposing account existence", () => {
  for (const error of [
    { code: "email_address_not_authorized", message: "Email address not authorized" },
    new Error("Error sending confirmation email"),
    new Error("SMTP connection failed"),
  ]) {
    assert.match(authEmailErrorMessage(error), /管理者/);
    assert.doesNotMatch(authEmailErrorMessage(error), /登録されていません|存在しません|SMTP/);
  }
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

test("OTP failures explain whether to check the code or connection", () => {
  assert.equal(
    authOtpErrorMessage(new Error("Token has expired or is invalid")),
    "コードが正しくないか、有効期限が切れています。最新メールの認証コードを確認してください。"
  );
  assert.equal(
    authOtpErrorMessage(new Error("Failed to fetch")),
    "通信に失敗しました。接続状況を確認して、もう一度お試しください。"
  );
});
