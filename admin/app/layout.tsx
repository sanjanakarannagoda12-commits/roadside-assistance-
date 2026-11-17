import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ridzo Admin',
  description: 'Review mechanics and manage Ridzo pricing',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
