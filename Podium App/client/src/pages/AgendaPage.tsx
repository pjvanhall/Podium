import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Group, ScrollArea, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { Calendar, MapPin, Search, Users } from 'lucide-react';
import { performancesApi } from '../services/api';
import { EmptyState, LoadingState, Page, PageHeader } from '../components/Page';
import type { Performance } from '../types';

export default function AgendaPage() {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [perfData, genreData] = await Promise.all([
        performancesApi.getAll(),
        performancesApi.getGenres(),
      ]);
      setPerformances(perfData.performances || []);
      setGenres(genreData.genres || []);
    } catch (err) {
      console.error('Error loading agenda:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function groupByDate(perfs: Performance[]) {
    const groups: Record<string, { label: string; performances: Performance[] }> = {};
    perfs.forEach(p => {
      const dateKey = new Date(p.date_time).toLocaleDateString('nl-NL');
      if (!groups[dateKey]) {
        groups[dateKey] = { label: formatDate(p.date_time), performances: [] };
      }
      groups[dateKey].performances.push(p);
    });
    return Object.values(groups);
  }

  const filtered = performances.filter(p => {
    const matchesSearch = !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.theatre_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = !selectedGenre || p.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  const dateGroups = groupByDate(filtered);

  return (
    <Page>
      <PageHeader
        title="Agenda"
        subtitle="Alle aankomende voorstellingen in Nederland"
        icon={<Calendar size={24} />}
      />

      <Stack gap="md" mb="xl">
        <TextInput
          label="Zoeken"
          placeholder="Zoek op titel of theater..."
          leftSection={<Search size={16} />}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <ScrollArea>
          <Group gap="xs" wrap="nowrap">
            <Badge
              component="button"
              color={!selectedGenre ? 'gold' : 'gray'}
              variant={!selectedGenre ? 'filled' : 'light'}
              onClick={() => setSelectedGenre('')}
              style={{ cursor: 'pointer' }}
            >
              Alles
            </Badge>
            {genres.map(genre => (
              <Badge
                component="button"
                key={genre}
                color={selectedGenre === genre ? 'gold' : 'gray'}
                variant={selectedGenre === genre ? 'filled' : 'light'}
                onClick={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
                style={{ cursor: 'pointer' }}
              >
                {genre}
              </Badge>
            ))}
          </Group>
        </ScrollArea>
      </Stack>

      {loading ? (
        <LoadingState />
      ) : dateGroups.length === 0 ? (
        <EmptyState icon={<Calendar size={32} />} title="Geen voorstellingen gevonden" text="Probeer een andere zoekopdracht of filter." />
      ) : (
        <Stack gap="xl">
          {dateGroups.map(group => (
            <Stack key={group.label} gap="sm">
              <Group gap="xs">
                <ThemeIcon color="gold" variant="light" size="sm"><Calendar size={14} /></ThemeIcon>
                <Text fw={700}>{group.label}</Text>
              </Group>
              <Stack gap="sm">
                {group.performances.map(perf => (
                  <Card component={Link} to={`/voorstelling/${perf.id}`} key={perf.id} p="md">
                    <Group justify="space-between" align="center" gap="md">
                      <Stack gap={2} miw={82}>
                        <Text fw={700} c="gold.3">{formatTime(perf.date_time)}</Text>
                        <Badge color="gold" variant="light">{perf.genre}</Badge>
                      </Stack>
                      <Stack gap={4} flex={1}>
                        <Title order={3}>{perf.title}</Title>
                        <Text c="dimmed" size="sm"><MapPin size={14} style={{ verticalAlign: -2 }} /> {perf.theatre_name} · {perf.theatre_city}</Text>
                      </Stack>
                      <Group gap="xs">
                        {perf.attendee_count > 0 && <Badge color="wine" variant="light" leftSection={<Users size={12} />}>{perf.attendee_count}</Badge>}
                        {perf.is_attending && <Badge color="green">Ik ga</Badge>}
                      </Group>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </Page>
  );
}
