export type ChallengeStatus = 'configuring' | 'active' | 'voting' | 'closed';
export type DurationPreset = '24h' | '48h' | '1week';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Club {
  id: string;
  name: string;
  photo_url: string | null;
  admin_id: string;
  invite_code: string;
  season_reset_mode: 'manual' | 'monthly_auto';
}

export interface Challenge {
  id: string;
  club_id: string;
  season_id: string;
  mode: 'individual_random' | 'shared_color';
  shared_color: string | null;
  duration_preset: DurationPreset;
  starts_at: string;
  ends_at: string;
  voting_ends_at: string | null;
  status: ChallengeStatus;
}

export interface Participant {
  id: string;
  challenge_id: string;
  user_id: string;
  assigned_color: string | null;
  status: 'pending' | 'submitted' | 'disqualified';
  submitted_at: string | null;
  profiles: Profile;
  photos?: Photo[];
}

export interface Photo {
  id: string;
  participant_id: string;
  photo_url: string;
  slot_order: number;
}

export interface RankingRow {
  season_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  points: number;
  position: number;
}

export interface Vote {
  id: string;
  voter_id: string;
  voted_participant_id: string;
}

export interface ActivityItem extends Challenge {
  club_name: string;
  participant_status: Participant['status'];
}
