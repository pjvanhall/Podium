import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'wine',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  headings: {
    fontFamily: 'Playfair Display, Georgia, serif',
    fontWeight: '600',
  },
  colors: {
    wine: [
      '#fbf0f2',
      '#eedce0',
      '#d7b3bc',
      '#bf8896',
      '#aa6376',
      '#9d4d63',
      '#963f58',
      '#843248',
      '#762a3f',
      '#682235',
    ],
    gold: [
      '#fff8e8',
      '#f5ecd1',
      '#e8d49f',
      '#dbba69',
      '#d1a43d',
      '#c99527',
      '#c58e1b',
      '#af7b11',
      '#9c6d0a',
      '#875d00',
    ],
  },
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        radius: 'md',
        withBorder: true,
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    PasswordInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Textarea: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});
