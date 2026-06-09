import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { Globe, MapPin, Search, Theater } from 'lucide-react';
import { theatresApi } from '../services/api';
import { EmptyState, LoadingState, Page, PageHeader } from '../components/Page';

export default function TheatresPage() {
  const [theatres, setTheatres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');

  useEffect(() => {
    loadTheatres();
  }, []);

  async function loadTheatres() {
    try {
      const data = await theatresApi.getAll();
      setTheatres(data.theatres || []);
    } catch (err) {
      console.error('Error loading theatres:', err);
    } finally {
      setLoading(false);
    }
  }

  const provinces = [...new Set(theatres.map(t => t.province))].sort();
  const filtered = theatres.filter(t => {
    const matchesSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProvince = !selectedProvince || t.province === selectedProvince;
    return matchesSearch && matchesProvince;
  });

  return (
    <Page>
      <PageHeader
        title="Theaters in Nederland"
        subtitle="Ontdek de mooiste podia van het land en bekijk hun programmering"
        icon={<Theater size={24} />}
      />

      <Group mb="md" align="flex-end">
        <TextInput
          flex={1}
          label="Zoeken"
          placeholder="Zoek op naam of stad..."
          leftSection={<Search size={16} />}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <Select
          label="Provincie"
          placeholder="Alle provincies"
          data={provinces}
          value={selectedProvince || null}
          onChange={value => setSelectedProvince(value || '')}
          clearable
          miw={220}
        />
      </Group>

      <Text c="dimmed" size="sm" mb="lg">
        {filtered.length} {filtered.length === 1 ? 'theater' : 'theaters'} gevonden
      </Text>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Theater size={32} />} title="Geen theaters gevonden" text="Probeer een andere zoekopdracht of filter." />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {filtered.map(theatre => (
            <Card component={Link} to={`/theater/${theatre.id}`} key={theatre.id} p="lg">
              <Stack gap="sm">
                <Group align="flex-start">
                  <ThemeIcon size={48} radius="md" color="wine" variant="light"><Theater size={24} /></ThemeIcon>
                  <div>
                    <Title order={3}>{theatre.name}</Title>
                    <Text c="dimmed" size="sm"><MapPin size={14} style={{ verticalAlign: -2 }} /> {theatre.city}, {theatre.province}</Text>
                  </div>
                </Group>
                {theatre.description && (
                  <Text c="dimmed" size="sm" lineClamp={3}>{theatre.description}</Text>
                )}
                {theatre.website && (
                  <Badge color="gold" variant="light" leftSection={<Globe size={12} />}>
                    Website beschikbaar
                  </Badge>
                )}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Page>
  );
}
