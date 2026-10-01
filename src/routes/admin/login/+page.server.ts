import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (await locals.getUser()) redirect(303, '/admin');
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const { error } = await locals.supabase.auth.signInWithPassword({
			email: String(form.get('email') ?? '').trim(),
			password: String(form.get('password') ?? '')
		});
		if (error) return fail(400, { error: 'Invalid email or password' });
		redirect(303, '/admin');
	}
};
