import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Badge, Button, Card, Group, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { Calendar, Check, Clock, Edit, MapPin, UserMinus, UserPlus, Users } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../context/AuthContext';
import { connectionsApi, usersApi } from '../services/api';
import { EmptyState, LoadingState, Page } from '../components/Page';

export default function ProfilePage() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [performances, setPerformances] = useState([]);
  const [friends, setFriends] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('agenda');

  const isOwnProfile = currentUser && parseInt(id) === currentUser.id;

  useEffect(() => {
    loadProfile();
  }, [id, currentUser?.id]);

  async function loadProfile() {
    setLoading(true);
    try {
      const [profileData, perfData, friendsData] = await Promise.all([
        usersApi.getProfile(id),
        usersApi.getAttending(id),
        connectionsApi.getFriends(id),
      ]);
      setProfile(profileData.user);
      setPerformances(perfData.performances || []);
      setFriends(friendsData.friends || []);
      setConnectionStatus(null);

      if (currentUser && !isOwnProfile) {
        const statusData = await connectionsApi.getStatus(id);
        setConnectionStatus(statusData);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFriendAction() {
    if (!connectionStatus) return;
    try {
      if (connectionStatus.status === 'none') {
        await connectionsApi.sendRequest(id);
        setConnectionStatus({ status: 'pending', direction: 'outgoing' });
        notifications.show({ color: 'green', message: 'Vriendschapsverzoek verstuurd' });
      } else if (connectionStatus.status === 'pending' && connectionStatus.direction === 'incoming') {
        await connectionsApi.acceptRequest(connectionStatus.requestId);
        setConnectionStatus({ status: 'accepted' });
        window.dispatchEvent(new Event('podium:friend-requests-updated'));
        loadProfile();
      } else if (connectionStatus.status === 'accepted') {
        await connectionsApi.unfriend(id);
        setConnectionStatus({ status: 'none' });
        loadProfile();
      }
    } catch (err) {
      notifications.show({ color: 'red', message: err.message || 'Er is iets misgegaan' });
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('nl-NL', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  function getFriendButton() {
    if (!connectionStatus) return null;
    switch (connectionStatus.status) {
      case 'none':
        return { text: 'Vriendschapsverzoek sturen', icon: <UserPlus size={16} />, color: 'gold', disabled: false };
      case 'pending':
        return connectionStatus.direction === 'outgoing'
          ? { text: 'Verzoek verstuurd', icon: <Clock size={16} />, color: 'gray', disabled: true }
          : { text: 'Accepteren', icon: <Check size={16} />, color: 'gold', disabled: false };
      case 'accepted':
        return { text: 'Ontvrienden', icon: <UserMinus size={16} />, color: 'gray', disabled: false };
      default:
        return null;
    }
  }

  if (loading) return <Page><LoadingState /></Page>;

  if (!profile) {
    return (
      <Page>
        <EmptyState title="Gebruiker niet gevonden" />
      </Page>
    );
  }

  const friendButton = getFriendButton();

  return (
    <Page>
      <Stack gap="xl">
        <Card p="xl" shadow="xl">
          <Group align="flex-start" justify="space-between" gap="xl">
            <Group align="flex-start">
              <Avatar size={92} color="wine">{profile.name?.charAt(0).toUpperCase()}</Avatar>
              <Stack gap="xs">
                <Title order={1}>{profile.name}</Title>
                {profile.city && <Text c="dimmed"><MapPin size={16} style={{ verticalAlign: -3 }} /> {profile.city}</Text>}
                {profile.bio && <Text c="dimmed" maw={560}>{profile.bio}</Text>}
                <Group>
                  <Badge color="wine" variant="light">{profile.friendCount || 0} vrienden</Badge>
                  <Badge color="gold" variant="light">{profile.upcomingCount || 0} voorstellingen</Badge>
                </Group>
              </Stack>
            </Group>
            {isOwnProfile ? (
              <Button component={Link} to={`/profiel/${id}/bewerken`} variant="outline" color="gray" leftSection={<Edit size={16} />}>
                Profiel bewerken
              </Button>
            ) : currentUser && friendButton ? (
              <Button
                color={friendButton.color}
                variant={connectionStatus.status === 'accepted' ? 'outline' : 'filled'}
                leftSection={friendButton.icon}
                onClick={handleFriendAction}
                disabled={friendButton.disabled}
              >
                {friendButton.text}
              </Button>
            ) : null}
          </Group>
        </Card>

        <Tabs value={activeTab} onChange={setActiveTab} color="gold">
          <Tabs.List>
            <Tabs.Tab value="agenda" leftSection={<Calendar size={16} />}>Agenda ({performances.length})</Tabs.Tab>
            <Tabs.Tab value="vrienden" leftSection={<Users size={16} />}>Vrienden ({friends.length})</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="agenda" pt="lg">
            {performances.length === 0 ? (
              <EmptyState
                icon={<Calendar size={32} />}
                title="Nog geen voorstellingen"
                text={isOwnProfile ? 'Ga naar de agenda om voorstellingen te vinden!' : 'Deze gebruiker heeft zich nog niet aangemeld voor voorstellingen.'}
                action={isOwnProfile && <Button component={Link} to="/agenda" color="gold">Bekijk agenda</Button>}
              />
            ) : (
              <Stack gap="sm">
                {performances.map(perf => (
                  <Card component={Link} to={`/voorstelling/${perf.performance_id || perf.id}`} key={perf.id} p="md">
                    <Group>
                      <Stack gap={2} miw={90}>
                        <Text fw={700} c="gold.3">{formatTime(perf.date_time)}</Text>
                        <Text c="dimmed" size="sm">{formatDate(perf.date_time)}</Text>
                      </Stack>
                      <Stack gap={4}>
                        <Title order={3}>{perf.title}</Title>
                        <Text c="dimmed" size="sm"><MapPin size={14} style={{ verticalAlign: -2 }} /> {perf.theatre_name} · {perf.theatre_city}</Text>
                      </Stack>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="vrienden" pt="lg">
            {friends.length === 0 ? (
              <EmptyState
                icon={<Users size={32} />}
                title="Nog geen vrienden"
                text={isOwnProfile ? 'Stuur een vriendschapsverzoek om je theaterplannen te delen.' : 'Deze gebruiker heeft nog geen vrienden.'}
                action={isOwnProfile && <Button component={Link} to="/vriendschapsverzoeken" color="gold">Verzoek sturen</Button>}
              />
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                {friends.map(friend => (
                  <Card component={Link} to={`/profiel/${friend.id}`} key={friend.id} p="md">
                    <Group>
                      <Avatar color="wine">{friend.name?.charAt(0).toUpperCase()}</Avatar>
                      <div>
                        <Text fw={700}>{friend.name}</Text>
                        {friend.city && <Text c="dimmed" size="sm"><MapPin size={13} style={{ verticalAlign: -2 }} /> {friend.city}</Text>}
                      </div>
                    </Group>
                  </Card>
                ))}
              </SimpleGrid>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Page>
  );
}
