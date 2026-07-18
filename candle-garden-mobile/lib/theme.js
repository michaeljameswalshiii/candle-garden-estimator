/**
 * Brand theme extracted from https://www.thecandlegarden.co/
 * (Squarespace palette: accent, lightAccent, darkAccent + site fonts)
 */
import { Platform, StyleSheet } from 'react-native';

// HSL → hex from site.css theme tokens
export const colors = {
  // --accent / --safeDarkAccent: hsl(169.5, 55.56%, 14.12%)
  primary: '#103831',
  // Lighter teal for secondary accents / selected states
  primaryMid: '#27685C',
  primarySoft: '#E6F0EE',
  // --lightAccent: hsl(273.33, 25.71%, 93.14%) — soft lavender wash
  lightAccent: '#EEE9F2',
  // Soft page surface derived from light accent
  surface: '#F5F3F7',
  // --darkAccent: hsl(69.6, 25.77%, 19.02%) — olive moss
  darkAccent: '#393D24',
  // Neutrals from site
  white: '#FFFFFF',
  black: '#0E0E0E',
  text: '#272727',
  textSecondary: '#3E3E3E',
  textMuted: '#6E6E6E',
  textFaint: '#999999',
  border: '#E7E7E7',
  borderStrong: '#D0D0D0',
  // Status
  warning: '#C47B1A',
  danger: '#B3261E',
  info: '#1976D2',
  disabled: '#C4C4C4',
  // Tab bar
  tabInactive: '#797979',
};

export const fonts = {
  // Site uses IvyPresto Display (headings) + Degular Text (body).
  // Licensed webfonts; map to elegant system fallbacks on device.
  heading: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Georgia',
  }),
  body: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'System',
  }),
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 6, // matches site primary-button 6px
  md: 10,
  lg: 14,
  pill: 999,
};

export const assets = {
  // Flying pig logo from thecandlegarden.co
  logo:
    'https://images.squarespace-cdn.com/content/v1/65fae805de7d9316f58ac65f/f152dc96-196e-44c6-9eab-c51856309c22/Black+Piggie+Simple.png',
  hero:
    'https://images.squarespace-cdn.com/content/v1/65fae805de7d9316f58ac65f/1710965056757-BVTFNTO7HAIQTF2135HC/storefront.jpg',
};

export const brand = {
  name: 'The Candle Garden',
  tagline: 'From my hands, to your home',
  location: 'Atlantic Beach, Florida',
  siteUrl: 'https://www.thecandlegarden.co/',
};

/** React Navigation theme aligned to the website */
export const navigationTheme = {
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.white,
    card: colors.white,
    text: colors.text,
    border: colors.border,
    notification: colors.primaryMid,
  },
  fonts: {
    regular: {
      fontFamily: fonts.body,
      fontWeight: '400',
    },
    medium: {
      fontFamily: fonts.body,
      fontWeight: '500',
    },
    bold: {
      fontFamily: fonts.body,
      fontWeight: '700',
    },
    heavy: {
      fontFamily: fonts.body,
      fontWeight: '800',
    },
  },
};

export const common = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  screenPad: {
    flex: 1,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  screenCenter: {
    flexGrow: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md + 4,
  },
  pageTitle: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: '400',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  pageSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  section: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '400',
    color: colors.darkAccent,
    marginBottom: spacing.sm + 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md - 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bodyText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  mutedText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  price: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    minWidth: 200,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 1.5,
    textTransform: 'capitalize',
  },
  secondaryButton: {
    backgroundColor: colors.darkAccent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    minWidth: 200,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 1.2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.text,
    fontFamily: fonts.body,
  },
});

export default {
  colors,
  fonts,
  spacing,
  radii,
  assets,
  brand,
  navigationTheme,
  common,
};
