import "./globals.css";

export const metadata = {
  title: "Skaner Produktów",
  description: "Aplikacja do skanowania, oceniania i analizy składu",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <head>
        <meta name="theme-color" content="#2563eb" />
      </head>
      <body>{children}</body>
    </html>
  );
}
