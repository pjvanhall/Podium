import { Box, Image, ThemeIcon } from '@mantine/core';
import { Theater } from 'lucide-react';
import { getSafeImageUrl } from '../utils/images';

type TheatreLogoProps = {
  src?: string;
  name: string;
  size?: number;
};

export function TheatreLogo({ src, name, size = 56 }: TheatreLogoProps) {
  const safeSrc = getSafeImageUrl(src);

  if (safeSrc) {
    const usesInvertedLogo = /(?:white|wit|diapositief|inverse|inverted)/i.test(safeSrc);

    return (
      <Box
        bg={usesInvertedLogo ? 'dark.8' : 'white'}
        p={6}
        w={size}
        h={size}
        miw={size}
        style={{
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        <Image src={safeSrc} alt={`${name} logo`} fit="contain" mah={size - 12} maw={size - 12} />
      </Box>
    );
  }

  return (
    <ThemeIcon size={size} radius="md" color="wine" variant="light">
      <Theater size={Math.round(size * 0.52)} />
    </ThemeIcon>
  );
}
