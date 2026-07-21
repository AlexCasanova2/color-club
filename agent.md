# Agent Notes

## Project Context

- App: Color Club, a React Native/Expo mobile app backed by Supabase.
- Main branch: `main`.
- Expo SDK: `~54.0.36`.
- Local validation usually uses `npm run typecheck`, `npx expo-doctor` and `git diff --check`.
- Supabase migrations live in `supabase/migrations/` and are applied manually or with `supabase db push`.

## Product Rules

- The UI should stay playful, colorful and rounded.
- Preserve the floating black bottom dock and the sticky black capsule header pattern.
- Internal screens such as challenge creation, chat, club management and edit profile hide the bottom dock.
- Toasts must use `src/components/Toast.tsx` so the progress bar reaches the measured full width before the toast fades out.

## Implementation Notes

- Navigation is manual in `App.tsx`; there is no router package.
- Supabase access helpers are centralized in `src/lib/api.ts`.
- Domain types live in `src/types/domain.ts`.
- Shared UI primitives live in `src/components/ui.tsx`.
- Color tokens live in `src/lib/theme.ts`.
- Chat uses `club_messages` and Supabase Realtime.
- In-app notifications use `notifications` and Supabase Realtime.

## Database Notes

- Do not assume migrations are applied remotely unless the user confirms it.
- New schema changes should be added as a new numbered migration, not edited into an already-applied migration unless explicitly requested.
- Weekly summary notifications require scheduling `create_weekly_summary_notifications()` in Supabase Scheduler/Cron.

## Git Notes

- Check `git status --short`, `git diff` and recent commits before committing.
- Do not revert unrelated local changes.
- Commit only after validations pass unless the user explicitly asks otherwise.
