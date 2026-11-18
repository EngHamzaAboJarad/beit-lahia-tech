// One-time admin sign-in. Run in YOUR terminal:  npm run login
// The password is typed hidden, used once, and never saved; only the refresh token is stored.
import readline from 'node:readline';
import { signIn, tokensPath } from './auth.mjs';

function ask(q, hidden) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = s => { if (s.includes(q)) rl.output.write(s); else rl.output.write(''); };
    }
    rl.question(q, a => { rl.close(); if (hidden) console.log(); resolve(a.trim()); });
  });
}

const email = await ask('Admin email: ');
const password = await ask('Password (hidden): ', true);
try {
  const t = await signIn(email, password);
  console.log(`Signed in as ${t.email}. Refresh token saved to ${tokensPath}`);
} catch (e) {
  console.error('Failed:', e.message);
  process.exit(1);
}
