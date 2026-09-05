/**
 * Manage the /admin accounts held in D1.
 *
 *   node scripts/admin-user.mjs create <username>
 *   node scripts/admin-user.mjs reset  <username>
 *   node scripts/admin-user.mjs disable <username>
 *   node scripts/admin-user.mjs enable  <username>
 *   node scripts/admin-user.mjs list
 *   node scripts/admin-user.mjs sessions            # live sessions, all users
 *   node scripts/admin-user.mjs logout <username>   # end their sessions now
 *
 * `create` and `reset` generate the password here and print it once. It is
 * never written to a file, never stored in the repository, and cannot be
 * recovered afterwards -- only replaced by another `reset`. The account is
 * flagged must_change_password, so whoever receives it has to choose their own
 * before /admin will answer.
 *
 * The derivation here must match src/lib/auth.ts exactly, or a password set
 * from this script will never verify in the Worker. Both sides chain ROUNDS
 * PBKDF2 passes of ITERATIONS each -- see the long note in auth.ts for why the
 * cost is expressed that way (Workers refuses a single PBKDF2 call above
 * 100,000 iterations). If you change either number there, change it here.
 *
 * Needs CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) in the environment.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2 = promisify(crypto.pbkdf2);

const ITERATIONS = 100_000;
const ROUNDS = 6;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '47a82355b575e264047206a36c2cd05c';
const DB = process.env.BLOG_DB_ID || 'ed3116e7-7699-4d4d-8785-2ea67f81aed1';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

if (!TOKEN) {
  console.error('No CLOUDFLARE_API_TOKEN / CF_API_TOKEN in the environment.');
  process.exit(1);
}

async function d1(sql, params = []) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.success) {
    throw new Error(`D1 ${r.status}: ${JSON.stringify(body?.errors ?? body).slice(0, 400)}`);
  }
  return body.result[0];
}

/** The chained derivation from src/lib/auth.ts, byte for byte. */
async function derive(password, salt, iterations, rounds) {
  let material = Buffer.from(password, 'utf8');
  for (let round = 0; round < rounds; round++) {
    const roundSalt = Buffer.concat([salt, Buffer.from([round])]);
    material = await pbkdf2(material, roundSalt, iterations, KEY_BYTES, 'sha256');
  }
  return material;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const dk = await derive(password, salt, ITERATIONS, ROUNDS);
  return [
    'pbkdf2',
    'sha256',
    ITERATIONS,
    ROUNDS,
    salt.toString('base64'),
    dk.toString('base64'),
  ].join('$');
}

/**
 * A password worth typing once.
 *
 * The alphabet drops the characters that get misread when a password is read
 * aloud or copied off a screen -- 0/O, 1/l/I -- and the groups exist for the
 * same reason. 20 characters from a 30-character alphabet is a little under
 * 98 bits, which is far past anything reachable through a login form that
 * locks out after 8 tries.
 */
function generatePassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(64);
  let out = '';
  for (let i = 0; i < 20; i++) {
    if (i && i % 5 === 0) out += '-';
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function requireUsername(name) {
  if (!name) {
    console.error('Give a username.');
    process.exit(1);
  }
  if (!/^[A-Za-z0-9._-]{2,100}$/.test(name)) {
    console.error('Usernames may hold letters, digits, dot, underscore and hyphen (2-100).');
    process.exit(1);
  }
  return name;
}

function announce(username, password, verb) {
  console.log('');
  console.log(`  ${verb} ${username}`);
  console.log('');
  console.log(`    username  ${username}`);
  console.log(`    password  ${password}`);
  console.log('');
  console.log('  This is the only time that password is shown. It is not stored');
  console.log('  anywhere in readable form -- if it is lost, run `reset`.');
  console.log('');
  console.log('  Sign in at https://staging.vinylwraptoronto.com/admin/ ; the account');
  console.log('  must choose a new password before anything else will answer.');
  console.log('');
}

const [, , command, arg] = process.argv;

try {
  switch (command) {
    case 'create': {
      const username = requireUsername(arg);
      const existing = await d1('SELECT id FROM admin_users WHERE username = ?', [username]);
      if (existing.results.length) {
        console.error(`${username} already exists. Use \`reset\` to give it a new password.`);
        process.exit(1);
      }
      const password = generatePassword();
      await d1(
        `INSERT INTO admin_users (username, password_hash, must_change_password)
         VALUES (?, ?, 1)`,
        [username, await hashPassword(password)],
      );
      announce(username, password, 'Created');
      break;
    }

    case 'reset': {
      const username = requireUsername(arg);
      const password = generatePassword();
      const res = await d1(
        `UPDATE admin_users
            SET password_hash = ?, must_change_password = 1, password_changed_at = datetime('now')
          WHERE username = ?`,
        [await hashPassword(password), username],
      );
      if (!res.meta.changes) {
        console.error(`No such user: ${username}`);
        process.exit(1);
      }
      // A reset exists because the password may be in the wrong hands. Leaving
      // their sessions alive would make it pointless.
      await d1(
        `DELETE FROM admin_sessions WHERE user_id = (SELECT id FROM admin_users WHERE username = ?)`,
        [username],
      );
      announce(username, password, 'Reset');
      break;
    }

    case 'disable':
    case 'enable': {
      const username = requireUsername(arg);
      const disabled = command === 'disable' ? 1 : 0;
      const res = await d1('UPDATE admin_users SET disabled = ? WHERE username = ?', [
        disabled,
        username,
      ]);
      if (!res.meta.changes) {
        console.error(`No such user: ${username}`);
        process.exit(1);
      }
      if (disabled) {
        await d1(
          `DELETE FROM admin_sessions
            WHERE user_id = (SELECT id FROM admin_users WHERE username = ?)`,
          [username],
        );
      }
      console.log(`${username} ${disabled ? 'disabled and signed out' : 'enabled'}.`);
      break;
    }

    case 'logout': {
      const username = requireUsername(arg);
      const res = await d1(
        `DELETE FROM admin_sessions
          WHERE user_id = (SELECT id FROM admin_users WHERE username = ?)`,
        [username],
      );
      console.log(`Ended ${res.meta.changes} session(s) for ${username}.`);
      break;
    }

    case 'list': {
      const { results } = await d1(
        `SELECT username, disabled, must_change_password, created_at, last_login_at
           FROM admin_users ORDER BY username`,
      );
      if (!results.length) {
        console.log('No admin users yet. Run: node scripts/admin-user.mjs create <username>');
        break;
      }
      console.log('');
      console.log('  username              state            last sign-in');
      for (const u of results) {
        const state = u.disabled
          ? 'disabled'
          : u.must_change_password
            ? 'must change pw'
            : 'active';
        console.log(
          `  ${String(u.username).padEnd(21)} ${state.padEnd(16)} ${u.last_login_at ?? 'never'}`,
        );
      }
      console.log('');
      break;
    }

    case 'sessions': {
      const { results } = await d1(
        `SELECT u.username, s.created_at, s.last_seen_at, s.expires_at, s.ip
           FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
          WHERE s.expires_at > datetime('now')
          ORDER BY s.last_seen_at DESC`,
      );
      if (!results.length) {
        console.log('No live sessions.');
        break;
      }
      console.log('');
      for (const s of results) {
        console.log(
          `  ${String(s.username).padEnd(16)} from ${String(s.ip ?? '?').padEnd(16)}` +
            ` last seen ${s.last_seen_at}  expires ${s.expires_at}`,
        );
      }
      console.log('');
      break;
    }

    default:
      console.log(
        [
          'Usage:',
          '  node scripts/admin-user.mjs create <username>',
          '  node scripts/admin-user.mjs reset <username>',
          '  node scripts/admin-user.mjs disable <username>',
          '  node scripts/admin-user.mjs enable <username>',
          '  node scripts/admin-user.mjs logout <username>',
          '  node scripts/admin-user.mjs list',
          '  node scripts/admin-user.mjs sessions',
        ].join('\n'),
      );
      process.exit(command ? 1 : 0);
  }
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
