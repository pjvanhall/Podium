import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Avatar,
  Box,
  Burger,
  Button,
  Container,
  Drawer,
  Group,
  Indicator,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Bell, Calendar, Home, LogOut, Theater, User, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { connectionsApi } from '../../services/api';
import type { ComponentType } from 'react';

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  exact?: boolean;
  showCount?: boolean;
};

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, exact: true },
  { to: '/theaters', label: 'Theaters', icon: Theater },
  { to: '/agenda', label: 'Agenda', icon: Calendar },
];

const userNavItems: NavItem[] = [
  { to: '/vrienden', label: 'Vrienden', icon: Users },
  { to: '/vriendschapsverzoeken', label: 'Verzoeken', icon: Bell, showCount: true },
];

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [opened, { open, close }] = useDisclosure(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  useEffect(() => {
    loadPendingRequestCount();
  }, [user, location.pathname]);

  useEffect(() => {
    function handleRequestsUpdated() {
      loadPendingRequestCount();
    }

    window.addEventListener('podium:friend-requests-updated', handleRequestsUpdated);
    return () => window.removeEventListener('podium:friend-requests-updated', handleRequestsUpdated);
  }, [user]);

  async function loadPendingRequestCount() {
    if (!user) {
      setPendingRequestCount(0);
      return;
    }

    try {
      const data = await connectionsApi.getRequests();
      setPendingRequestCount(data.incoming?.length || 0);
    } catch (err) {
      setPendingRequestCount(0);
    }
  }

  function isActive(item: NavItem) {
    if (item.exact) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  }

  function handleLogout() {
    logout();
    close();
    navigate('/');
  }

  function renderNavButton(item: NavItem, fullWidth = false) {
    const Icon = item.icon;
    const countLabel = pendingRequestCount > 99 ? '99+' : pendingRequestCount;
    const button = (
      <Button
        key={item.to}
        component={Link}
        to={item.to}
        variant={isActive(item) ? 'light' : 'subtle'}
        color={isActive(item) ? 'gold' : 'gray'}
        leftSection={<Icon size={18} />}
        fullWidth={fullWidth}
        justify={fullWidth ? 'flex-start' : 'center'}
        onClick={close}
      >
        {item.label}
      </Button>
    );

    if (!item.showCount || pendingRequestCount === 0) return button;

    return (
      <Indicator key={item.to} label={countLabel} color="red" size={18} offset={4}>
        {button}
      </Indicator>
    );
  }

  const allNavItems = user ? [...navItems, ...userNavItems] : navItems;

  return (
    <>
      <Box
        component="header"
        pos="fixed"
        top={0}
        left={0}
        right={0}
        h={72}
        style={{
          zIndex: 100,
          backdropFilter: 'blur(18px)',
          background: 'rgba(26, 22, 23, 0.86)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between" gap="lg">
            <Link to="/" onClick={close}>
              <Group gap="sm" c="white">
                <Text fz="28px" lh={1}>🎭</Text>
                <Text ff="Playfair Display, Georgia, serif" fw={700} fz="xl" c="gold.3">
                  Podium
                </Text>
              </Group>
            </Link>

            <Group gap={4} visibleFrom="md">
              {allNavItems.map(item => renderNavButton(item))}
            </Group>

            <Group gap="sm">
              {user ? (
                <Group gap="xs" visibleFrom="sm">
                  <Indicator
                    disabled={pendingRequestCount === 0}
                    label={pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                    color="red"
                    size={18}
                  >
                    <ActionIcon
                      component={Link}
                      to="/vriendschapsverzoeken"
                      variant="subtle"
                      color="gray"
                      size="lg"
                      title={`${pendingRequestCount} ontvangen vriendschapsverzoeken`}
                    >
                      <Bell size={20} />
                    </ActionIcon>
                  </Indicator>
                  <Button
                    component={Link}
                    to={`/profiel/${user.id}`}
                    variant="subtle"
                    color="gray"
                    leftSection={<Avatar size={26} color="wine">{user.name?.charAt(0).toUpperCase()}</Avatar>}
                  >
                    {user.name?.split(' ')[0]}
                  </Button>
                  <ActionIcon variant="subtle" color="gray" size="lg" onClick={handleLogout} title="Uitloggen">
                    <LogOut size={20} />
                  </ActionIcon>
                </Group>
              ) : (
                <Group gap="xs" visibleFrom="sm">
                  <Button component={Link} to="/login" variant="subtle" color="gray">
                    Inloggen
                  </Button>
                  <Button component={Link} to="/registreren" color="gold">
                    Registreren
                  </Button>
                </Group>
              )}

              <Burger opened={opened} onClick={open} hiddenFrom="md" color="white" />
            </Group>
          </Group>
        </Container>
      </Box>

      <Drawer opened={opened} onClose={close} title="Podium" position="right" size="sm">
        <Stack>
          {allNavItems.map(item => renderNavButton(item, true))}

          {user ? (
            <>
              <Button
                component={Link}
                to={`/profiel/${user.id}`}
                variant="subtle"
                color="gray"
                leftSection={<User size={18} />}
                justify="flex-start"
                onClick={close}
              >
                Mijn profiel
              </Button>
              <Button variant="subtle" color="gray" leftSection={<LogOut size={18} />} justify="flex-start" onClick={handleLogout}>
                Uitloggen
              </Button>
            </>
          ) : (
            <>
              <Button component={Link} to="/login" variant="subtle" color="gray" onClick={close}>
                Inloggen
              </Button>
              <Button component={Link} to="/registreren" color="gold" onClick={close}>
                Registreren
              </Button>
            </>
          )}
        </Stack>
      </Drawer>
    </>
  );
}
