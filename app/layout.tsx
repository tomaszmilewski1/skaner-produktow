import "./globals.css";

export const metadata = {
  title: "Skaner Produktów",
  description: "Aplikacja do skanowania i oceniania",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
