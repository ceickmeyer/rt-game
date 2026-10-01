import { createHash, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { ADMIN_PASSWORD } from '$app/env/private';

const COOKIE = 'rt_admin';

// The cookie holds a hash of the password, never the password itself
const token = (password: string) =>
	createHash('sha256').update(`rt-admin:${password}`).digest('hex');

function valid(cookieToken: string | undefined) {
	if (!ADMIN_PASSWORD || !cookieToken) return false;
	const expected = Buffer.from(token(ADMIN_PASSWORD));
	const given = Buffer.from(cookieToken);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

export const isAdmin = (cookies: Cookies) => valid(cookies.get(COOKIE));

export function logIn(cookies: Cookies, password: string) {
	if (!valid(token(password))) return false;
	cookies.set(COOKIE, token(password), {
		path: '/admin',
		httpOnly: true,
		sameSite: 'strict',
		maxAge: 60 * 60 * 24 * 30
	});
	return true;
}

export const logOut = (cookies: Cookies) => cookies.delete(COOKIE, { path: '/admin' });
