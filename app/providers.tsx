"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@web/lib/auth";
import { useState } from "react";

/**
 * Wraps application UI with React Query and authentication providers.
 *
 * @param children - The React node(s) to be wrapped by the providers.
 * @returns A JSX tree where a QueryClientProvider (using a QueryClient configured with 30_000ms staleTime and retry = 1) contains an AuthProvider that renders `children`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: { staleTime: 30_000, retry: 1 },
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>{children}</AuthProvider>
		</QueryClientProvider>
	);
}
