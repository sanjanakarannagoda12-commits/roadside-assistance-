// theme/colors.ts
// Central color palette — matches the new dark/orange reference design.
// Import this anywhere instead of hardcoding hex values, so re-theming later is a one-file change.

export const colors = {
  background: '#FFFFFF',
  dark: '#1C1C1E',        // hero cards, bottom nav, dark surfaces
  darkElevated: '#2A2A2D', // slightly lighter dark, for cards on dark bg if needed

  primary: '#F97316',     // main orange accent - buttons, active states, icon circles
  primaryLight: '#FDEAE0',// pale peach chip background behind icons

  textPrimary: '#111111', // headings
  textSecondary: '#6B7280', // body / muted text
  textOnDark: '#FFFFFF',

  border: '#E5E7EB',
  success: '#22C55E',
  star: '#FACC15',
};

export default colors;
