import { useEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { ArrowLeft, Globe, MapPin, Theater } from 'lucide-react';
import { theatresApi } from '../services/api';
import { EmptyState, LoadingState, Page } from '../components/Page';
import { PerformanceCard } from '../components/PerformanceCard';
import { TheatreLogo } from '../components/TheatreLogo';

const PAGE_SIZE = 24;

export default function TheatreDetailPage() {
  const { id } = useParams();
  const [theatre, setTheatre] = useState(null);
  const [performances, setPerformances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const listRef = useRef<HTMLDivElement | null>(null);
  const hasMore = page < totalPages;

  useEffect(() => {
    loadTheatre(1);
  }, [id]);

  const performanceVirtualizer = useWindowVirtualizer({
    count: performances.length,
    estimateSize: () => 156,
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const virtualPerformances = performanceVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualPerformances[virtualPerformances.length - 1]?.index ?? -1;

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    if (lastVirtualIndex < performances.length - 6) return;

    loadTheatre(page + 1, true);
  }, [hasMore, lastVirtualIndex, loading, loadingMore, page, performances.length, id]);

  async function loadTheatre(nextPage = 1, append = false) {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const data = await theatresApi.getById(id, { page: nextPage, limit: PAGE_SIZE });
      setTheatre(data.theatre);
      const nextPerformances = data.performances || [];
      setPerformances(prev => append ? [...prev, ...nextPerformances] : nextPerformances);
      setPage(data.performancePagination?.page || nextPage);
      setTotal(data.performancePagination?.total || nextPerformances.length);
      setTotalPages(data.performancePagination?.totalPages || 1);
    } catch (err) {
      console.error('Error loading theatre:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
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

  const fullAddress = [theatre.address, theatre.city]
    .filter(Boolean)
    .join(', ');
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${theatre.name}, ${fullAddress}`)}`;

  return (
    <Page>
      <Stack gap="xl">
        <Button component={Link} to="/theaters" variant="subtle" color="gray" leftSection={<ArrowLeft size={16} />} w="fit-content">
          Alle theaters
        </Button>

        <Card p="xl" shadow="xl">
          <Stack>
            <TheatreLogo src={theatre.image_url} name={theatre.name} size={86} />
            <Title order={1}>{theatre.name}</Title>
            <Group>
              {fullAddress && (
                <Text
                  component="a"
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  c="dimmed"
                  td="none"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <MapPin size={16} />
                  {fullAddress}
                </Text>
              )}
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
          <Title order={2}>Aankomende voorstellingen ({total})</Title>
          {performances.length === 0 ? (
            <EmptyState title="Geen aankomende voorstellingen" text="Er staan nog geen voorstellingen gepland." />
          ) : (
            <Stack gap="sm">
              <div
                ref={listRef}
                style={{
                  height: performanceVirtualizer.getTotalSize(),
                  position: 'relative',
                }}
              >
                {virtualPerformances.map(virtualRow => {
                  const performance = performances[virtualRow.index];
                  if (!performance) return null;

                  return (
                    <div
                      key={performance.id}
                      data-index={virtualRow.index}
                      ref={performanceVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start - performanceVirtualizer.options.scrollMargin}px)`,
                        paddingBottom: 12,
                      }}
                    >
                      <PerformanceCard performance={performance} showTheatre={false} />
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <Group justify="center" mt="md" py="md" aria-live="polite">
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
        </Stack>
      </Stack>
    </Page>
  );
}
