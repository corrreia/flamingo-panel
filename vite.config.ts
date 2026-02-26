import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
	server: {
		allowedHosts: [".trycloudflare.com"],
	},
	plugins: [
		vinext(),
		cloudflare({
			viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
		}),
		tailwindcss(),
	],
	resolve: {
		alias: {
			"@web": path.resolve(import.meta.dirname, "src/web"),
			"@": path.resolve(import.meta.dirname, "src"),
			"@api": path.resolve(import.meta.dirname, "src/api"),
		},
	},
});
