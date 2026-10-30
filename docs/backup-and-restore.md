# Backup and restore runbook

The intended production backup has two layers. Neither is operational merely because its configuration is committed:

- `app_state_versions` keeps each user's previous JSON state for 30 days.
- GitHub Actions creates an encrypted logical backup every day at 03:23 JST and retains it for 30 days.

At the start of the 2026-10-30 audit, both required repository secrets were absent. The owner subsequently configured them privately. [Backup run 41027199973](https://github.com/Genki1122/conan-card-tracker/actions/runs/41027199973) succeeded at 17:34 JST. [Restore check 41031072009](https://github.com/Genki1122/conan-card-tracker/actions/runs/41031072009) restored and matched every record in all 40 backed-up tables, but correctly failed the separate history check because the production history table/trigger were absent.

After explicit owner approval, [pre-change backup 41031657375](https://github.com/Genki1122/conan-card-tracker/actions/runs/41031657375) and [isolated rehearsal 41032594281](https://github.com/Genki1122/conan-card-tracker/actions/runs/41032594281) passed. [Production history setup 41032971919](https://github.com/Genki1122/conan-card-tracker/actions/runs/41032971919) committed at 18:22 JST, with existing app-state fingerprints unchanged, baseline history populated, and client permissions revoked. The migration includes an account-deletion guard: cascading deletes must not insert history referencing a removed Auth user. This case is exercised on a synthetic user in the rolled-back rehearsal transaction.

[Post-installation backup 41033114127](https://github.com/Genki1122/conan-card-tracker/actions/runs/41033114127) succeeded at 18:25 JST. Artifact `supabase-backup-20261030T092358Z` expires on 2026-11-29. The first normal restore exposed inherited grants from the local administrator's defaults; correcting only the restore preflight resolved this without changing production. [Normal restore check 41034355128](https://github.com/Genki1122/conan-card-tracker/actions/runs/41034355128) passed at 18:35 JST: all 41 tables matched every saved row, history capture and account-isolation behavior passed, synthetic account deletion succeeded, and temporary data cleanup completed. This check did not install the history migration into the clone. Hosted Auth/SMTP/project recovery remains unverified; the custom signup trigger requires separate recovery as noted below. The first scheduled backup check is reserved for 2026-10-31 at 06:00 JST.

## Initial setup

1. Open the repository's [Actions secrets settings](https://github.com/Genki1122/conan-card-tracker/settings/secrets/actions).
2. Open the [production Supabase project](https://supabase.com/dashboard/project/tsfusbqmzmffdlneujny), choose **Connect > Session pooler > URI**, and add its connection string as `SUPABASE_DB_URL`. Replace `[YOUR-PASSWORD]` with the database password (not the dashboard login password); percent-encode reserved characters in that password. Never place this value in the repository or a chat message, or send it to an online encoder. If the password is unknown, assess dependent services before resetting it.
3. Add `BACKUP_ENCRYPTION_PASSPHRASE` using a unique value of at least 24 characters. Store the same value in a password manager. A lost passphrase cannot be recovered.
4. Open [Encrypted Supabase backup](https://github.com/Genki1122/conan-card-tracker/actions/workflows/supabase-backup.yml), run it manually, and confirm that one `.tar.gz.gpg` artifact is created.
5. Before first-time history installation, obtain owner approval. Run the isolated restore check with that backup run ID and `rehearse_history=true`. This applies the reviewed migration only to the clone and tests update/delete history, own-account writes, anonymous/cross-account denial, and parent-account deletion.
6. Run `supabase-history-setup.yml` with the successful backup/rehearsal run IDs. It requires a backup less than one hour old and a successful matching-commit rehearsal. It validates the intended production target, rejects connection overrides, uses TLS, and applies the migration in a transaction with short lock/statement timeouts. Existing record fingerprints must remain identical or the transaction rolls back.
7. Take a new backup, then run the isolated restore check with `rehearse_history=false` (the default). This proves history is present in the actual saved production schema, not just added by the rehearsal.

The artifact contains the Supabase CLI's complete logical dump: roles, schema, application data, and Auth account data. Only the encrypted file is uploaded. The GitHub repository must never contain a plaintext production dump.

Format validation only checks the settings, not database access. A green backup run must include successful dump creation, full decrypt-and-compare verification, and artifact upload. A failed run's job summary links to missing settings without printing their values. Re-run after fixing the settings; never silence the error and assume a backup exists.

## Monthly restore drill

For the database portion, run `.github/workflows/supabase-restore-check.yml` manually with a successful main-branch backup run ID. This job downloads the existing encrypted artifact; it receives the decryption secret but **no production database credentials**. It initializes an empty local Supabase database inside the disposable GitHub runner, using the dump's PostgreSQL major version. Before restoration it disables scheduled database jobs and disconnects every container network. Restore commands use only `docker exec` and the container's Unix socket, never a database URL.

The check restores roles/schema/data in one transaction using the disconnected local database administrator, compares the count and SHA-256 row fingerprints of every COPY table with the saved snapshot, and exercises history capture and account RLS in a rolled-back transaction. A separate test creates and removes a synthetic Auth user to check the cascade-delete path. No plaintext or raw database error is uploaded or printed. Cleanup removes the container, volume, decrypted dump, GPG agent and temporary logs even after failure. A missing production history trigger is a failed check, not silently installed in normal verification mode. The explicit rehearsal option is labelled as a clone-only installation and is not proof of production installation.

Before applying the schema, remove the target's default table grants for both local creator roles (`postgres` and `supabase_admin`). Default privileges belong to the role that creates each table, not its later owner. Only clearing the `postgres` defaults while restoring as `supabase_admin` can introduce client grants that were absent in production. The [Supabase CLI privilege-migration guidance](https://supabase.com/docs/reference/cli/supabase-db-dump) requires clearing target defaults before restoration. Do not patch restored history permissions afterward to make the test pass: the saved schema must reproduce them.

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
