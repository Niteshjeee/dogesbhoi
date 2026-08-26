import {
  badRequest,
  forbidden,
  json,
  readJson,
  sameOrigin,
  unauthorized
} from '../../../server/http.js';

import {
  verifyPassword,
  makeSession,
  sessionCookie
} from '../../../server/auth.js';

import {
  verifyTurnstile
} from '../../../server/turnstile.js';

import {
  hashReporter
} from '../../../server/crypto.js';


/*
  TEMPORARY TEST HASH

  Password:
  DogesDemo@2026!

  Diagnosis complete hone ke baad
  is constant + debug logging ko remove kar denge.
*/
const DEMO_HASH =
  'pbkdf2$310000$ZGVtby1kb2dlcy1zYWx0LTIwMjY$gudqtQkTJr9kNNkAqyprsvAE28Frl9SmDUVsqdKg_F8';


export async function onRequestPost({
  request,
  env
}) {

  /*
    ---------------------------------------------------------
    1. SAME-ORIGIN PROTECTION
    ---------------------------------------------------------
  */

  if (!sameOrigin(request)) {
    return forbidden();
  }


  /*
    ---------------------------------------------------------
    2. REQUIRED SECURITY CONFIG
    ---------------------------------------------------------
  */

  if (
    !env.SESSION_SECRET ||
    !env.ADMIN_PASSWORD_HASH ||
    !env.IP_HASH_SECRET
  ) {

    return json(
      {
        error:
          'Admin security is not configured'
      },
      503
    );

  }


  /*
    ---------------------------------------------------------
    3. READ REQUEST BODY
    ---------------------------------------------------------
  */

  let body;

  try {

    body =
      await readJson(
        request,
        12_000
      );

  }

  catch {

    return badRequest(
      'Invalid request'
    );

  }


  /*
    ---------------------------------------------------------
    4. TURNSTILE
    ---------------------------------------------------------
  */

  const ip =
    request.headers.get(
      'CF-Connecting-IP'
    ) || '';


  const humanOk =
    await verifyTurnstile(

      env.TURNSTILE_SECRET_KEY,

      body.turnstileToken,

      ip,

      'admin_login'
    );


  if (!humanOk) {

    return badRequest(
      'Human verification failed'
    );

  }


  /*
    ---------------------------------------------------------
    5. PRIVACY-PRESERVING REPORTER HASH
    ---------------------------------------------------------
  */

  const reporterHash =
    await hashReporter(

      env.IP_HASH_SECRET,

      ip,

      request.headers.get(
        'user-agent'
      ) || ''

    );


  /*
    ---------------------------------------------------------
    6. CLEAR OLD LOGIN ATTEMPTS
    ---------------------------------------------------------
  */

  await env.DB
    .prepare(
      `
      DELETE FROM admin_login_attempts
      WHERE created_at < ?
      `
    )
    .bind(
      Date.now() -
      24 * 60 * 60_000
    )
    .run();


  /*
    ---------------------------------------------------------
    7. BRUTE-FORCE LIMIT
    ---------------------------------------------------------
  */

  const since =
    Date.now() -
    15 * 60_000;


  const count =
    await env.DB
      .prepare(
        `
        SELECT COUNT(*) AS c
        FROM admin_login_attempts
        WHERE reporter_hash = ?
        AND created_at > ?
        `
      )
      .bind(
        reporterHash,
        since
      )
      .first();


  if (
    Number(
      count?.c || 0
    ) >= 8
  ) {

    return json(
      {
        error:
          'Too many login attempts. Try again later.'
      },
      429
    );

  }


  /*
    ---------------------------------------------------------
    8. NORMALIZE LOGIN VALUES
    ---------------------------------------------------------
  */

  const expectedUsername =
    String(
      env.ADMIN_USERNAME ||
      'admin'
    );


  const submittedUsername =
    String(
      body.username ||
      ''
    );


  const submittedPassword =
    String(
      body.password ||
      ''
    );


  const storedHash =
    String(
      env.ADMIN_PASSWORD_HASH ||
      ''
    );


  /*
    ---------------------------------------------------------
    9. REAL LOGIN CHECK
    ---------------------------------------------------------
  */

  const validUser =
    submittedUsername ===
    expectedUsername;


  const validPass =
    await verifyPassword(
      submittedPassword,
      storedHash
    );


  /*
    ---------------------------------------------------------
    10. TEMPORARY DIAGNOSTIC CHECKS

    No real password/hash/secret is printed.
    ---------------------------------------------------------
  */

  const hashParts =
    storedHash.split('$');


  /*
    Does Cloudflare ENV contain
    EXACTLY our known demo hash?
  */
  const envHashIsExactDemo =
    storedHash === DEMO_HASH;


  /*
    Does known demo password work
    against whatever ENV hash
    Cloudflare currently supplied?
  */
  const demoPasswordWorksWithEnvHash =
    await verifyPassword(
      'DogesDemo@2026!',
      storedHash
    );


  /*
    Does password received from browser
    work against our hard-coded,
    known-good demo hash?
  */
  const submittedPasswordWorksWithKnownDemo =
    await verifyPassword(
      submittedPassword,
      DEMO_HASH
    );


  /*
    ---------------------------------------------------------
    SAFE DEBUG OUTPUT

    IMPORTANT:
    We are NOT logging:
    - password
    - full password hash
    - salt
    - digest
    - session secret
    - IP secret
    ---------------------------------------------------------
  */

  console.log(
    'ADMIN_LOGIN_DEBUG',
    JSON.stringify({

      expectedUsername,

      submittedUsername,

      usernameMatch:
        validUser,

      passwordLength:
        submittedPassword.length,

      passwordMatch:
        validPass,

      hashPresent:
        storedHash.length > 0,

      hashLength:
        storedHash.length,

      hashStartsCorrectly:
        storedHash.startsWith(
          'pbkdf2$'
        ),

      hashParts:
        hashParts.length,

      hashKind:
        hashParts[0] || '',

      iterations:
        hashParts[1] || '',

      saltCharacters:
        hashParts[2]?.length || 0,

      digestCharacters:
        hashParts[3]?.length || 0,

      leadingOrTrailingWhitespace:
        storedHash !==
        storedHash.trim(),

      containsWhitespace:
        /\s/.test(
          storedHash
        ),

      /*
        THESE THREE ARE THE
        IMPORTANT NEW VALUES
      */

      envHashIsExactDemo,

      demoPasswordWorksWithEnvHash,

      submittedPasswordWorksWithKnownDemo

    })
  );


  /*
    ---------------------------------------------------------
    11. FAILED LOGIN
    ---------------------------------------------------------
  */

  if (
    !validUser ||
    !validPass
  ) {

    await env.DB
      .prepare(
        `
        INSERT INTO
        admin_login_attempts(
          reporter_hash,
          created_at
        )
        VALUES (?, ?)
        `
      )
      .bind(
        reporterHash,
        Date.now()
      )
      .run();


    return unauthorized(
      'Invalid login'
    );

  }


  /*
    ---------------------------------------------------------
    12. SUCCESS

    Delete failed attempts.
    ---------------------------------------------------------
  */

  await env.DB
    .prepare(
      `
      DELETE FROM admin_login_attempts
      WHERE reporter_hash = ?
      `
    )
    .bind(
      reporterHash
    )
    .run();


  /*
    ---------------------------------------------------------
    13. CREATE SECURE SESSION
    ---------------------------------------------------------
  */

  const token =
    await makeSession(
      env.SESSION_SECRET
    );


  /*
    ---------------------------------------------------------
    14. SEND HTTPONLY SESSION COOKIE
    ---------------------------------------------------------
  */

  return json(
    {
      ok: true
    },
    200,
    {
      'set-cookie':
        sessionCookie(
          token
        )
    }
  );

}
