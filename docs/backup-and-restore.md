# Backup and restore runbook

The production backup has two layers:

- `app_state_versions` keeps each user's previous JSON state for 30 days.
- GitHub Actions creates an encrypted logical backup every day at 03:23 JST and retains it for 30 days.

## Initial setup

1. Run `supabase/app-state-history-migration.sql` in the Supabase SQL Editor.
2. Open the repository's [Actions secrets settings](https://github.com/Genki1122/conan-card-tracker/settings/secrets/actions).
3. Add `SUPABASE_DB_URL` using the Session pooler connection string shown by Supabase's **Connect** button. Include the database password and never place this value in the repository or a chat message.
4. Add `BACKUP_ENCRYPTION_PASSPHRASE` using a unique value of at least 24 characters. Store the same value in a password manager. A lost passphrase cannot be recovered.
5. Open [Encrypted Supabase backup](https://github.com/Genki1122/conan-card-tracker/actions/workflows/supabase-backup.yml), run it manually, and confirm that one `.tar.gz.gpg` artifact is created.

The artifact contains the Supabase CLI's complete logical dump: roles, schema, application data, and Auth account data. Only the encrypted file is uploaded. The GitHub repository must never contain a plaintext production dump.

## Monthly restore drill

Run this check once a month against a temporary Supabase project.

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

6. Compare a few users' deck, session, and match counts with production, then delete the temporary project and local plaintext files.

## Configuration checklist

Database backups do not restore every Supabase project setting. Keep a private checklist for:

- Authentication Site URL and redirect URLs
- Japanese authentication email templates
- Custom SMTP settings
- Publishable keys and other application secrets
- Enabled database extensions

Use the official [Supabase CLI backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) when performing a real disaster recovery.
