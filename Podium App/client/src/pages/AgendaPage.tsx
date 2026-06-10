import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Badge, Button, Group, Loader, Paper, ScrollArea, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { Calendar, Search } from 'lucide-react';
import { performancesApi } from '../services/api';
import { EmptyState, LoadingState, Page, PageHeader } from '../components/Page';
import { PerformanceCard } from '../components/PerformanceCard';
import type { Performance } from '../types';

const PAGE_SIZE = 24;
const STICKY_FILTER_TOP = 72;
const STICKY_FILTER_GAP = 12;

type AgendaRow = {
  key: string;
  label: string;
  performance: Performance;
};

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
  const [filterHeight, setFilterHeight] = useState(0);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const hasMore = page < totalPages;

  useEffect(() => {
    loadGenres();
  }, []);

  useEffect(() => {
    loadPerformances(1);
  }, [searchQuery, selectedGenre, dateFrom, dateTo]);

  useEffect(() => {
    const node = filterRef.current;
    if (!node) return;

    const updateFilterHeight = () => setFilterHeight(node.getBoundingClientRect().height);
    updateFilterHeight();

    const observer = new ResizeObserver(updateFilterHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
    return performances.map(performance => ({
      key: `performance-${performance.id}`,
      label: formatDate(performance.date_time),
      performance,
    }));
  }, [performances]);

  const rowVirtualizer = useWindowVirtualizer({
    count: agendaRows.length,
    estimateSize: () => 156,
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualRows[virtualRows.length - 1]?.index ?? -1;
  const currentFilterBottom = filterRef.current?.getBoundingClientRect().bottom;
  const stickyFilterBottom = (currentFilterBottom ?? STICKY_FILTER_TOP + filterHeight) + STICKY_FILTER_GAP;
  const scrollOffset = rowVirtualizer.scrollOffset ?? 0;
  let nextAllowedViewportTop = stickyFilterBottom;
  const visibleVirtualRows = virtualRows.flatMap(virtualRow => {
    if (!filterHeight) return [{ virtualRow, adjustedStart: virtualRow.start }];

    const viewportTop = virtualRow.start - scrollOffset;
    const viewportBottom = viewportTop + virtualRow.size;
    if (viewportBottom <= stickyFilterBottom) return [];

    const adjustedViewportTop = Math.max(viewportTop, nextAllowedViewportTop);
    nextAllowedViewportTop = adjustedViewportTop + virtualRow.size;

    return [{ virtualRow, adjustedStart: adjustedViewportTop + scrollOffset }];
  });
  const activeDateLabel = visibleVirtualRows
    .map(({ virtualRow }) => agendaRows[virtualRow.index]?.label)
    .find(Boolean);

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

      <div
        ref={filterRef}
        style={{
          position: 'sticky',
          top: STICKY_FILTER_TOP,
          zIndex: 80,
          marginBottom: 'var(--mantine-spacing-lg)',
        }}
      >
        <Paper
          component="section"
          p="sm"
          radius="md"
          withBorder
          style={{
            background: 'rgba(23, 19, 21, 0.94)',
            backdropFilter: 'blur(16px)',
          }}
          aria-label="Agenda filters"
        >
          <Stack gap="xs">
            <Group gap="xs" align="center" wrap="wrap">
              <TextInput
                aria-label="Zoeken"
                placeholder="Zoek op titel of theater..."
                leftSection={<Search size={15} />}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                size="xs"
                style={{ flex: '1 1 260px' }}
              />
              <TextInput
                aria-label="Vanaf"
                placeholder="Vanaf"
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                size="xs"
                style={{ flex: '0 1 150px' }}
              />
              <TextInput
                aria-label="Tot en met"
                placeholder="Tot en met"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => setDateTo(e.target.value)}
                size="xs"
                style={{ flex: '0 1 150px' }}
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                >
                  Wissen
                </Button>
              )}
            </Group>
            <ScrollArea type="hover" offsetScrollbars scrollbarSize={4}>
              <Group gap={6} wrap="nowrap">
                <Badge
                  component="button"
                  color={!selectedGenre ? 'gold' : 'gray'}
                  variant={!selectedGenre ? 'filled' : 'light'}
                  size="sm"
                  onClick={() => setSelectedGenre('')}
                  style={{ cursor: 'pointer', flex: '0 0 auto' }}
                >
                  Alles
                </Badge>
                {genres.map(genre => (
                  <Badge
                    component="button"
                    key={genre}
                    color={selectedGenre === genre ? 'gold' : 'gray'}
                    variant={selectedGenre === genre ? 'filled' : 'light'}
                    size="sm"
                    onClick={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
                    style={{ cursor: 'pointer', flex: '0 0 auto' }}
                  >
                    {genre}
                  </Badge>
                ))}
              </Group>
            </ScrollArea>
          </Stack>
        </Paper>

        <Paper
          p="xs"
          radius="md"
          withBorder
          mt={6}
          style={{
            background: 'rgba(15, 13, 14, 0.96)',
            backdropFilter: 'blur(16px)',
          }}
          aria-label="Agenda huidige datum"
        >
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Group gap={6} wrap="nowrap" miw={0}>
              <ThemeIcon color="gold" variant="light" size="xs"><Calendar size={12} /></ThemeIcon>
              <Text size="sm" fw={700} truncate>{activeDateLabel || 'Agenda'}</Text>
            </Group>
            <Text c="dimmed" size="xs" style={{ whiteSpace: 'nowrap' }}>
              {total} voorstellingen
            </Text>
          </Group>
        </Paper>
      </div>

      {loading ? (
        <LoadingState />
      ) : agendaRows.length === 0 ? (
        <EmptyState icon={<Calendar size={32} />} title="Geen voorstellingen gevonden" text="Probeer een andere zoekopdracht of filter." />
      ) : (
        <Stack gap="xl">
          <div
            ref={listRef}
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {visibleVirtualRows.map(({ virtualRow, adjustedStart }) => {
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
                    transform: `translateY(${adjustedStart - rowVirtualizer.options.scrollMargin}px)`,
                    paddingBottom: 12,
                  }}
                >
                  <PerformanceCard performance={row.performance} showDate={false} />
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
