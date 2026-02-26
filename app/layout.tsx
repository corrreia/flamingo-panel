import "@web/index.css";
import { Providers } from "./providers";

export const metadata = {
	title: "Flamingo Panel",
	description: "Game server management on Cloudflare's edge.",
	icons: [{ rel: "icon", type: "image/svg+xml", url: "/favicon.svg" }],
};

export default function RootLayout({
	children,
}: { children: React.ReactNode }) {
	return (
		<html className="dark" lang="en">
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
