import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Badge, Button, Card, Group, Image, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { Calendar, Check, Clock, ExternalLink, MapPin, Plus, Users } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../context/AuthContext';
import { attendanceApi, performancesApi } from '../services/api';
import { EmptyState, LoadingState, Page } from '../components/Page';
import type { Performance, User } from '../types';
import { getSafeImageUrl } from '../utils/images';

export default function PerformanceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [attendees, setAttendees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [attending, setAttending] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    loadPerformance();
  }, [id]);

  async function loadPerformance() {
    try {
      const data = await performancesApi.getById(id);
      setPerformance(data.performance);
      setAttendees(data.attendees || []);
      setAttending(data.performance?.is_attending || false);
    } catch (err) {
      console.error('Error loading performance:', err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAttendance() {
    if (!user) return;
    setToggling(true);
    try {
      if (attending) {
        await attendanceApi.removeAttending(id);
        setAttending(false);
        setAttendees(prev => prev.filter(a => a.id !== user.id));
        notifications.show({ color: 'gray', message: 'Aanmelding geannuleerd' });
      } else {
        await attendanceApi.markAttending(id);
        setAttending(true);
        setAttendees(prev => [{ id: user.id, name: user.name, avatar: user.avatar, city: user.city }, ...prev]);
        notifications.show({ color: 'green', message: 'Je gaat naar deze voorstelling' });
      }
    } catch (err) {
      notifications.show({ color: 'red', message: err.message || 'Er is iets misgegaan' });
    } finally {
      setToggling(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) return <Page><LoadingState /></Page>;

  if (!performance) {
    return (
      <Page>
        <EmptyState
          title="Voorstelling niet gevonden"
          action={<Button component={Link} to="/agenda" color="gold">Terug naar agenda</Button>}
        />
      </Page>
    );
  }

  const imageUrl = getSafeImageUrl(performance.image_url);

  return (
    <Page>
      <Stack gap="xl">
        <Card p={0} shadow="xl">
          {imageUrl && (
            <Image
              src={imageUrl}
              alt={performance.title}
              h={{ base: 220, md: 360 }}
              fit="cover"
            />
          )}
          <Stack p="xl">
            <Badge color="gold" variant="light" w="fit-content">{performance.genre}</Badge>
            <Title order={1}>{performance.title}</Title>
            <Group gap="lg">
              <Text c="dimmed"><MapPin size={16} style={{ verticalAlign: -3 }} /> <Link to={`/theater/${performance.theatre_id}`}>{performance.theatre_name} · {performance.theatre_city}</Link></Text>
              <Text c="dimmed"><Calendar size={16} style={{ verticalAlign: -3 }} /> {formatDate(performance.date_time)}</Text>
              <Text c="dimmed"><Clock size={16} style={{ verticalAlign: -3 }} /> {formatTime(performance.date_time)}</Text>
            </Group>
          </Stack>
        </Card>

        <Group align="flex-start" gap="xl">
          <Stack flex={1} miw={280}>
            {performance.description && (
              <Card p="xl">
                <Title order={2} mb="sm">Over deze voorstelling</Title>
                <Text c="dimmed">{performance.description}</Text>
              </Card>
            )}

            <Card p="xl">
              <Title order={2} mb="sm">Locatie</Title>
              <Text fw={700}>{performance.theatre_name}</Text>
              <Text c="dimmed">{performance.theatre_address}</Text>
              <Button component={Link} to={`/theater/${performance.theatre_id}`} variant="outline" color="gold" mt="md">
                Bekijk theater
              </Button>
            </Card>

            {performance.ticket_url && (
              <Button component="a" href={performance.ticket_url} target="_blank" rel="noopener noreferrer" variant="outline" color="gray" leftSection={<ExternalLink size={18} />} w="fit-content">
                Tickets kopen
              </Button>
            )}
          </Stack>

          <Stack w={{ base: '100%', md: 320 }}>
            {user ? (
              <Button
                color={attending ? 'green' : 'gold'}
                size="lg"
                loading={toggling}
                leftSection={attending ? <Check size={20} /> : <Plus size={20} />}
                onClick={toggleAttendance}
              >
                {attending ? 'Ik ga!' : 'Ik ga erheen'}
              </Button>
            ) : (
              <Button component={Link} to="/login" color="gold" size="lg">
                Log in om je aan te melden
              </Button>
            )}

            <Card p="lg">
              <Group mb="md">
                <ThemeIcon color="wine" variant="light"><Users size={18} /></ThemeIcon>
                <Title order={3}>Wie gaat er? ({attendees.length})</Title>
              </Group>
              {attendees.length === 0 ? (
                <Text c="dimmed" size="sm">Nog niemand aangemeld. Wees de eerste!</Text>
              ) : (
                <Stack gap="sm">
                  {attendees.map(a => (
                    <Link to={`/profiel/${a.id}`} key={a.id}>
                      <Group>
                        <Avatar color="wine">{a.name?.charAt(0).toUpperCase()}</Avatar>
                        <div>
                          <Text fw={600}>{a.name}</Text>
                          {a.city && <Text size="sm" c="dimmed">{a.city}</Text>}
                        </div>
                      </Group>
                    </Link>
                  ))}
                </Stack>
              )}
            </Card>
          </Stack>
        </Group>
      </Stack>
    </Page>
  );
}
