import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { ArrowLeft, Calendar, Globe, MapPin, Theater, Users } from 'lucide-react';
import { theatresApi } from '../services/api';
import { EmptyState, LoadingState, Page } from '../components/Page';

export default function TheatreDetailPage() {
  const { id } = useParams();
  const [theatre, setTheatre] = useState(null);
  const [performances, setPerformances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTheatre();
  }, [id]);

  async function loadTheatre() {
    try {
      const data = await theatresApi.getById(id);
      setTheatre(data.theatre);
      setPerformances(data.performances || []);
    } catch (err) {
      console.error('Error loading theatre:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) return <Page><LoadingState /></Page>;

  if (!theatre) {
    return (
      <Page>
        <EmptyState
          icon={<Theater size={32} />}
          title="Theater niet gevonden"
          action={<Button component={Link} to="/theaters" color="gold">Terug naar theaters</Button>}
        />
      </Page>
    );
  }

  return (
    <Page>
      <Stack gap="xl">
        <Button component={Link} to="/theaters" variant="subtle" color="gray" leftSection={<ArrowLeft size={16} />} w="fit-content">
          Alle theaters
        </Button>

        <Card p="xl" shadow="xl">
          <Stack>
            <ThemeIcon size={64} radius="md" color="wine" variant="light"><Theater size={34} /></ThemeIcon>
            <Title order={1}>{theatre.name}</Title>
            <Group>
              <Text c="dimmed"><MapPin size={16} style={{ verticalAlign: -3 }} /> {theatre.address}</Text>
              <Badge color="gold" variant="light">{theatre.province}</Badge>
            </Group>
          </Stack>
        </Card>

        {theatre.description && (
          <Card p="xl">
            <Title order={2} mb="sm">Over dit theater</Title>
            <Text c="dimmed">{theatre.description}</Text>
          </Card>
        )}

        {theatre.website && (
          <Button component="a" href={theatre.website} target="_blank" rel="noopener noreferrer" variant="outline" color="gold" leftSection={<Globe size={18} />} w="fit-content">
            Website bezoeken
          </Button>
        )}

        <Stack>
          <Title order={2}>Aankomende voorstellingen ({performances.length})</Title>
          {performances.length === 0 ? (
            <EmptyState title="Geen aankomende voorstellingen" text="Er staan nog geen voorstellingen gepland." />
          ) : (
            <Stack gap="sm">
              {performances.map(perf => (
                <Card component={Link} to={`/voorstelling/${perf.id}`} key={perf.id} p="md">
                  <Group justify="space-between" align="center">
                    <Stack gap={2} miw={90}>
                      <Text fw={700} c="gold.3">{formatTime(perf.date_time)}</Text>
                      <Text size="sm" c="dimmed">{formatDate(perf.date_time)}</Text>
                    </Stack>
                    <Stack gap={4} flex={1}>
                      <Title order={3}>{perf.title}</Title>
                      <Badge color="gold" variant="light" w="fit-content">{perf.genre}</Badge>
                    </Stack>
                    {perf.attendee_count > 0 && <Badge color="wine" variant="light" leftSection={<Users size={12} />}>{perf.attendee_count}</Badge>}
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Page>
  );
}
