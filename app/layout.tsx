import "./globals.css";

export const metadata = {
  title: "Skaner Produktów",
  description: "Aplikacja do skanowania i oceniania",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
