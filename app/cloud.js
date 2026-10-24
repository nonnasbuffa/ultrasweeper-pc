// Accounts and cloud saves, through Firebase's web APIs (no SDK, so the game stays small and works offline).
// Players only ever type a username: it becomes a made-up email address behind the scenes.
(() => {
  // From the Firebase console (Project settings → General → Your apps → Web app).
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
  const signedOutCodes = ['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'INVALID_ID_TOKEN', 'USER_NOT_FOUND'];

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
    if (response.status === 401 || signedOutCodes.includes(code)) throw new CloudError('Your login has expired. Log in again.', 'signed-out');
    if (response.status === 403) throw new CloudError("The server didn't allow that.", 'denied');
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

  // Firestore wants every value labelled with its type; these convert plain objects both ways.
  function encode(data) {
    const fields = {};
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === 'boolean') fields[key] = { booleanValue: value };
      else if (typeof value === 'number') fields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
      else fields[key] = { stringValue: String(value) };
    });
    return { fields };
  }

  function decode(body) {
    if (!body || !body.fields) return null;
    const data = {};
    Object.entries(body.fields).forEach(([key, value]) => {
      if ('booleanValue' in value) data[key] = value.booleanValue;
      else if ('integerValue' in value) data[key] = Number(value.integerValue);
      else if ('doubleValue' in value) data[key] = value.doubleValue;
      else data[key] = value.stringValue || '';
    });
    return data;
  }

  function documentUrl(path) {
    return `${endpoints.database}/projects/${config.projectId}/databases/(default)/documents/${path}`;
  }

  async function getDocument(session, path) {
    const headers = session ? { Authorization: `Bearer ${await idToken(session)}` } : {};
    return decode(await request(documentUrl(path), { headers }));
  }

  async function putDocument(session, path, data) {
    const token = await idToken(session);
    await request(documentUrl(path), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(encode(data))
    });
  }

  async function deleteDocument(session, path) {
    const token = await idToken(session);
    await request(documentUrl(path), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }

  window.UltraCloud = {
    ready,
    signUp: (username, password) => signIn('signUp', username, password),
    logIn: (username, password) => signIn('signInWithPassword', username, password),

    // The player's save: { username, data (JSON text), updatedAt }, or null if there is none yet.
    load: session => getDocument(session, `users/${session.uid}`),
    save: (session, save) => putDocument(session, `users/${session.uid}`, save),
    // Someone else's save (stats included); the server only allows this for admins.
    loadSaveOf: (session, uid) => getDocument(session, `users/${uid}`),

    // Public profiles, looked up by lowercase username. Anyone can read them.
    getProfile: name => getDocument(null, `profiles/${encodeURIComponent(name.toLowerCase())}`),
    publishProfile: (session, profile) => putDocument(session, `profiles/${profile.username.toLowerCase()}`, { ...profile, uid: session.uid }),

    // Admin status lives on the server, so it can't be faked by editing the app.
    isAdmin: async session => Boolean(await getDocument(session, `admins/${session.uid}`)),
    addAdmin: (session, password) => putDocument(session, `admins/${session.uid}`, { code: password }),
    removeAdmin: session => deleteDocument(session, `admins/${session.uid}`),

    // Online maps, stored by their share code. Anyone can browse and play them; making one needs an account.
    getMap: code => getDocument(null, `maps/${encodeURIComponent(code.toUpperCase())}`),
    async createMap(session, map) {
      const token = await idToken(session);
      await request(`${documentUrl(`maps/${map.code}`)}?currentDocument.exists=false`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(encode({ ...map, authorUid: session.uid, plays: 0 }))
      });
    },
    deleteMap: (session, code) => deleteDocument(session, `maps/${code}`),
    // Adds 1 to a map's play count on the server, so two players at once can't overwrite each other.
    addPlay: code => request(`${endpoints.database}/projects/${config.projectId}/databases/(default)/documents:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: [{ transform: {
        document: `projects/${config.projectId}/databases/(default)/documents/maps/${code}`,
        fieldTransforms: [{ fieldPath: 'plays', increment: { integerValue: '1' } }]
      } }] })
    }),
    // The newest or most played maps (without their mine layouts, to keep the list quick).
    async listMaps(order) {
      const body = await request(`${endpoints.database}/projects/${config.projectId}/databases/(default)/documents:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: 'maps' }],
          select: { fields: ['code', 'name', 'author', 'authorUid', 'width', 'height', 'mineCount', 'plays', 'createdAt'].map(fieldPath => ({ fieldPath })) },
          orderBy: [{ field: { fieldPath: order }, direction: 'DESCENDING' }],
          limit: 25
        } })
      });
      return (body || []).filter(row => row.document).map(row => decode(row.document));
    },

    // For testing against Firebase's local emulators.
    useEmulator(host, projectId) {
      config.projectId = projectId;
      endpoints = {
        auth: `http://${host}:9099/identitytoolkit.googleapis.com/v1`,
        token: `http://${host}:9099/securetoken.googleapis.com/v1`,
        database: `http://${host}:8080/v1`
      };
    }
  };
})();
