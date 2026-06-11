import { Alert, Button, Center, Loader, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { API_URL } from '../services/api';

type AccessState = 'checking' | 'allowed' | 'blocked';

export function AppAccessGate({ children }: { children: ReactNode }) {
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [message, setMessage] = useState('');

  const verifyAccess = useCallback(async () => {
    setAccessState('checking');
    setMessage('');

    try {
      const response = await fetch(`${API_URL}/health`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        setAccessState('allowed');
        return;
      }

      setAccessState('blocked');
      setMessage(
        response.status === 403
          ? 'Deze omgeving is alleen beschikbaar vanaf een toegestaan netwerk.'
          : 'Toegang kan niet worden bevestigd.'
      );
    } catch (_err) {
      setAccessState('blocked');
      setMessage('Toegang kan niet worden bevestigd.');
    }
  }, []);

  useEffect(() => {
    verifyAccess();
  }, [verifyAccess]);

  if (accessState === 'allowed') {
    return <>{children}</>;
  }

  return (
    <Center mih="100vh" px="md">
      <Paper maw={460} w="100%" p="xl" radius="md" withBorder bg="dark.7">
        <Stack align="center" gap="md" ta="center">
          <ThemeIcon size={56} radius="xl" variant="light" color={accessState === 'checking' ? 'gold' : 'red'}>
            {accessState === 'checking' ? <ShieldCheck size={28} /> : <ShieldAlert size={28} />}
          </ThemeIcon>

          <Stack gap={6}>
            <Title order={2}>{accessState === 'checking' ? 'Toegang controleren' : 'Toegang beperkt'}</Title>
            <Text c="dimmed">
              {accessState === 'checking'
                ? 'Een moment geduld.'
                : message || 'Deze omgeving is niet beschikbaar vanaf dit netwerk.'}
            </Text>
          </Stack>

          {accessState === 'checking' ? (
            <Loader color="gold" size="sm" />
          ) : (
            <>
              <Alert color="red" variant="light" w="100%" ta="left">
                Verbind met het toegestane netwerk en probeer opnieuw.
              </Alert>
              <Button leftSection={<RefreshCw size={16} />} onClick={verifyAccess}>
                Opnieuw proberen
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
