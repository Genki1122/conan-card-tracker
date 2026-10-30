#!/usr/bin/env bash
set -euo pipefail

errors=()
url="${SUPABASE_DB_URL:-}"
passphrase="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
if [[ -z "$url" ]]; then
  errors+=("SUPABASE_DB_URL is not configured.")
elif [[ ! "$url" =~ ^postgres(ql)?:// ]] || [[ "$url" == *"[YOUR-PASSWORD]"* ]] || [[ "$url" =~ [[:space:]] ]]; then
  errors+=("SUPABASE_DB_URL must be a PostgreSQL connection URI with its password filled in and reserved characters percent-encoded.")
fi
if [[ -z "$passphrase" ]]; then
  errors+=("BACKUP_ENCRYPTION_PASSPHRASE is not configured.")
elif (( ${#passphrase} < 24 )); then
  errors+=("BACKUP_ENCRYPTION_PASSPHRASE must contain at least 24 characters.")
fi

if (( ${#errors[@]} )); then
  report="Backup was not created. Fix the following repository secrets:"
  printf '%s\n' "$report" "${errors[@]}"
  printf '%s\n' 'https://github.com/Genki1122/conan-card-tracker/settings/secrets/actions'
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
      printf '## Backup configuration required\n\n%s\n\n' "$report"
      printf -- '- %s\n' "${errors[@]}"
      printf '\n[Configure repository secrets](https://github.com/Genki1122/conan-card-tracker/settings/secrets/actions). Never paste credentials into logs or chat.\n'
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 1
fi
printf '%s\n' 'Backup settings passed format validation. Database connectivity has not yet been verified.'
