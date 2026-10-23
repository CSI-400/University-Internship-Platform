import './globals.css';

export const metadata = {
  title: 'University Internship Platform',
  description: 'Development starter for the internship platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
