import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Badge, Box, Button, Group, Loader, Paper, ScrollArea, Select, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { Calendar, Search } from 'lucide-react';
import { performancesApi, theatresApi } from '../services/api';
import { EmptyState, LoadingState, Page, PageHeader } from '../components/Page';
import { PerformanceCard } from '../components/PerformanceCard';
import type { Performance, Theatre } from '../types';

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
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filterHeight, setFilterHeight] = useState(0);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const didRequestInitialResultsRef = useRef(false);
  const resetResultsAfterLoadRef = useRef(false);
  const hasMore = page < totalPages;

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    if (didRequestInitialResultsRef.current) {
      resetResultsAfterLoadRef.current = true;
    } else {
      didRequestInitialResultsRef.current = true;
    }
    loadPerformances(1);
  }, [searchQuery, selectedGenre, selectedProvince, selectedCity, dateFrom, dateTo]);

  useEffect(() => {
    const node = filterRef.current;
    if (!node) return;

    const updateFilterHeight = () => setFilterHeight(node.getBoundingClientRect().height);
    updateFilterHeight();

    const observer = new ResizeObserver(updateFilterHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  async function loadFilterOptions() {
    try {
      const [genreData, theatreData] = await Promise.all([
        performancesApi.getGenres(),
        theatresApi.getAll(),
      ]);
      setGenres(genreData.genres || []);
      setTheatres(theatreData.theatres || []);
    } catch (err) {
      console.error('Error loading agenda filters:', err);
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
        province: selectedProvince,
        city: selectedCity,
        q: searchQuery,
        date_from: dateFrom,
        date_to: dateTo ? `${dateTo} 23:59:59` : '',
      });
      const nextPerformances = perfData.performances || [];
      setPerformances(prev => append ? [...prev, ...nextPerformances] : nextPerformances);
      setPage(perfData.page || nextPage);
      setTotal(perfData.total || 0);
      setTotalPages(perfData.totalPages || 1);

      if (!append) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            rowVirtualizer.measure();
          });
        });
      }
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
      key: `performance-${performance.performance_id || performance.id}`,
      label: formatDate(performance.date_time),
      performance,
    }));
  }, [performances]);

  const provinces = useMemo(() => (
    [...new Set(theatres.map(theatre => theatre.province).filter(Boolean))].sort()
  ), [theatres]);

  const cities = useMemo(() => (
    [...new Set(
      theatres
        .filter(theatre => !selectedProvince || theatre.province === selectedProvince)
        .map(theatre => theatre.city)
        .filter(Boolean)
    )].sort()
  ), [selectedProvince, theatres]);

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
  const visibleVirtualRows = virtualRows.map(virtualRow => ({
    virtualRow,
    adjustedStart: virtualRow.start,
  }));
  const topmostVisibleRow = virtualRows.find(virtualRow => {
    const viewportTop = virtualRow.start - scrollOffset;
    const viewportBottom = viewportTop + virtualRow.size;
    return viewportBottom > stickyFilterBottom;
  });

  const activeDateLabel = topmostVisibleRow 
    ? agendaRows[topmostVisibleRow.index]?.label 
    : undefined;

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
          radius="md"
          withBorder
          style={{
            background: 'rgba(23, 19, 21, 0.94)',
            backdropFilter: 'blur(16px)',
            overflow: 'hidden',
          }}
          aria-label="Agenda filters"
        >
          <Box p="sm">
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
                <Select
                  aria-label="Provincie"
                  placeholder="Provincie"
                  data={provinces}
                  value={selectedProvince || null}
                  onChange={value => {
                    const nextProvince = value || '';
                    setSelectedProvince(nextProvince);
                    if (selectedCity) {
                      const cityStillAvailable = theatres.some(theatre => (
                        theatre.city === selectedCity &&
                        (!nextProvince || theatre.province === nextProvince)
                      ));
                      if (!cityStillAvailable) setSelectedCity('');
                    }
                  }}
                  clearable
                  searchable
                  size="xs"
                  style={{ flex: '0 1 160px' }}
                />
                <Select
                  aria-label="Plaats"
                  placeholder="Plaats"
                  data={cities}
                  value={selectedCity || null}
                  onChange={value => setSelectedCity(value || '')}
                  clearable
                  searchable
                  size="xs"
                  style={{ flex: '0 1 150px' }}
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
          </Box>

          <Box
            p="xs"
            style={{
              borderTop: '1px solid var(--mantine-color-default-border)',
              background: 'rgba(0, 0, 0, 0.1)',
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
          </Box>
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
                  <PerformanceCard performance={row.performance} />
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
