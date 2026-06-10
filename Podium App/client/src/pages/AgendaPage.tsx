import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Badge, Button, Group, Loader, ScrollArea, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { Calendar, Search } from 'lucide-react';
import { performancesApi } from '../services/api';
import { EmptyState, LoadingState, Page, PageHeader } from '../components/Page';
import { PerformanceCard } from '../components/PerformanceCard';
import type { Performance } from '../types';

const PAGE_SIZE = 24;

type AgendaRow =
  | { type: 'date'; key: string; label: string }
  | { type: 'performance'; key: string; performance: Performance };

export default function AgendaPage() {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const listRef = useRef<HTMLDivElement | null>(null);
  const hasMore = page < totalPages;

  useEffect(() => {
    loadGenres();
  }, []);

  useEffect(() => {
    loadPerformances(1);
  }, [searchQuery, selectedGenre, dateFrom, dateTo]);

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
        date_from: dateFrom,
        date_to: dateTo ? `${dateTo} 23:59:59` : '',
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

  const agendaRows = useMemo<AgendaRow[]>(() => {
    const rows: AgendaRow[] = [];
    const seenDates = new Set<string>();

    performances.forEach(performance => {
      const dateKey = new Date(performance.date_time).toLocaleDateString('nl-NL');
      if (!seenDates.has(dateKey)) {
        rows.push({
          type: 'date',
          key: `date-${dateKey}`,
          label: formatDate(performance.date_time),
        });
        seenDates.add(dateKey);
      }

      rows.push({
        type: 'performance',
        key: `performance-${performance.id}`,
        performance,
      });
    });

    return rows;
  }, [performances]);

  const rowVirtualizer = useWindowVirtualizer({
    count: agendaRows.length,
    estimateSize: index => agendaRows[index]?.type === 'date' ? 44 : 156,
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualRows[virtualRows.length - 1]?.index ?? -1;

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    if (lastVirtualIndex < agendaRows.length - 6) return;

    loadPerformances(page + 1, true);
  }, [agendaRows.length, hasMore, lastVirtualIndex, loading, loadingMore, page]);

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
        <Group align="flex-end" grow>
          <TextInput
            label="Vanaf"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <TextInput
            label="Tot en met"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={e => setDateTo(e.target.value)}
          />
          {(dateFrom || dateTo) && (
            <Button
              variant="subtle"
              color="gray"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
            >
              Wis datums
            </Button>
          )}
        </Group>
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
      ) : agendaRows.length === 0 ? (
        <EmptyState icon={<Calendar size={32} />} title="Geen voorstellingen gevonden" text="Probeer een andere zoekopdracht of filter." />
      ) : (
        <Stack gap="xl">
          <Text c="dimmed" size="sm">
            {performances.length} van {total} voorstellingen
          </Text>
          <div
            ref={listRef}
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualRows.map(virtualRow => {
              const row = agendaRows[virtualRow.index];
              if (!row) return null;

              return (
                <div
                  key={row.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                    paddingBottom: row.type === 'date' ? 8 : 12,
                  }}
                >
                  {row.type === 'date' ? (
                    <Group gap="xs">
                      <ThemeIcon color="gold" variant="light" size="sm"><Calendar size={14} /></ThemeIcon>
                      <Text fw={700}>{row.label}</Text>
                    </Group>
                  ) : (
                    <PerformanceCard performance={row.performance} showDate={false} />
                  )}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <Group justify="center" py="md" aria-live="polite">
              {loadingMore && (
                <>
                  <Loader color="gold" size="sm" />
                  <Text c="dimmed" size="sm">Meer voorstellingen laden...</Text>
                </>
              )}
            </Group>
          )}
        </Stack>
      )}
    </Page>
  );
}
