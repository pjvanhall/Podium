import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { ArrowRight, Calendar, Sparkles, Star, Theater, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { performancesApi, theatresApi } from '../services/api';
import { LoadingState, Page } from '../components/Page';
import { PerformanceCard } from '../components/PerformanceCard';
import { TheatreLogo } from '../components/TheatreLogo';

export default function HomePage() {
  const { user } = useAuth();
  const [upcomingPerformances, setUpcomingPerformances] = useState([]);
  const [theatres, setTheatres] = useState([]);
  const [stats, setStats] = useState({ theatres: 0, performances: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [perfData, allPerfData, theatreData] = await Promise.all([
        performancesApi.getAll({ limit: 6 }),
        performancesApi.getAll({ limit: 1, date_from: '1900-01-01' }),
        theatresApi.getAll(),
      ]);
      const nextPerformances = perfData.performances || [];
      const nextTheatres = theatreData.theatres || [];

      setUpcomingPerformances(nextPerformances.slice(0, 6));
      setTheatres(nextTheatres.slice(0, 6));
      setStats({
        theatres: nextTheatres.length,
        performances: allPerfData.total ?? perfData.total ?? nextPerformances.length,
      });
    } catch (err) {
      console.error('Error loading homepage data:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page size="lg">
      <Stack gap={56}>
        <Card p={{ base: 'xl', md: 48 }} shadow="xl" bg="rgba(35, 30, 32, 0.82)">
          <Stack gap="lg" maw={820}>
            <Group gap="xs">
              <ThemeIcon color="gold" variant="light" size="sm"><Sparkles size={14} /></ThemeIcon>
              <Text c="gold.3" fw={600}>Het sociale platform voor theaterliefhebbers</Text>
            </Group>
            <Title order={1} fz={{ base: 42, md: 68 }} lh={1.02}>
              Ontdek, deel en beleef het theater samen
            </Title>
            <Text size="xl" c="dimmed" maw={680}>
              Vind voorstellingen in heel Nederland, zie wie er nog meer gaat,
              en maak van elke theateravond een gedeelde ervaring.
            </Text>
            <Group>
              {user ? (
                <>
                  <Button component={Link} to="/agenda" color="gold" size="lg" leftSection={<Calendar size={20} />}>
                    Bekijk de agenda
                  </Button>
                  <Button component={Link} to="/theaters" variant="outline" color="gray" size="lg">
                    Ontdek theaters
                  </Button>
                </>
              ) : (
                <>
                  <Button component={Link} to="/registreren" color="gold" size="lg" rightSection={<ArrowRight size={20} />}>
                    Gratis registreren
                  </Button>
                  <Button component={Link} to="/agenda" variant="outline" color="gray" size="lg">
                    Bekijk voorstellingen
                  </Button>
                </>
              )}
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt="md">
              <Stat icon={<Theater size={18} />} value={formatCount(stats.theatres)} label="Theaters" />
              <Stat icon={<Star size={18} />} value={formatCount(stats.performances)} label="Voorstellingen" />
              <Stat icon={<Users size={18} />} value="Gratis" label="Registreren" />
            </SimpleGrid>
          </Stack>
        </Card>

        <SectionHeader title="Binnenkort op het Podium" subtitle="De eerstvolgende voorstellingen in Nederland" to="/agenda" cta="Alle voorstellingen" />
        {loading ? (
          <LoadingState />
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {upcomingPerformances.map(perf => (
              <PerformanceCard key={perf.id} performance={perf} layout="grid" />
            ))}
          </SimpleGrid>
        )}

        <SectionHeader title="Theaters in Nederland" subtitle="Ontdek de mooiste podia van het land" to="/theaters" cta="Alle theaters" />
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {theatres.map(theatre => (
            <Card component={Link} to={`/theater/${theatre.id}`} key={theatre.id} p="lg">
              <Group align="flex-start">
                <TheatreLogo src={theatre.image_url} name={theatre.name} size={46} />
                <Box>
                  <Title order={3}>{theatre.name}</Title>
                  <Text c="dimmed" size="sm">{theatre.city}, {theatre.province}</Text>
                </Box>
              </Group>
            </Card>
          ))}
        </SimpleGrid>

        {!user && (
          <Card p="xl" ta="center" bg="rgba(123, 45, 59, 0.18)">
            <Stack align="center">
              <Title order={2}>Klaar om het theater samen te beleven?</Title>
              <Text c="dimmed">Maak een gratis account aan en ontdek wie er naar dezelfde voorstellingen gaat.</Text>
              <Button component={Link} to="/registreren" color="gold" rightSection={<ArrowRight size={18} />}>
                Begin nu
              </Button>
            </Stack>
          </Card>
        )}
      </Stack>
    </Page>
  );
}

function formatCount(value) {
  return new Intl.NumberFormat('nl-NL').format(value);
}

function Stat({ icon, value, label }) {
  return (
    <Card p="md" bg="dark.7">
      <Group gap="sm">
        <ThemeIcon color="gold" variant="light">{icon}</ThemeIcon>
        <Box>
          <Text fw={700}>{value}</Text>
          <Text size="sm" c="dimmed">{label}</Text>
        </Box>
      </Group>
    </Card>
  );
}

function SectionHeader({ title, subtitle, to, cta }) {
  return (
    <Group justify="space-between" align="flex-end" mt="sm">
      <Box>
        <Title order={2}>{title}</Title>
        <Text c="dimmed">{subtitle}</Text>
      </Box>
      <Button component={Link} to={to} variant="subtle" color="gold" rightSection={<ArrowRight size={16} />}>
        {cta}
      </Button>
    </Group>
  );
}
