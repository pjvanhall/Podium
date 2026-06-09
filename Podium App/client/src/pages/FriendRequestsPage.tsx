import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Avatar, Badge, Button, Card, Group, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { ArrowLeft, Bell, Check, Clock, MapPin, Search, UserPlus, Users, X } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../context/AuthContext';
import { connectionsApi, usersApi } from '../services/api';
import { EmptyState, LoadingState, Page, PageHeader } from '../components/Page';
import type { ConnectionStatus, FriendRequest, User } from '../types';

export default function FriendRequestsPage() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchStatuses, setSearchStatuses] = useState<Record<number, ConnectionStatus>>({});
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sendingUserId, setSendingUserId] = useState(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadRequests();
  }, [user]);

  async function loadRequests() {
    setLoading(true);
    setError('');
    try {
      const data = await connectionsApi.getRequests();
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    setError('');

    if (searchQuery.trim().length < 2) {
      setSearched(true);
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    setSearched(true);
    try {
      const data = await usersApi.search(searchQuery.trim());
      const users = data.users || [];
      const statuses = {};

      await Promise.all(users.map(async result => {
        try {
          statuses[result.id] = await connectionsApi.getStatus(result.id);
        } catch (err) {
          statuses[result.id] = { status: 'unknown' };
        }
      }));

      setSearchResults(users);
      setSearchStatuses(statuses);
    } catch (err) {
      setError(err.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSendRequest(toUser) {
    setSendingUserId(toUser.id);
    setError('');

    try {
      await connectionsApi.sendRequest(toUser.id);
      notifications.show({ color: 'green', message: `Vriendschapsverzoek verstuurd naar ${toUser.name}` });
      setSearchStatuses(prev => ({
        ...prev,
        [toUser.id]: { status: 'pending', direction: 'outgoing' },
      }));
      await loadRequests();
      window.dispatchEvent(new Event('podium:friend-requests-updated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingUserId(null);
    }
  }

  async function handleAccept(requestId) {
    setActionId(requestId);
    setError('');
    try {
      await connectionsApi.acceptRequest(requestId);
      setIncoming(prev => prev.filter(request => request.request_id !== requestId));
      setSearchStatuses(prev => Object.fromEntries(
        Object.entries(prev).map(([userId, status]) => [
          userId,
          status.requestId === requestId ? { ...status, status: 'accepted' } : status,
        ])
      ) as Record<number, ConnectionStatus>);
      notifications.show({ color: 'green', message: 'Vriendschapsverzoek geaccepteerd' });
      window.dispatchEvent(new Event('podium:friend-requests-updated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(requestId) {
    setActionId(requestId);
    setError('');
    try {
      await connectionsApi.rejectRequest(requestId);
      setIncoming(prev => prev.filter(request => request.request_id !== requestId));
      notifications.show({ color: 'gray', message: 'Vriendschapsverzoek afgewezen' });
      window.dispatchEvent(new Event('podium:friend-requests-updated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionId(null);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function getSearchButtonState(result) {
    const status = searchStatuses[result.id];

    if (!status || status.status === 'none') {
      return { color: 'gold', disabled: false, label: <><UserPlus size={16} /> Verzoek sturen</> };
    }

    if (status.status === 'pending' && status.direction === 'incoming') {
      return { color: 'gold', disabled: false, label: <><Check size={16} /> Accepteren</>, acceptRequestId: status.requestId };
    }

    if (status.status === 'pending') {
      return { color: 'gray', disabled: true, label: <><Clock size={16} /> Verstuurd</> };
    }

    if (status.status === 'accepted') {
      return { color: 'gray', disabled: true, label: <><Check size={16} /> Vrienden</> };
    }

    return { color: 'gray', disabled: true, label: 'Niet beschikbaar' };
  }

  if (!user) {
    return (
      <Page>
        <EmptyState
          icon={<Users size={32} />}
          title="Log in om vriendschapsverzoeken te zien"
          action={<Button component={Link} to="/login" color="gold">Inloggen</Button>}
        />
      </Page>
    );
  }

  return (
    <Page>
      <Stack gap="xl">
        <Button component={Link} to="/vrienden" variant="subtle" color="gray" leftSection={<ArrowLeft size={16} />} w="fit-content">
          Terug naar vrienden
        </Button>

        <PageHeader
          title="Vriendschapsverzoeken"
          subtitle="Beheer wie je theaterplannen kan volgen."
          icon={<Bell size={24} />}
        />

        {error && <Alert color="red">{error}</Alert>}

        <Card p="xl">
          <Stack>
            <Group>
              <UserPlus size={20} />
              <Title order={2}>Nieuw verzoek sturen</Title>
            </Group>
            <form onSubmit={handleSearch}>
              <Group align="flex-end">
                <TextInput
                  flex={1}
                  label="Gebruiker zoeken"
                  placeholder="Zoek op naam..."
                  leftSection={<Search size={16} />}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  minLength={2}
                />
                <Button type="submit" color="gold" loading={searchLoading} leftSection={<Search size={18} />}>
                  Zoeken
                </Button>
              </Group>
            </form>

            {searched && !searchLoading && searchResults.length === 0 && (
              <Text c="dimmed" size="sm">Geen gebruikers gevonden.</Text>
            )}

            {searchResults.length > 0 && (
              <Stack gap="sm">
                {searchResults.map(result => {
                  const buttonState = getSearchButtonState(result);
                  return (
                    <Card key={result.id} p="md" bg="dark.7">
                      <Group justify="space-between" align="center">
                        <UserRow user={result} />
                        <Button
                          color={buttonState.color}
                          variant={buttonState.disabled ? 'light' : 'filled'}
                          disabled={buttonState.disabled || sendingUserId === result.id}
                          loading={sendingUserId === result.id}
                          onClick={() => buttonState.acceptRequestId ? handleAccept(buttonState.acceptRequestId) : handleSendRequest(result)}
                        >
                          {buttonState.label}
                        </Button>
                      </Group>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </Card>

        {loading ? (
          <LoadingState />
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <RequestSection
              title="Ontvangen"
              icon={<Bell size={18} />}
              count={incoming.length}
              emptyIcon={<UserPlus size={28} />}
              emptyText="Geen openstaande verzoeken."
            >
              {incoming.map(request => (
                <Card key={request.request_id} p="md">
                  <Stack>
                    <UserRow user={request} date={formatDate(request.created_at)} />
                    <Group>
                      <Button color="gold" loading={actionId === request.request_id} leftSection={<Check size={16} />} onClick={() => handleAccept(request.request_id)}>
                        Accepteren
                      </Button>
                      <Button variant="outline" color="gray" disabled={actionId === request.request_id} leftSection={<X size={16} />} onClick={() => handleReject(request.request_id)}>
                        Afwijzen
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </RequestSection>

            <RequestSection
              title="Verstuurd"
              icon={<Clock size={18} />}
              count={outgoing.length}
              emptyIcon={<Users size={28} />}
              emptyText="Geen verzonden verzoeken."
            >
              {outgoing.map(request => (
                <Card component={Link} to={`/profiel/${request.id}`} key={request.request_id} p="md">
                  <UserRow user={request} date={formatDate(request.created_at)} />
                </Card>
              ))}
            </RequestSection>
          </SimpleGrid>
        )}
      </Stack>
    </Page>
  );
}

function UserRow({ user, date }: { user: User; date?: string }) {
  return (
    <Link to={`/profiel/${user.id}`}>
      <Group c="inherit">
        <Avatar color="wine">{user.name?.charAt(0).toUpperCase()}</Avatar>
        <div>
          <Text fw={700}>{user.name}</Text>
          <Group gap="sm">
            {user.city && <Text c="dimmed" size="sm"><MapPin size={13} style={{ verticalAlign: -2 }} /> {user.city}</Text>}
            {date && <Text c="dimmed" size="sm"><Clock size={13} style={{ verticalAlign: -2 }} /> {date}</Text>}
          </Group>
        </div>
      </Group>
    </Link>
  );
}

function RequestSection({ title, icon, count, emptyIcon, emptyText, children }) {
  return (
    <Stack>
      <Group>
        {icon}
        <Title order={2}>{title}</Title>
        <Badge color="gold" variant="light">{count}</Badge>
      </Group>
      {count === 0 ? (
        <Card p="lg" bg="dark.7">
          <Group>
            {emptyIcon}
            <Text c="dimmed">{emptyText}</Text>
          </Group>
        </Card>
      ) : (
        <Stack gap="sm">{children}</Stack>
      )}
    </Stack>
  );
}
