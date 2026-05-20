import { createSupabaseBrowserAuthClient } from "@/lib/supabase-ssr";

let supabaseClient = null;

function getSupabaseClient() {
	if (supabaseClient) return supabaseClient;

	try {
		supabaseClient = createSupabaseBrowserAuthClient();
		return supabaseClient;
	} catch (error) {
		// During build/prerender there is no browser session. Delay failure until runtime use.
		if (typeof window === "undefined") {
			return null;
		}
		throw error;
	}
}

export const supabase = new Proxy(
	{},
	{
		get(_target, prop) {
			const client = getSupabaseClient();
			if (!client) {
				throw new Error(
					"Supabase client is unavailable. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
				);
			}

			const value = client[prop];
			return typeof value === "function" ? value.bind(client) : value;
		},
	},
);
