import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Avatar, Button, Card, Group, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { ArrowLeft, Save, User } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../services/api';
import { EmptyState, LoadingState, Page } from '../components/Page';

export default function EditProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, loading: authLoading, updateUser } = useAuth();
  const [form, setForm] = useState({ name: '', city: '', bio: '', avatar: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isOwnProfile = currentUser && parseInt(id) === currentUser.id;

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !isOwnProfile) {
      setLoading(false);
      return;
    }
    loadProfile();
  }, [authLoading, currentUser, id]);

  async function loadProfile() {
    try {
      const data = await usersApi.getProfile(id);
      setForm({
        name: data.user.name || '',
        city: data.user.city || '',
        bio: data.user.bio || '',
        avatar: data.user.avatar || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const data = await usersApi.updateProfile(id, form);
      updateUser(data.user);
      notifications.show({ color: 'green', message: 'Profiel bijgewerkt' });
      navigate(`/profiel/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) return <Page><LoadingState /></Page>;

  if (!currentUser) {
    return (
      <Page>
        <EmptyState
          icon={<User size={32} />}
          title="Log in om je profiel te bewerken"
          action={<Button component={Link} to="/login" color="gold">Inloggen</Button>}
        />
      </Page>
    );
  }

  if (!isOwnProfile) {
    return (
      <Page>
        <EmptyState
          icon={<User size={32} />}
          title="Je kunt alleen je eigen profiel bewerken"
          action={<Button component={Link} to={`/profiel/${currentUser.id}`} color="gold">Mijn profiel</Button>}
        />
      </Page>
    );
  }

  return (
    <Page size="md">
      <Stack gap="lg">
        <Button component={Link} to={`/profiel/${id}`} variant="subtle" color="gray" leftSection={<ArrowLeft size={16} />} w="fit-content">
          Terug naar profiel
        </Button>

        <Group>
          <Avatar size={80} color="wine">{form.name?.charAt(0).toUpperCase()}</Avatar>
          <div>
            <Title order={1}>Profiel bewerken</Title>
            <Text c="dimmed">Werk je gegevens bij voor andere theaterliefhebbers.</Text>
          </div>
        </Group>

        <Card p="xl">
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <Stack>
              <TextInput label="Naam" name="name" value={form.name} onChange={handleChange} required />
              <TextInput label="Stad" name="city" value={form.city} onChange={handleChange} placeholder="Amsterdam" />
              <TextInput label="Avatar URL" name="avatar" type="url" value={form.avatar} onChange={handleChange} placeholder="https://..." />
              <Textarea
                label="Bio"
                name="bio"
                value={form.bio}
                onChange={handleChange}
                maxLength={280}
                minRows={4}
                autosize
                description={`${form.bio.length}/280`}
                placeholder="Vertel iets over je smaak, favoriete podia of volgende theateravond."
              />
              <Group justify="flex-end">
                <Button component={Link} to={`/profiel/${id}`} variant="outline" color="gray">Annuleren</Button>
                <Button type="submit" color="gold" loading={saving} leftSection={<Save size={18} />}>Opslaan</Button>
              </Group>
            </Stack>
          </form>
        </Card>
      </Stack>
    </Page>
  );
}
