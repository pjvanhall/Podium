import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Anchor, Button, Card, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { ArrowRight, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Page } from '../components/Page';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signup(email, password, name);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page size={460}>
      <Card p="xl" shadow="xl">
        <Stack gap="lg">
          <Stack align="center" gap={4} ta="center">
            <Text fz="42px" lh={1}>🎭</Text>
            <Title order={1}>Account aanmaken</Title>
            <Text c="dimmed">Word lid van de Podium-community</Text>
          </Stack>

          {error && <Alert color="red">{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <Stack>
              <TextInput
                label="Volledige naam"
                placeholder="Jan Jansen"
                leftSection={<User size={16} />}
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
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
                description="Minimaal 6 tekens"
                placeholder="Minimaal 6 tekens"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <Button type="submit" color="gold" loading={loading} rightSection={<ArrowRight size={18} />}>
                Registreren
              </Button>
            </Stack>
          </form>

          <Text ta="center" c="dimmed">
            Al een account?{' '}
            <Anchor component={Link} to="/login" c="gold.3">
              Log in
            </Anchor>
          </Text>
        </Stack>
      </Card>
    </Page>
  );
}
