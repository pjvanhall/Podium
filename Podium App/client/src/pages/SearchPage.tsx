import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button, Card, Group, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { MapPin, Search, User } from 'lucide-react';
import { usersApi } from '../services/api';
import { EmptyState, LoadingState, Page, PageHeader } from '../components/Page';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (query.length < 2) return;

    setLoading(true);
    setSearched(true);
    try {
      const data = await usersApi.search(query);
      setResults(data.users || []);
    } catch (err) {
      console.error('Error searching:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Zoek gebruikers"
        subtitle="Vind andere theaterliefhebbers"
        icon={<Search size={24} />}
      />

      <form onSubmit={handleSearch}>
        <Group align="flex-end" mb="xl">
          <TextInput
            flex={1}
            label="Naam"
            placeholder="Zoek op naam..."
            leftSection={<Search size={16} />}
            value={query}
            onChange={e => setQuery(e.target.value)}
            minLength={2}
          />
          <Button type="submit" color="gold" leftSection={<Search size={18} />}>Zoeken</Button>
        </Group>
      </form>

      {loading ? (
        <LoadingState />
      ) : searched && results.length === 0 ? (
        <EmptyState icon={<User size={32} />} title="Geen gebruikers gevonden" text="Probeer een andere zoekopdracht." />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {results.map(user => (
            <Card component={Link} to={`/profiel/${user.id}`} key={user.id} p="md">
              <Group align="flex-start">
                <Avatar size="lg" color="wine">{user.name?.charAt(0).toUpperCase()}</Avatar>
                <Stack gap={4}>
                  <Title order={3}>{user.name}</Title>
                  {user.city && <Text c="dimmed" size="sm"><MapPin size={14} style={{ verticalAlign: -2 }} /> {user.city}</Text>}
                  {user.bio && <Text c="dimmed" size="sm" lineClamp={2}>{user.bio}</Text>}
                </Stack>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Page>
  );
}
