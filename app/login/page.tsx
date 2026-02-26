"use client";

import { Button } from "@web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@web/components/ui/card";
import { useAuth } from "@web/lib/auth";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Render the client-side login page and redirect authenticated users to the root path.
 *
 * The page displays a centered card with a title, description, and a "Sign in with SSO" button
 * that invokes the authentication flow. If a user is already authenticated, the component
 * navigates to "/".
 *
 * @returns The React element for the login page.
 */
export default function LoginPage() {
	const router = useRouter();
	const { user, login } = useAuth();

	// Redirect if already logged in
	useEffect(() => {
		if (user) {
			router.push("/");
		}
	}, [user, router]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="font-bold text-2xl text-primary">
						Flamingo Panel
					</CardTitle>
					<CardDescription>Sign in with your Pocket ID account</CardDescription>
				</CardHeader>
				<CardContent>
					<Button className="w-full" onClick={login} size="lg">
						<LogIn className="mr-2 h-4 w-4" />
						Sign in with SSO
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
