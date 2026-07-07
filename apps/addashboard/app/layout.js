import "./globals.css";

export const metadata = {
  title: "SIFT AdDashboard",
  description: "Aggregated, opt-in ad-flag statistics from AdSentinel — which platforms, which categories, how often.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
