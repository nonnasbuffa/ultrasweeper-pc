// Accounts and cloud saves, through Firebase's web APIs (no SDK, so the game stays small and works offline).
// Players only ever type a username: it becomes a made-up email address behind the scenes.
(() => {
  // Filled in from the Firebase console (Project settings → General → Your apps → Web app).
  // The API key is not a secret: it only identifies the project. The database rules protect each save.
  const config = {
    apiKey: 'AIzaSyDgaPn1guiuh2ZIM7GCZS_8OGaK7m75f1U',
    projectId: 'ultrasweeper-ab203'
  };

  let endpoints = {
    auth: 'https://identitytoolkit.googleapis.com/v1',
    token: 'https://securetoken.googleapis.com/v1',
    database: 'https://firestore.googleapis.com/v1'
  };

  const emailDomain = 'players.ultrasweeper.game';
  const messages = {
    EMAIL_EXISTS: 'That username is taken. Pick another one, or log in.',
    EMAIL_NOT_FOUND: 'Wrong username or password.',
    INVALID_PASSWORD: 'Wrong username or password.',
    INVALID_LOGIN_CREDENTIALS: 'Wrong username or password.',
    USER_DISABLED: 'This account has been turned off.',
    WEAK_PASSWORD: 'Your password needs at least 6 characters.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a minute and try again.'
  };

  class CloudError extends Error {
    constructor(message, kind) {
      super(message);
      this.kind = kind;
    }
  }

  function ready() {
    return Boolean(config.apiKey && config.projectId);
  }

  async function request(url, options) {
    let response;
    try {
      response = await fetch(url, options);
    } catch {
      throw new CloudError("Can't reach the server. Check your internet connection.", 'offline');
    }
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    if (response.status === 404) return null;
    const code = String((body.error && body.error.message) || '').split(' ')[0];
    if (response.status === 401 || response.status === 403 || code === 'TOKEN_EXPIRED' || code === 'INVALID_REFRESH_TOKEN' || code === 'USER_NOT_FOUND') {
      if (!messages[code]) throw new CloudError('Your login has expired. Log in again.', 'signed-out');
    }
    throw new CloudError(messages[code] || 'Something went wrong on the server. Try again in a moment.', 'server');
  }

  function post(url, body) {
    return request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  async function signIn(action, username, password) {
    if (!ready()) throw new CloudError("Accounts aren't switched on in this version yet. Play as a guest for now.", 'setup');
    const body = await post(`${endpoints.auth}/accounts:${action}?key=${config.apiKey}`, {
      email: `${username.toLowerCase()}@${emailDomain}`,
      password,
      returnSecureToken: true
    });
    return { uid: body.localId, refreshToken: body.refreshToken, idToken: body.idToken, expiresAt: Date.now() + Number(body.expiresIn) * 1000 };
  }

  // Login tokens last an hour; the long-lived refresh token swaps for a new one.
  async function idToken(session) {
    if (session.idToken && session.expiresAt - 60000 > Date.now()) return session.idToken;
    const body = await request(`${endpoints.token}/token?key=${config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`
    });
    if (!body) throw new CloudError('Your login has expired. Log in again.', 'signed-out');
    session.idToken = body.id_token;
    session.refreshToken = body.refresh_token;
    session.expiresAt = Date.now() + Number(body.expires_in) * 1000;
    return session.idToken;
  }

  function saveUrl(session) {
    return `${endpoints.database}/projects/${config.projectId}/databases/(default)/documents/users/${session.uid}`;
  }

  window.UltraCloud = {
    ready,
    signUp: (username, password) => signIn('signUp', username, password),
    logIn: (username, password) => signIn('signInWithPassword', username, password),

    // The save: { username, data (JSON text), updatedAt }, or null if this account has none yet.
    async load(session) {
      const token = await idToken(session);
      const body = await request(saveUrl(session), { headers: { Authorization: `Bearer ${token}` } });
      if (!body || !body.fields) return null;
      return {
        username: body.fields.username ? body.fields.username.stringValue : '',
        data: body.fields.data ? body.fields.data.stringValue : '{}',
        updatedAt: body.fields.updatedAt ? Number(body.fields.updatedAt.integerValue) : 0
      };
    },

    async save(session, save) {
      const token = await idToken(session);
      await request(saveUrl(session), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          username: { stringValue: save.username },
          data: { stringValue: save.data },
          updatedAt: { integerValue: String(save.updatedAt) }
        } })
      });
    },

    // For testing against Firebase's local emulators.
    useEmulator(host, projectId) {
      config.apiKey = config.apiKey || 'test-key';
      config.projectId = projectId;
      endpoints = {
        auth: `http://${host}:9099/identitytoolkit.googleapis.com/v1`,
        token: `http://${host}:9099/securetoken.googleapis.com/v1`,
        database: `http://${host}:8080/v1`
      };
    }
  };
})();
