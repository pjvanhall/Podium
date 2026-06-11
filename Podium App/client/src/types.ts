export type Id = number | string;

export type User = {
  id: number;
  email?: string;
  name: string;
  avatar?: string;
  bio?: string;
  city?: string;
  created_at?: string;
  friendCount?: number;
  upcomingCount?: number;
};

export type Theatre = {
  id: Id;
  numeric_id?: number;
  stable_id?: string;
  osm_id?: string;
  name: string;
  city: string;
  address: string;
  province: string;
  image_url?: string;
  website?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
};

export type Performance = {
  id: Id;
  numeric_id?: number;
  show_id?: string;
  title: string;
  description?: string;
  genre?: string;
  date_time: string;
  theatre_id: Id;
  theatre_numeric_id?: number;
  theatre_name?: string;
  theatre_city?: string;
  theatre_address?: string;
  ticket_url?: string;
  image_url?: string;
  attendee_count?: number;
  is_attending?: boolean;
  performance_id?: Id;
  registered_at?: string;
  status?: 'active' | 'changed' | 'removed' | 'cancelled' | string;
  removed?: boolean | number;
  removed_when?: string;
  changed_at?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  missing_since?: string;
  missing_count?: number;
};

export type FriendRequest = User & {
  request_id: number;
  created_at: string;
};

export type ConnectionStatus = {
  status: 'self' | 'none' | 'pending' | 'accepted' | 'rejected' | 'unknown';
  requestId?: number;
  direction?: 'incoming' | 'outgoing';
};

export type FeedItem = {
  activity_date: string;
  user_id: number;
  user_name: string;
  user_avatar?: string;
  performance_id: Id;
  performance_title: string;
  performance_date: string;
  performance_genre?: string;
  theatre_id: Id;
  theatre_name: string;
  theatre_city: string;
};
