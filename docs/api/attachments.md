# Attachments API

Module flag: none · Tasks: #44, #45 · Contracts: [attachments](../../packages/contracts/src/features/attachments/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/households/:householdId/attachments` | `HouseholdIdParams`, `multipart/form-data` with the file in `file` | `Attachment` | 201 | all |
| GET | `/api/households/:householdId/attachments/:attachmentId/download` | `AttachmentIdParams` | `AttachmentDownload` | 200 | all |

## Rules

- Server-set fields: every field. `mimeType` is the detected type, `sizeBytes` the stored size, and `uploadedBy` the session user. The storage key is generated as `households/<householdId>/attachments/<id>` and never exposed. The client's file name is ignored.
- Uploads: the body holds exactly one file, in the `file` field (`ATTACHMENT_UPLOAD_FIELD`), and no other fields. It's read only after the household guard has admitted the caller, so non-members never get to send one.
- Allowed types: JPEG, PNG, WebP, HEIC, and PDF (`ATTACHMENT_MIME_TYPES`). The type is detected from the file's content with [`file-type`](https://github.com/sindresorhus/file-type), and the `Content-Type` the client declares is ignored, so a PDF sent as `image/png` is stored as a PDF. Content the detector can't parse counts as an unsupported type. HEIC means a file whose major brand is `heic` or `heix`, as iPhones save them; AVIF and other HEIF files are rejected.
- Size: at most `ATTACHMENT_MAX_BYTES`. The default is 10 MiB.
- Module flags: uploading and downloading belong to no module, because expenses and receipts (#55) share this storage. Linking a file to an expense or a receipt checks that module's flag; see [expense attachments](expenses.md#attachments).
- Downloads: the response holds a signed `GET` URL to the object storage, valid for `ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS`. Membership is checked when the URL is issued; after that, the URL works for anyone who has it until `expiresAt`, so the TTL stays short. The URL is valid at least until `expiresAt`. The storage answers with the stored type and `Content-Disposition: inline`.
- Write order: the object is stored first, and the row is inserted only after that succeeds, so a failed storage write leaves no row and answers 500. If the insert fails, the object is deleted again, or queued in `storage_object_deletions` when that fails too. A crash between the two leaves an object with no row, which nothing can reach and cleanup doesn't find.
- Repeated and concurrent requests: every upload creates a new attachment, even for identical content.

## Cleanup

- An attachment is referenced while a row in another table points at it: a link in `expense_attachments`, and a receipt once #55 adds its table to `UNREFERENCED` in [`attachments-cleanup.service.ts`](../../packages/backend/src/features/attachments/attachments-cleanup.service.ts).
- An unreferenced attachment older than `ATTACHMENT_UNREFERENCED_TTL_HOURS` (default 24) is an abandoned upload, and cleanup deletes its row. Clients link a file right after uploading it, so the TTL only has to cover a slow form. The age counts from the upload, so a file that loses its last link, by unlinking or by deleting its expense, is deleted by the next run once it's that old.
- Cleanup works in batches of 100. Each transaction locks its candidates `FOR UPDATE SKIP LOCKED`, skipping files a link in progress holds `FOR KEY SHARE`, and deletes only those still unreferenced in a second statement, on a fresh snapshot. A link committed after the first read shows up in the second, and none can start on a row cleanup has locked, so a linked file is never deleted.
- Every deleted attachment row queues its storage key in `storage_object_deletions`, whether cleanup, a deleted household's cascade, or a later route deleted it. Cleanup then deletes each queued object and its queue row. A failed deletion stays queued for the next run, which then exits with code 1.
- Cleanup is safe to run concurrently and to repeat. The app doesn't schedule it; run it from a scheduler with the backend's environment, for example daily:

  ```sh
  pnpm --filter backend build
  pnpm --filter backend attachments:clean-up
  ```

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | The body has no file in `file`, has another field or file, or isn't valid multipart. `details.issues` holds the reason. |
| 413 | `PAYLOAD_TOO_LARGE` | The file is over `ATTACHMENT_MAX_BYTES`. |
| 415 | `UNSUPPORTED_FILE_TYPE` | The content isn't an allowed type. `details.allowed` lists the allowed types. |

## Configuration

The backend reads these from its environment; see [`.env.example`](../../packages/backend/.env.example).

| Variable | Default | Meaning |
| --- | --- | --- |
| `STORAGE_DRIVER` | `s3` | `s3`, or `memory` to keep objects in process memory. Tests use `memory`; nothing can download from it. |
| `S3_BUCKET` | required | Bucket for every object. |
| `S3_REGION` | `us-east-1` | Region to sign requests for; `auto` for Cloudflare R2. |
| `S3_ENDPOINT` | AWS | URL of another S3-compatible service, such as `http://localhost:8333` for the `object-storage` service in `compose.yaml`. Signed URLs point at it, so browsers must reach it too. |
| `S3_FORCE_PATH_STYLE` | `false` | `true` for services without virtual-hosted buckets, such as SeaweedFS and MinIO. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | AWS default chain | Set both or neither. |
| `S3_AVATAR_BUCKET` | required | Separate bucket for [avatars](users-friends.md#avatars), which anyone can read. |
| `S3_AVATAR_PUBLIC_URL` | required | URL that serves `S3_AVATAR_BUCKET` without signing: an R2 custom domain such as `https://avatars.homesplit.janmarek.pl`, a CDN, or the bucket's own URL, such as `http://localhost:8333/homesplit-avatars`. |
| `AVATAR_MAX_BYTES` | `10485760` (10 MiB) | Largest avatar upload. |
| `ATTACHMENT_MAX_BYTES` | `10485760` (10 MiB) | Largest upload. |
| `ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS` | `300` | Lifetime of a download URL, at most 7 days. |
| `ATTACHMENT_UNREFERENCED_TTL_HOURS` | `24` | Age after which cleanup deletes an unreferenced attachment. |
| `ATTACHMENT_MAX_PER_EXPENSE` | `10` | Most files linked to one expense; see [expense attachments](expenses.md#attachments). |

The S3 client sends checksums only where the API requires them, because not every S3-compatible service accepts the ones newer AWS SDKs add by default. `S3_BUCKET` stays private: attachments are read only through signed URLs. Avatars live in `S3_AVATAR_BUCKET`, which anyone can read (on R2, through a public custom domain), so a public setting never reaches attachments. The same credentials need read and write access to both buckets. In development, the `object-storage-setup` service in `compose.yaml` creates the avatar bucket and makes it public.

## Storage

`attachments`:

| Column | Definition |
| --- | --- |
| `id` | `uuid`, PK, default `gen_random_uuid()`; the server sets it to the ID in the storage key |
| `household_id` | `uuid`, not null, FK to `organization.id`, `ON DELETE CASCADE` |
| `storage_key` | `text`, not null, unique |
| `mime_type` | `text`, not null; the detected type |
| `size_bytes` | `bigint`, not null |
| `uploaded_by_id` | `uuid`, not null, FK to `user.id`, `ON DELETE RESTRICT` |
| `created_at` | `timestamptz`, not null, default `now()` |

- `attachments_uploader_party_fk` references `household_membership_history` from (`household_id`, `uploaded_by_id`).
- Check: `attachments_size_positive` (`size_bytes > 0`). The allowed types and the size limit are enforced by the upload route only.
- `attachments_id_household_id_key`, unique on (`id`, `household_id`), is the target of `expense_attachments_attachment_fk`, which keeps a link in its file's household.
- Indexes: `attachments_household_idx` on `household_id`, and `attachments_created_at_idx` on `created_at` for cleanup.

`storage_object_deletions`:

| Column | Definition |
| --- | --- |
| `storage_key` | `text`, PK |
| `queued_at` | `timestamptz`, not null, default `now()` |

- It has no foreign keys, so its rows outlive the household.
- The `attachments_queue_object_deletion` trigger, `AFTER DELETE ON attachments`, inserts the deleted row's `storage_key` with `ON CONFLICT DO NOTHING`, whichever path deletes it.
