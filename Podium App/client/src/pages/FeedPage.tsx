import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button, Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { Bell, Calendar, MapPin, Theater, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { feedApi } from '../services/api';
import { EmptyState, LoadingState, Page, PageHeader } from '../components/Page';
import type { FeedItem } from '../types';

export default function FeedPage() {
  const { user } = useAuth();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadFeed();
  }, [user]);

  async function loadFeed() {
    try {
      const data = await feedApi.getFeed();
      setFeed(data.feed || []);
    } catch (err) {
      console.error('Error loading feed:', err);
    } finally {
      setLoading(false);
    }
  }

  function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return 'zojuist';
    if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} uur geleden`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} dagen geleden`;
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  if (!user) {
    return (
      <Page>
        <EmptyState
          icon={<Users size={32} />}
          title="Log in om je vrienden te zien"
          text="Zie wat je vrienden van plan zijn."
          action={<Button component={Link} to="/login" color="gold">Inloggen</Button>}
        />
      </Page>
    );
  }

  return (
    <Page size="md">
      <PageHeader
        title="Vrienden"
        subtitle="Wat je vrienden van plan zijn"
        icon={<Users size={24} />}
        action={
          <Button component={Link} to="/vriendschapsverzoeken" variant="outline" color="gray" leftSection={<Bell size={16} />}>
            Vriendschapsverzoeken
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : feed.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title="Je vriendenpagina is nog leeg"
          text="Stuur vriendschapsverzoeken om activiteiten te zien."
          action={<Button component={Link} to="/vriendschapsverzoeken" color="gold">Verzoek sturen</Button>}
        />
      ) : (
        <Stack gap="md">
          {feed.map((item, i) => (
            <Card key={`${item.user_id}-${item.performance_id}-${i}`} p="lg">
              <Group align="flex-start" gap="md">
                <Avatar component={Link} to={`/profiel/${item.user_id}`} color="wine">
                  {item.user_name?.charAt(0).toUpperCase()}
                </Avatar>
                <Stack gap="xs" flex={1}>
                  <Text>
                    <Text component={Link} to={`/profiel/${item.user_id}`} span fw={700}>{item.user_name}</Text>
                    {' '}gaat naar{' '}
                    <Text component={Link} to={`/voorstelling/${item.performance_id}`} span fw={700} c="gold.3">{item.performance_title}</Text>
                  </Text>
                  <Group gap="md">
                    <Text c="dimmed" size="sm"><Theater size={14} style={{ verticalAlign: -2 }} /> <Link to={`/theater/${item.theatre_id}`}>{item.theatre_name}</Link></Text>
                    <Text c="dimmed" size="sm"><Calendar size={14} style={{ verticalAlign: -2 }} /> {formatDate(item.performance_date)}</Text>
                    <Text c="dimmed" size="sm"><MapPin size={14} style={{ verticalAlign: -2 }} /> {item.theatre_city}</Text>
                  </Group>
                  <Text size="xs" c="dimmed">{timeAgo(item.activity_date)}</Text>
                </Stack>
                <ThemeIcon color="gold" variant="light" visibleFrom="sm"><Calendar size={18} /></ThemeIcon>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Page>
  );
}
