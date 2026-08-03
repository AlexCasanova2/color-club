create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname in (
      'advance-challenges',
      'reset-monthly-seasons',
      'weekly-summary-notifications',
      'challenge-deadline-notifications',
      'daily-reengagement-notifications'
    )
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'advance-challenges',
    '* * * * *',
    'select public.advance_challenges()'
  );

  perform cron.schedule(
    'reset-monthly-seasons',
    '5 0 * * *',
    'select public.reset_monthly_seasons()'
  );

  perform cron.schedule(
    'weekly-summary-notifications',
    '0 9 * * 1',
    'select public.create_weekly_summary_notifications()'
  );

  perform cron.schedule(
    'challenge-deadline-notifications',
    '*/10 * * * *',
    'select public.create_challenge_deadline_notifications()'
  );

  perform cron.schedule(
    'daily-reengagement-notifications',
    '0 18 * * *',
    'select public.create_reengagement_notifications()'
  );
end
$$;
