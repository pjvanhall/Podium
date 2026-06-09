import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Anchor, Button, Card, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { ArrowRight, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Page } from '../components/Page';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page size={440}>
      <Card p="xl" shadow="xl">
        <Stack align="stretch" gap="lg">
          <Stack align="center" gap={4} ta="center">
            <Text fz="42px" lh={1}>🎭</Text>
            <Title order={1}>Welkom terug</Title>
            <Text c="dimmed">Log in om verder te gaan met Podium</Text>
          </Stack>

          {error && <Alert color="red">{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <Stack>
              <TextInput
                label="E-mailadres"
                placeholder="jouw@email.nl"
                leftSection={<Mail size={16} />}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <PasswordInput
                label="Wachtwoord"
                placeholder="Je wachtwoord"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <Button type="submit" color="gold" loading={loading} rightSection={<ArrowRight size={18} />}>
                Inloggen
              </Button>
            </Stack>
          </form>

          <Text ta="center" c="dimmed">
            Nog geen account?{' '}
            <Anchor component={Link} to="/registreren" c="gold.3">
              Registreer gratis
            </Anchor>
          </Text>

          <Card withBorder p="sm" bg="dark.7">
            <Text size="sm" c="dimmed">Demo account</Text>
            <Text ff="monospace" size="sm">lisa@example.com / welkom123</Text>
          </Card>
        </Stack>
      </Card>
    </Page>
  );
}
