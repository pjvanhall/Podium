import { useEffect, useState } from 'react';
import { Badge, Button, Group, ScrollArea, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { Calendar, Search } from 'lucide-react';
import { performancesApi } from '../services/api';
import { EmptyState, LoadingState, Page, PageHeader } from '../components/Page';
import { PerformanceCard } from '../components/PerformanceCard';
import type { Performance } from '../types';

const PAGE_SIZE = 24;

export default function AgendaPage() {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadGenres();
  }, []);

  useEffect(() => {
    loadPerformances(1);
  }, [searchQuery, selectedGenre]);

  async function loadGenres() {
    try {
      const genreData = await performancesApi.getGenres();
      setGenres(genreData.genres || []);
    } catch (err) {
      console.error('Error loading genres:', err);
    }
  }

  async function loadPerformances(nextPage = 1, append = false) {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const perfData = await performancesApi.getAll({
        page: nextPage,
        limit: PAGE_SIZE,
        genre: selectedGenre,
        q: searchQuery,
      });
      const nextPerformances = perfData.performances || [];
      setPerformances(prev => append ? [...prev, ...nextPerformances] : nextPerformances);
      setPage(perfData.page || nextPage);
      setTotal(perfData.total || 0);
      setTotalPages(perfData.totalPages || 1);
    } catch (err) {
      console.error('Error loading agenda:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
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

  const dateGroups = groupByDate(performances);
  const hasMore = page < totalPages;

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
          <Text c="dimmed" size="sm">
            {performances.length} van {total} voorstellingen
          </Text>
          {dateGroups.map(group => (
            <Stack key={group.label} gap="sm">
              <Group gap="xs">
                <ThemeIcon color="gold" variant="light" size="sm"><Calendar size={14} /></ThemeIcon>
                <Text fw={700}>{group.label}</Text>
              </Group>
              <Stack gap="sm">
                {group.performances.map(perf => (
                  <PerformanceCard key={perf.id} performance={perf} showDate={false} />
                ))}
              </Stack>
            </Stack>
          ))}
          {hasMore && (
            <Group justify="center">
              <Button
                color="gold"
                variant="light"
                loading={loadingMore}
                onClick={() => loadPerformances(page + 1, true)}
              >
                Meer laden
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Page>
  );
}
