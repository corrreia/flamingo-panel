import "@web/index.css";
import { Providers } from "./providers";

export const metadata = {
	title: "Flamingo Panel",
	description: "Game server management on Cloudflare's edge.",
	icons: [{ rel: "icon", type: "image/svg+xml", url: "/favicon.svg" }],
};

/**
 * Wraps pages with global providers and renders the application's root HTML layout.
 *
 * @param children - The page content to render inside the Providers component.
 * @returns The root `<html>` element containing a `<body>` with Providers-wrapped children.
 */
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
