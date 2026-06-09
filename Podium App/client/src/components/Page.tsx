import { Badge, Box, Container, Group, Loader, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ReactNode } from 'react';

export function Page({ children, size = 'lg' }: { children: ReactNode; size?: string | number }) {
  return (
    <Container size={size} className="app-page">
      {children}
    </Container>
  );
}

export function PageHeader({ title, subtitle, action, icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-start" mb="xl" gap="lg">
      <Group align="flex-start" gap="md">
        {icon && (
          <ThemeIcon size={44} radius="md" variant="light" color="gold">
            {icon}
          </ThemeIcon>
        )}
        <Box>
          <Title order={1}>{title}</Title>
          {subtitle && (
            <Text c="dimmed" size="lg" mt={4}>
              {subtitle}
            </Text>
          )}
        </Box>
      </Group>
      {action}
    </Group>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <Paper p="xl" radius="md" withBorder bg="dark.7">
      <Stack align="center" gap="sm" ta="center">
        {icon && (
          <ThemeIcon size={64} radius="xl" variant="light" color="gold">
            {icon}
          </ThemeIcon>
        )}
        <Title order={3}>{title}</Title>
        {text && <Text c="dimmed">{text}</Text>}
        {action && <Box mt="sm">{action}</Box>}
      </Stack>
    </Paper>
  );
}

export function LoadingState({ label = 'Laden...' }: { label?: string }) {
  return (
    <Stack align="center" justify="center" mih={280}>
      <Loader color="gold" />
      <Text c="dimmed">{label}</Text>
    </Stack>
  );
}

export function CountBadge({ children, color = 'gold' }: { children: ReactNode; color?: string }) {
  return (
    <Badge color={color} variant="light">
      {children}
    </Badge>
  );
}
