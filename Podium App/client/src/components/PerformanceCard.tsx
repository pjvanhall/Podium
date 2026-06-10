import { Link } from 'react-router-dom';
import { Badge, Box, Button, Card, Group, Image, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { Calendar, Clock, ExternalLink, MapPin, Theater, Users } from 'lucide-react';
import type { Performance } from '../types';

type PerformanceCardProps = {
  performance: Performance;
  layout?: 'list' | 'grid';
  showDate?: boolean;
  showTheatre?: boolean;
  showAttendees?: boolean;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function detailPath(performance: Performance) {
  return `/voorstelling/${performance.performance_id || performance.id}`;
}

function PerformanceImage({ performance, layout }: { performance: Performance; layout: 'list' | 'grid' }) {
  const size = layout === 'grid' ? '100%' : 96;

  if (performance.image_url) {
    return (
      <Box component={Link} to={detailPath(performance)} w={size} miw={layout === 'list' ? 96 : undefined}>
        <Image
          src={performance.image_url}
          alt={performance.title}
          radius="md"
          h={layout === 'grid' ? 150 : 96}
          fit="cover"
        />
      </Box>
    );
  }

  return (
    <Link to={detailPath(performance)}>
      <ThemeIcon
        size={layout === 'grid' ? 150 : 96}
        w={layout === 'grid' ? '100%' : 96}
        miw={layout === 'list' ? 96 : undefined}
        radius="md"
        color="wine"
        variant="light"
      >
        <Theater size={layout === 'grid' ? 42 : 32} />
      </ThemeIcon>
    </Link>
  );
}

export function PerformanceCard({
  performance,
  layout = 'list',
  showDate = true,
  showTheatre = true,
  showAttendees = true,
}: PerformanceCardProps) {
  const dateTime = (
    <Group gap="xs">
      {showDate && (
        <Text size="sm" c="dimmed">
          <Calendar size={14} style={{ verticalAlign: -2 }} /> {formatDate(performance.date_time)}
        </Text>
      )}
      <Text size="sm" c="gold.3">
        <Clock size={14} style={{ verticalAlign: -2 }} /> {formatTime(performance.date_time)}
      </Text>
    </Group>
  );

  const badges = (
    <Group gap="xs">
      {performance.genre && <Badge color="gold" variant="light">{performance.genre}</Badge>}
      {showAttendees && performance.attendee_count > 0 && (
        <Badge color="wine" variant="light" leftSection={<Users size={12} />}>{performance.attendee_count}</Badge>
      )}
      {performance.is_attending && <Badge color="green">Ik ga</Badge>}
    </Group>
  );

  const ticketButton = performance.ticket_url ? (
    <Button
      component="a"
      href={performance.ticket_url}
      target="_blank"
      rel="noopener noreferrer"
      color="gold"
      variant="light"
      size="xs"
      leftSection={<ExternalLink size={14} />}
      w="fit-content"
    >
      Tickets
    </Button>
  ) : null;

  const content = (
    <Stack gap="xs" flex={1} miw={0}>
      <Group justify="space-between" align="flex-start" gap="sm">
        {badges}
        {layout === 'grid' && ticketButton}
      </Group>
      <Link to={detailPath(performance)}>
        <Title order={3} lineClamp={2}>
          {performance.title}
        </Title>
      </Link>
      {showTheatre && performance.theatre_name && (
        <Text c="dimmed" size="sm" lineClamp={1}>
          <MapPin size={14} style={{ verticalAlign: -2 }} /> {performance.theatre_name}
          {performance.theatre_city ? ` · ${performance.theatre_city}` : ''}
        </Text>
      )}
      {dateTime}
    </Stack>
  );

  return (
    <Card p={layout === 'grid' ? 'lg' : 'md'} h="100%">
      {layout === 'grid' ? (
        <Stack gap="md" h="100%">
          <PerformanceImage performance={performance} layout="grid" />
          {content}
        </Stack>
      ) : (
        <Group align="center" gap="md" wrap="nowrap">
          <PerformanceImage performance={performance} layout="list" />
          {content}
          {ticketButton}
        </Group>
      )}
    </Card>
  );
}
