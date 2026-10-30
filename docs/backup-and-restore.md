# Backup and restore runbook

The intended production backup has two layers. Neither is operational merely because its configuration is committed:

- `app_state_versions` keeps each user's previous JSON state for 30 days.
- GitHub Actions creates an encrypted logical backup every day at 03:23 JST and retains it for 30 days.

At the start of the 2026-10-30 audit, both required repository secrets were absent. The owner subsequently configured them privately. [Backup run 41027199973](https://github.com/Genki1122/conan-card-tracker/actions/runs/41027199973) succeeded at 17:34 JST: dump creation, encryption, full decryption comparison and encrypted artifact upload all passed. The artifact expires on 2026-11-29. The next scheduled execution and actual database restoration are separate checks, not implied by that success. Production installation of the history migration has not yet been verified.

## Initial setup

1. Run `supabase/app-state-history-migration.sql` in the Supabase SQL Editor.
2. Open the repository's [Actions secrets settings](https://github.com/Genki1122/conan-card-tracker/settings/secrets/actions).
3. Open the [production Supabase project](https://supabase.com/dashboard/project/tsfusbqmzmffdlneujny), choose **Connect > Session pooler > URI**, and add its connection string as `SUPABASE_DB_URL`. Replace `[YOUR-PASSWORD]` with the database password (not the dashboard login password); percent-encode reserved characters in that password. Never place this value in the repository or a chat message, or send it to an online encoder. If the password is unknown, assess dependent services before resetting it.
4. Add `BACKUP_ENCRYPTION_PASSPHRASE` using a unique value of at least 24 characters. Store the same value in a password manager. A lost passphrase cannot be recovered.
5. Open [Encrypted Supabase backup](https://github.com/Genki1122/conan-card-tracker/actions/workflows/supabase-backup.yml), run it manually, and confirm that one `.tar.gz.gpg` artifact is created.

The artifact contains the Supabase CLI's complete logical dump: roles, schema, application data, and Auth account data. Only the encrypted file is uploaded. The GitHub repository must never contain a plaintext production dump.

Format validation only checks the settings, not database access. A green backup run must include successful dump creation, full decrypt-and-compare verification, and artifact upload. A failed run's job summary links to missing settings without printing their values. Re-run after fixing the settings; never silence the error and assume a backup exists.

## Monthly restore drill

For the database portion, run `.github/workflows/supabase-restore-check.yml` manually with a successful main-branch backup run ID. This job downloads the existing encrypted artifact; it receives the decryption secret but **no production database credentials**. It initializes an empty local Supabase database inside the disposable GitHub runner, using the dump's PostgreSQL major version. Before restoration it disables scheduled database jobs and disconnects every container network. Restore commands use only `docker exec` and the container's Unix socket, never a database URL.

The check restores roles/schema/data in one transaction, compares the count and SHA-256 row fingerprints of every COPY table with the saved snapshot, and exercises history capture and account RLS in a rolled-back transaction. No plaintext or raw database error is uploaded or printed. Cleanup removes the container, volume, decrypted dump and temporary logs even after failure. A missing production history trigger is a failed check, not silently installed in the clone.

This does not verify hosted Auth login, mail delivery, project settings, or customizations omitted from Supabase-managed schemas. In particular, check whether the `on_auth_user_created` trigger on `auth.users` survived: the public function alone does not recreate that trigger. Before claiming full application disaster recovery, recover managed-schema customizations from the reviewed migration files and perform the following hosted-project drill with owner approval.

Run the full application check periodically against a temporary Supabase project.

1. Download the latest backup artifact from GitHub Actions.
2. Decrypt and extract it locally:

   ```bash
   gpg --output supabase-backup.tar.gz --decrypt supabase-backup-YYYYMMDDTHHMMSSZ.tar.gz.gpg
   mkdir supabase-backup
   tar -xzf supabase-backup.tar.gz -C supabase-backup
   ```

3. Create a temporary Supabase project and obtain its Session pooler connection string as `RESTORE_DB_URL`.
4. Restore roles, the schema, and the complete data dump:

   ```bash
   psql \
     --single-transaction \
     --variable ON_ERROR_STOP=1 \
     --file supabase-backup/roles.sql \
     --file supabase-backup/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file supabase-backup/data.sql \
     --dbname "$RESTORE_DB_URL"
   ```

5. Check the restored counts:

   ```sql
   select count(*) from auth.users;
   select count(*) from public.profiles;
   select count(*) from public.app_states;
   select count(*) from public.app_state_versions;
   ```

6. Compare a few users' deck, session, and match counts against the source snapshot. Check RLS and the history trigger. Verify a controlled test account can authenticate in the isolated environment, following the official guide for Auth encryption keys and destination configuration. Do not send real users test emails or point the production app at the rehearsal project.
7. Record the backup run URL/time, artifact name, successful restore time, destination project ID, count comparisons, and test-account authentication outcome in a private operations log. Do not include passwords, tokens, or user data. Record any skipped verification explicitly.
8. Delete the temporary project and local plaintext files after verification. Creating the temporary project and any charges need the owner's approval.

The history table is not an independent disaster backup: its user foreign key cascades on account deletion, and the entire database may be lost. Recovery must remain possible from the encrypted archive and an independently stored passphrase. Artifacts expire after 30 days; retain selected encrypted recovery points outside the GitHub repository with access control. An interrupted daily job increases the recovery gap and requires attention.

## Configuration checklist

Database backups do not restore every Supabase project setting. Keep a private checklist for:

- Authentication Site URL and redirect URLs
- Japanese authentication email templates
- Custom SMTP settings
- Publishable keys and other application secrets
- Enabled database extensions

Use the official [Supabase CLI backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) when performing a real disaster recovery.
