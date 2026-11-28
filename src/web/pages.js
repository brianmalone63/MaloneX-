// HTML pages for the web server: mobile-first down to 320 px, light and
// dark, no gradients, big monospace code tiles that fill the card. All
// dynamic text is escaped before it reaches a page.
import { escapeHtml } from '../commands/format.js';

const STYLES = `
  :root {
    --bg: #f6f7f9; --card: #ffffff; --ink: #1c1e21; --muted: #5f6572;
    --line: #d9dde3; --tile: #101216; --tile-ink: #f2f4f8;
    --accent: #2563eb; --ok: #147a4d; --bad: #b42318;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0c0d10; --card: #14161b; --ink: #e8eaee; --muted: #9aa1ad;
      --line: #2a2e36; --tile: #1c1f26; --tile-ink: #f2f4f8;
      --accent: #6c8cff; --ok: #4cc38a; --bad: #ef6a5a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: clamp(12px, 4vw, 32px);
    background: var(--bg); color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 520px; margin: 0 auto; }
  header { margin-bottom: 18px; }
  h1 { margin: 0; font-size: 1.6rem; letter-spacing: 0.02em; }
  h2 { margin: 0 0 10px; font-size: 1.05rem; }
  .sub { margin: 4px 0 0; color: var(--muted); font-size: 0.85rem; }
  .card {
    background: var(--card); border: 1px solid var(--line);
    border-radius: 14px; padding: 16px; margin-bottom: 14px;
  }
  .pill {
    display: inline-block; padding: 4px 12px; border-radius: 999px;
    border: 1px solid var(--line); color: var(--muted);
    font-size: 0.8rem; text-transform: capitalize; margin-bottom: 4px;
  }
  .pill[data-state="online"] { color: var(--ok); border-color: var(--ok); }
  .pill[data-state="pairing"], .pill[data-state="connecting"], .pill[data-state="reconnecting"], .pill[data-state="idle"] { color: var(--accent); border-color: var(--accent); }
  .pill[data-state="logged_out"], .pill[data-state="failed"], .pill[data-state="conflict"], .pill[data-state="stopped"] { color: var(--bad); border-color: var(--bad); }
  ol.steps { margin: 10px 0; padding-left: 20px; color: var(--ink); font-size: 0.92rem; line-height: 1.6; }
  ol.steps code, p code {
    background: var(--tile); color: var(--tile-ink);
    padding: 1px 6px; border-radius: 6px; font-size: 0.85em;
  }
  .btn {
    display: inline-block; margin-top: 8px; padding: 12px 20px;
    background: var(--accent); color: #ffffff; border: none;
    border-radius: 12px; font-size: 0.98rem; font-weight: 600;
    text-decoration: none; text-align: center; cursor: pointer; width: 100%;
  }
  .btn:disabled { opacity: 0.55; cursor: default; }
  label { display: block; font-size: 0.85rem; color: var(--muted); margin: 10px 0 6px; }
  input {
    width: 100%; padding: 12px 14px; font-size: 1rem;
    background: var(--bg); color: var(--ink);
    border: 1px solid var(--line); border-radius: 10px; outline: none;
  }
  input:focus { border-color: var(--accent); }
  .code {
    margin-top: 14px; width: 100%;
    background: var(--tile); color: var(--tile-ink);
    border-radius: 12px; border: 1px solid var(--line);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: clamp(2rem, 9vw, 2.9rem); font-weight: 700;
    letter-spacing: 0.12em; text-align: center;
    padding: 22px 10px; word-break: break-all;
  }
  .msg { font-size: 0.88rem; line-height: 1.5; margin: 10px 0 0; color: var(--muted); }
  .msg.bad { color: var(--bad); }
  .msg.ok { color: var(--ok); }
  .kv { margin: 6px 0; font-size: 0.92rem; color: var(--ink); }
  .kv b { color: var(--muted); font-weight: 600; }
  .note { font-size: 0.85rem; color: var(--muted); line-height: 1.55; }
  footer { margin-top: 22px; text-align: center; color: var(--muted); font-size: 0.75rem; }
`;

const SCRIPT = `
(function () {
  var phoneEl = document.getElementById('phone');
  var keyEl = document.getElementById('key');
  var btn = document.getElementById('pairBtn');
  var tile = document.getElementById('codeTile');
  var msg = document.getElementById('pairMsg');
  if (!btn || !phoneEl || !tile || !msg) return;
  var pollTimer = null;

  function headers(extra) {
    var out = { 'Content-Type': 'application/json' };
    if (keyEl && keyEl.value.trim()) out['x-access-key'] = keyEl.value.trim();
    return Object.assign(out, extra || {});
  }

  function say(text, cls) {
    msg.textContent = text;
    msg.className = 'msg' + (cls ? ' ' + cls : '');
  }

  function showCode(raw) {
    var clean = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    tile.textContent = clean.length === 8 ? clean.slice(0, 4) + '-' + clean.slice(4) : clean;
    tile.hidden = false;
  }

  async function pollStatus() {
    try {
      var res = await fetch('/api/pair/status', { headers: headers() });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) { say(data.error || 'Status check failed.', 'bad'); return; }
      if (data.paired) {
        if (pollTimer) clearInterval(pollTimer);
        say('WhatsApp is linked. This page will refresh.', 'ok');
        setTimeout(function () { window.location.reload(); }, 1500);
      } else if (data.status === 'online') {
        if (pollTimer) clearInterval(pollTimer);
        window.location.reload();
      }
    } catch (err) {
      say('Status check failed: ' + err.message + ' Retrying.', 'bad');
    }
  }

  btn.addEventListener('click', async function () {
    btn.disabled = true;
    say('Requesting a pairing code from WhatsApp...');
    try {
      var res = await fetch('/api/pair', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ phone: phoneEl.value.trim() })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        say(data.error || 'The pairing request failed.', 'bad');
        btn.disabled = false;
        return;
      }
      showCode(data.code);
      say('Type this code into WhatsApp: Settings > Linked devices > Link a device > "Pair with phone number instead". The code works once and expires in a few minutes.');
      pollTimer = setInterval(pollStatus, 2500);
    } catch (err) {
      say('The pairing request failed: ' + err.message, 'bad');
      btn.disabled = false;
    }
  });
})();
`;

function pageShell(title, body, script = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
${body}
<footer>MaloneX</footer>
</main>
${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

function statePill(status) {
  return `<span class="pill" data-state="${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

// The start page. When the bot has no session it explains exactly how to get
// one (button to the pairing site) and offers the built-in pairing form when
// ACCESS_KEY is set. When paired it shows the linked state.
export function renderHomePage({ brand, status, phone, pairingSiteUrl, pairingEnabled, hasSession }) {
  const paired = phone !== null;
  const statusSection = paired
    ? `
    <section class="card">
      ${statePill(status)}
      <h2>Connected</h2>
      <p class="kv"><b>Linked number:</b> ${escapeHtml(phone)}</p>
      <p class="kv"><b>Session source:</b> ${hasSession ? 'SESSION variable (stored copy in use)' : 'stored session'}</p>
      <p class="note">This deployment is linked. The bot keeps running and reconnects on its own after short interruptions.</p>
    </section>`
    : `
    <section class="card">
      ${statePill(status)}
      <h2>Get your session</h2>
      <ol class="steps">
        <li>Open your pairing site with the button below and pair your number.</li>
        <li>Copy the session string it gives you.</li>
        <li>Paste it into the <code>SESSION</code> variable of this deployment and restart.</li>
      </ol>
      <a class="btn" href="${escapeHtml(pairingSiteUrl)}" rel="noopener">Open the pairing site</a>
      <p class="note">A session string is a password for the whole WhatsApp account. Never share it and never commit it.</p>
    </section>
    ${
      pairingEnabled
        ? `
    <section class="card" id="pairCard">
      <h2>Pair here instead</h2>
      <p class="note">Fallback: request a pairing code straight from this server.</p>
      <label for="key">Access key</label>
      <input id="key" type="password" autocomplete="off" placeholder="ACCESS_KEY">
      <label for="phone">Phone number</label>
      <input id="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+254 712 345 678">
      <button class="btn" id="pairBtn">Get pair code</button>
      <div class="code" id="codeTile" hidden>····-····</div>
      <p class="msg" id="pairMsg"></p>
    </section>`
        : `
    <section class="card">
      <h2>Pairing fallbacks</h2>
      <p class="note">The built-in pairing page is disabled until the <code>ACCESS_KEY</code> variable is set. With it set, this page can request a pairing code directly. You can also set <code>PAIR_NUMBER</code> and the code appears once in the server console.</p>
    </section>`
    }`;

  return pageShell(brand, `
  <header>
    <h1>${escapeHtml(brand)}</h1>
    <p class="sub">WhatsApp bot &middot; ${hasSession ? 'session configured' : 'no session yet'}</p>
  </header>
  ${statusSection}`, pairingEnabled && !paired ? SCRIPT : '');
}
