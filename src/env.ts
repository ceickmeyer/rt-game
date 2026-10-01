import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {},
	PUBLIC_SUPABASE_ANON_KEY: {},
	SUPABASE_SERVICE_ROLE_KEY: {}
});
