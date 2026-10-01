import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {},
	SUPABASE_SERVICE_ROLE_KEY: {},
	ADMIN_PASSWORD: {
		description: 'Password for /admin. If unset, /admin is disabled.',
		schema: (value) => value || undefined
	}
});
