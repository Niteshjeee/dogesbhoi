import './style.css';
import QRCode from 'qrcode';
import L from 'leaflet';

const app = document.querySelector('#app');

let config = { turnstileSiteKey: '' };
let currentMap = null;
let currentTurnstileId = null;
let me = null;


/* =========================================================
   HELPERS
========================================================= */

const esc = (v = '') =>
  String(v).replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));


const fmtTime = ms => ms
  ? new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(Number(ms)))
  : 'Never';


const ago = ms => {
  if (!ms) return 'No sightings yet';

  const s = Math.max(
    0,
    Math.floor((Date.now() - Number(ms)) / 1000)
  );

  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;

  return `${Math.floor(s / 86400)} day ago`;
};


const nice = v => ({
  with_puppies: 'With puppies',
  needs_help: 'Needs help',
  afraid: 'Afraid',
  seen: 'Seen',
  safe: 'Safe',
  injured: 'Injured',
  hungry: 'Hungry'
}[v] || v || 'Seen');


/* =========================================================
   GOOGLE MAPS NAVIGATION
   No API key / Google Maps API billing required.
========================================================= */

function mapsDirectionsUrl(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return '';
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${latitude},${longitude}`
  )}`;
}


function navigationButton(
  lat,
  lng,
  label = '🧭 Navigate'
) {
  const url = mapsDirectionsUrl(lat, lng);

  if (!url) return '';

  return `
    <a
      class="btn secondary"
      href="${esc(url)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      ${esc(label)}
    </a>
  `;
}


/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.error || `Request failed (${res.status})`
    );
  }

  return data;
}


/* =========================================================
   NAV / PAGE SHELL
========================================================= */

function nav() {
  return `
    <nav class="nav">
      <div class="wrap navin">

        <a class="brand" href="/" data-link>
          <span class="brandmark">🐾</span>
          Doges
        </a>

        <div class="navlinks">
          <a
            class="linkbtn hide-sm"
            href="/"
            data-link
          >
            Street dogs
          </a>

          <a
            class="linkbtn"
            href="/admin"
            data-link
          >
            Admin
          </a>
        </div>

      </div>
    </nav>
  `;
}


function footer() {
  return `
    <footer class="footer">
      <div class="wrap">
        Community street-dog safety network ·
        Sightings are community reports,
        not continuous GPS tracking.
      </div>
    </footer>
  `;
}


function shell(content) {
  app.innerHTML =
    nav() +
    content +
    footer();

  bindLinks();
}


function bindLinks() {
  document
    .querySelectorAll('[data-link]')
    .forEach(a => {
      a.addEventListener('click', e => {
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }

        e.preventDefault();

        history.pushState(
          {},
          '',
          a.getAttribute('href')
        );

        route();
      });
    });
}


/* =========================================================
   MAP
========================================================= */

function clearMap() {
  if (currentMap) {
    currentMap.remove();
    currentMap = null;
  }
}


/* =========================================================
   TURNSTILE
========================================================= */

function resetTurnstile(remove = true) {
  if (
    window.turnstile &&
    currentTurnstileId !== null
  ) {
    try {
      if (remove) {
        window.turnstile.remove(
          currentTurnstileId
        );
      } else {
        window.turnstile.reset(
          currentTurnstileId
        );
      }
    } catch {}
  }

  if (remove) {
    currentTurnstileId = null;
  }
}


function waitTurnstile() {
  return new Promise((resolve, reject) => {
    let n = 0;

    const timer = setInterval(() => {
      if (window.turnstile) {
        clearInterval(timer);
        resolve(window.turnstile);
      } else if (++n > 100) {
        clearInterval(timer);

        reject(
          new Error(
            'Human verification failed to load'
          )
        );
      }
    }, 100);
  });
}


async function renderTurnstile(
  el,
  callback,
  action
) {
  resetTurnstile(true);

  if (!config.turnstileSiteKey) {
    el.innerHTML = `
      <div class="notice bad">
        Turnstile is not configured.
      </div>
    `;
    return;
  }

  const ts = await waitTurnstile();

  currentTurnstileId = ts.render(el, {
    sitekey: config.turnstileSiteKey,
    theme: 'light',
    action,
    callback,

    'expired-callback': () =>
      callback(''),

    'error-callback': () =>
      callback('')
  });
}


/* =========================================================
   HOME
========================================================= */

async function home() {
  clearMap();
  resetTurnstile(true);
  me = null;

  shell(`
    <main>

      <section class="hero">
        <div class="wrap">

          <span class="badge">
            Community-powered street dog safety
          </span>

          <h1>
            See them. Help them.
            Keep their trail safe.
          </h1>

          <p>
            Each dog gets one permanent QR.
            A scan can add a consent-based sighting,
            condition and note.
            Accepted sightings build a useful
            location history.
          </p>

        </div>
      </section>


      <section class="section">
        <div class="wrap">

          <div class="sectionhead">

            <div>
              <h2>Street dogs</h2>

              <div class="muted">
                Latest community records
              </div>
            </div>

            <input
              id="search"
              class="search"
              placeholder="Search name or area…"
              autocomplete="off"
            >

          </div>


          <div id="dogs" class="grid">
            <div class="card empty">
              Loading…
            </div>
          </div>

        </div>
      </section>

    </main>
  `);


  try {
    const { dogs } =
      await api('/api/public/dogs');

    const box =
      document.querySelector('#dogs');

    const search =
      document.querySelector('#search');


    const draw = (q = '') => {
      const filtered =
        dogs.filter(d =>
          `${d.name} ${d.area} ${d.color}`
            .toLowerCase()
            .includes(q.toLowerCase())
        );


      box.innerHTML =
        filtered.length

          ? filtered.map(d => `
              <article class="card dogcard">

                ${
                  d.photo_data
                    ? `
                        <img
                          class="dogphoto"
                          src="${d.photo_data}"
                          alt="${esc(d.name)}"
                        >
                      `
                    : `
                        <div class="dogphoto placeholder">
                          🐕
                        </div>
                      `
                }


                <div>
                  <div class="dogname">
                    ${esc(d.name)}
                  </div>

                  <div class="muted">
                    ${esc(
                      d.area ||
                      'Area not set'
                    )}
                  </div>
                </div>


                <div class="meta">

                  <span class="pill">
                    ${esc(d.sex)}
                  </span>

                  <span class="pill">
                    Vaccinated:
                    ${esc(d.vaccination_status)}
                  </span>

                  <span class="pill">
                    Sterilized:
                    ${esc(d.sterilized_status)}
                  </span>

                </div>


                <div class="muted">
                  ${
                    d.last_seen_at
                      ? `Last seen ${ago(d.last_seen_at)}`
                      : 'No accepted sighting yet'
                  }
                </div>


                <a
                  class="btn"
                  href="/dog/${encodeURIComponent(d.id)}"
                  data-link
                >
                  View profile
                </a>

              </article>
            `).join('')

          : `
              <div class="card empty">
                No matching dogs.
              </div>
            `;


      bindLinks();
    };


    draw();


    search.addEventListener(
      'input',
      () => draw(search.value)
    );

  } catch (e) {
    document.querySelector('#dogs')
      .innerHTML = `
        <div class="card empty">
          ${esc(e.message)}
        </div>
      `;
  }
}


/* =========================================================
   DOG LOCATION MAP
========================================================= */

function dogMap(sightings) {
  const el =
    document.querySelector('#map');

  if (
    !el ||
    !sightings.length
  ) {
    return;
  }


  currentMap = L.map(
    el,
    {
      scrollWheelZoom: false
    }
  );


  L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,

      attribution:
        '&copy; OpenStreetMap contributors'
    }
  ).addTo(currentMap);


  const chronological =
    [...sightings].reverse();

  const coords = [];


  chronological.forEach(
    (s, i) => {
      const latitude =
        Number(s.latitude);

      const longitude =
        Number(s.longitude);


      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return;
      }


      const ll = [
        latitude,
        longitude
      ];


      coords.push(ll);


      const latest =
        i ===
        chronological.length - 1;


      const directions =
        mapsDirectionsUrl(
          latitude,
          longitude
        );


      const popup = `
        <div style="min-width:185px">

          <strong>
            ${
              latest
                ? 'Latest sighting'
                : esc(fmtTime(s.created_at))
            }
          </strong>


          <div style="margin-top:5px">
            ${esc(nice(s.condition))}
          </div>


          ${
            s.note
              ? `
                  <div style="margin-top:5px">
                    📝 ${esc(s.note)}
                  </div>
                `
              : ''
          }


          <div
            style="
              margin-top:5px;
              font-size:12px;
              opacity:.75
            "
          >
            GPS ±${Math.round(
              Number(s.accuracy_m) || 0
            )}m
          </div>


          ${
            directions
              ? `
                  <a
                    href="${esc(directions)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="
                      display:inline-block;
                      margin-top:10px;
                      padding:9px 13px;
                      border-radius:9px;
                      background:#1f7a4d;
                      color:#fff;
                      text-decoration:none;
                      font-weight:700;
                    "
                  >
                    🧭 Navigate
                  </a>
                `
              : ''
          }

        </div>
      `;


      L.circleMarker(
        ll,
        {
          radius:
            latest
              ? 10
              : 6,

          weight: 3,
          fillOpacity: .8
        }
      )
      .addTo(currentMap)
      .bindPopup(popup);

    }
  );


  if (!coords.length) {
    currentMap.remove();
    currentMap = null;
    return;
  }


  if (coords.length > 1) {
    L.polyline(
      coords,
      {
        weight: 3,
        opacity: .6,
        dashArray: '7 7'
      }
    ).addTo(currentMap);
  }


  currentMap.fitBounds(
    L.latLngBounds(coords),
    {
      padding: [35, 35],
      maxZoom: 16
    }
  );
}


/* =========================================================
   DOG PUBLIC PROFILE
========================================================= */

async function dogPage(id) {
  clearMap();
  resetTurnstile(true);


  shell(`
    <main>
      <div class="wrap section">

        <div class="card empty">
          Loading dog profile…
        </div>

      </div>
    </main>
  `);


  try {
    const {
      dog,
      sightings
    } =
      await api(
        `/api/public/dog/${encodeURIComponent(id)}`
      );


    const latest =
      sightings[0];


    const timeline =
      sightings.length

        ? sightings.map(
            (s, i) => `
              <div class="sighting">

                <div class="dotcol">

                  <div class="dot"></div>

                  ${
                    i < sightings.length - 1
                      ? '<div class="line"></div>'
                      : ''
                  }

                </div>


                <div class="sightingbody">

                  <strong>
                    ${
                      i === 0
                        ? 'Latest · '
                        : ''
                    }

                    ${esc(nice(s.condition))}
                  </strong>


                  <span class="muted">

                    ${esc(
                      fmtTime(s.created_at)
                    )}

                    · GPS ±${Math.round(
                      Number(s.accuracy_m) || 0
                    )}m

                  </span>


                  <div
                    class="confidence ${esc(
                      s.confidence
                    )}"
                  >
                    ${esc(
                      String(s.confidence)
                        .toUpperCase()
                    )}

                    CONFIDENCE
                  </div>


                  ${
                    s.note
                      ? `
                          <div style="margin-top:5px">
                            📝 ${esc(s.note)}
                          </div>
                        `
                      : ''
                  }


                  <div style="margin-top:10px">

                    ${navigationButton(
                      s.latitude,
                      s.longitude,
                      i === 0
                        ? '🧭 Navigate to latest sighting'
                        : '🧭 Navigate'
                    )}

                  </div>

                </div>

              </div>
            `
          ).join('')

        : `
            <div class="notice">
              No accepted sightings yet.
              The first public report is held
              for admin review.
            </div>
          `;


    shell(`
      <main>
        <div class="wrap">


          <section class="profilehead">

            ${
              dog.photo_data
                ? `
                    <img
                      class="dogphoto"
                      src="${dog.photo_data}"
                      alt="${esc(dog.name)}"
                    >
                  `
                : `
                    <div class="dogphoto placeholder">
                      🐕
                    </div>
                  `
            }


            <div>

              <span class="badge">
                Permanent dog profile
              </span>


              <h1>
                ${esc(dog.name)}
              </h1>


              <div class="muted">

                ${esc(
                  dog.area ||
                  'Area not set'
                )}

                ·

                ${esc(
                  dog.color ||
                  'Color not set'
                )}

              </div>


              <div
                class="meta"
                style="margin-top:12px"
              >

                <span class="pill">
                  ${esc(dog.sex)}
                </span>


                <span class="pill">
                  Vaccinated:
                  ${esc(
                    dog.vaccination_status
                  )}
                </span>


                <span class="pill">
                  Sterilized:
                  ${esc(
                    dog.sterilized_status
                  )}
                </span>

              </div>


              ${
                dog.description
                  ? `
                      <p style="line-height:1.6">
                        ${esc(dog.description)}
                      </p>
                    `
                  : ''
              }


              <div class="profileactions">

                <button
                  class="btn"
                  id="shareSighting"
                >
                  📍 Share sighting
                </button>


                ${
                  latest
                    ? navigationButton(
                        latest.latitude,
                        latest.longitude,
                        '🧭 Navigate to Last Seen'
                      )
                    : ''
                }


                <button
                  class="btn secondary"
                  id="shareProfile"
                >
                  Share profile
                </button>

              </div>

            </div>

          </section>


          <section class="section">

            <div class="latest">

              <div class="card">

                <div class="muted">
                  Latest accepted sighting
                </div>


                <div class="metric">
                  ${
                    latest
                      ? ago(latest.created_at)
                      : 'None yet'
                  }
                </div>


                ${
                  latest
                    ? `
                        <div style="margin-top:8px">

                          ${esc(
                            nice(latest.condition)
                          )}

                          ·

                          <span
                            class="confidence ${esc(
                              latest.confidence
                            )}"
                          >
                            ${esc(
                              latest.confidence
                            )}
                          </span>

                        </div>


                        ${
                          latest.note
                            ? `
                                <div style="margin-top:8px">
                                  📝 ${esc(latest.note)}
                                </div>
                              `
                            : ''
                        }


                        <div style="margin-top:12px">

                          ${navigationButton(
                            latest.latitude,
                            latest.longitude,
                            '🧭 Get directions'
                          )}

                        </div>
                      `
                    : ''
                }

              </div>


              <div class="card">

                <div class="muted">
                  History entries
                </div>


                <div class="metric">
                  ${sightings.length}
                </div>


                <div
                  style="margin-top:8px"
                  class="muted"
                >
                  Only accepted reports are public
                </div>

              </div>

            </div>

          </section>


          <section class="section">

            <div class="sectionhead">

              <div>

                <h2>
                  Location history
                </h2>


                <div class="muted">
                  Tap a marker for sighting details
                  and navigation.
                  Newest accepted sighting is
                  the current Last Seen.
                </div>

              </div>

            </div>


            ${
              sightings.length
                ? `
                    <div
                      id="map"
                      class="map"
                    ></div>
                  `
                : `
                    <div class="card empty">
                      Map appears after an admin
                      accepts the first sighting.
                    </div>
                  `
            }

          </section>


          <section class="section">

            <div class="sectionhead">

              <div>

                <h2>
                  Sighting timeline
                </h2>


                <div class="muted">
                  Up to 50 recent accepted sightings ·
                  every location has directions
                </div>

              </div>

            </div>


            <div class="card timeline">
              ${timeline}
            </div>

          </section>


        </div>
      </main>
    `);


    if (sightings.length) {
      dogMap(sightings);
    }


    document
      .querySelector('#shareSighting')
      .addEventListener(
        'click',
        () =>
          openSightingModal(dog)
      );


    document
      .querySelector('#shareProfile')
      .addEventListener(
        'click',
        async () => {
          try {
            if (navigator.share) {
              await navigator.share({
                title:
                  `${dog.name} — Doges`,

                url:
                  location.href
              });
            } else {
              alert(
                'Copy this page URL from your browser to share it.'
              );
            }
          } catch {}
        }
      );

  } catch (e) {
    shell(`
      <main>
        <div class="wrap section">

          <div class="card empty">
            ${esc(e.message)}
          </div>

        </div>
      </main>
    `);
  }
}


/* =========================================================
   MODAL
========================================================= */

function modal(html) {
  const back =
    document.createElement('div');


  back.className =
    'modalback';


  back.innerHTML = `
    <div class="modal">
      ${html}
    </div>
  `;


  document.body.appendChild(back);


  const close = () => {
    resetTurnstile(true);
    back.remove();
  };


  back.addEventListener(
    'click',
    e => {
      if (e.target === back) {
        close();
      }
    }
  );


  back
    .querySelector('[data-close]')
    ?.addEventListener(
      'click',
      close
    );


  return {
    back,
    close
  };
}


/* =========================================================
   SHARE SIGHTING
========================================================= */

async function openSightingModal(dog) {
  let gps = null;
  let token = '';


  const m = modal(`
    <div class="modalhead">

      <div>

        <h2>
          Share a sighting
        </h2>


        <div class="muted">
          ${esc(dog.name)}
          · location is shared only
          after Submit
        </div>

      </div>


      <button
        class="iconbtn"
        data-close
        aria-label="Close"
      >
        ×
      </button>

    </div>


    <div class="notice">
      A report is a community sighting,
      not proof of physical presence.
      Suspicious reports are held for review.
    </div>


    <div
      class="formgrid"
      style="margin-top:14px"
    >

      <div class="field full">

        <button
          class="btn secondary"
          id="getGps"
        >
          📍 Get my current location
        </button>


        <div
          id="gpsState"
          class="hint"
        >
          Location not requested yet.
        </div>

      </div>


      <div class="field full">

        <label>
          Condition
        </label>


        <div class="conditionrow">

          ${
            [
              'seen',
              'safe',
              'injured',
              'hungry',
              'with_puppies',
              'afraid',
              'needs_help'
            ]
            .map(
              (x, i) => `
                <input
                  type="radio"
                  name="condition"
                  value="${x}"
                  id="c${i}"
                  ${i === 0 ? 'checked' : ''}
                >

                <label for="c${i}">
                  ${nice(x)}
                </label>
              `
            )
            .join('')
          }

        </div>

      </div>


      <div class="field full">

        <label for="note">
          Note
          <span class="muted">
            (optional)
          </span>
        </label>


        <textarea
          id="note"
          maxlength="250"
          placeholder="e.g. Sitting near Gate 2, looks injured…"
        ></textarea>


        <div class="hint">
          Maximum 250 characters.
          Please avoid personal information.
        </div>

      </div>


      <div class="field full">

        <div
          id="sightingTs"
          class="turnstile-slot"
        ></div>

      </div>


      <div class="field full">

        <button
          class="btn"
          id="submitSighting"
          disabled
        >
          Submit sighting
        </button>


        <div id="sightingMsg"></div>

      </div>

    </div>
  `);


  const gpsBtn =
    m.back.querySelector('#getGps');

  const state =
    m.back.querySelector('#gpsState');

  const submit =
    m.back.querySelector('#submitSighting');

  const msg =
    m.back.querySelector('#sightingMsg');


  gpsBtn.addEventListener(
    'click',
    () => {
      state.textContent =
        'Requesting location permission…';


      navigator.geolocation
        .getCurrentPosition(

          pos => {
            gps = {
              latitude:
                pos.coords.latitude,

              longitude:
                pos.coords.longitude,

              accuracy:
                pos.coords.accuracy
            };


            state.textContent =
              `Location ready · accuracy about ±${Math.round(
                gps.accuracy
              )}m`;


            submit.disabled =
              !(token && gps);
          },


          err => {
            state.textContent =
              err.code === 1

                ? 'Location permission was not allowed.'

                : 'Could not get a usable location.';
          },


          {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 0
          }

        );
    }
  );


  await renderTurnstile(
    m.back.querySelector('#sightingTs'),

    t => {
      token = t;

      submit.disabled =
        !(token && gps);
    },

    'sighting'
  );


  submit.addEventListener(
    'click',
    async () => {
      if (!gps || !token) {
        return;
      }


      submit.disabled = true;


      msg.innerHTML = `
        <div class="notice">
          Submitting…
        </div>
      `;


      try {
        const condition =
          m.back
            .querySelector(
              'input[name="condition"]:checked'
            )
            ?.value ||
          'seen';


        const result =
          await api(
            '/api/sighting',
            {
              method: 'POST',

              body:
                JSON.stringify({
                  dogId:
                    dog.id,

                  ...gps,

                  condition,

                  note:
                    m.back
                      .querySelector('#note')
                      .value,

                  turnstileToken:
                    token
                })
            }
          );


        msg.innerHTML =
          result.sighting.moderationStatus ===
          'accepted'

            ? `
                <div class="notice good">
                  Sighting accepted.
                  Thank you for helping 🐾
                </div>
              `

            : `
                <div class="notice warn">
                  Report received and held
                  for admin review.
                  It will not replace
                  public Last Seen yet.
                </div>
              `;


        setTimeout(
          () => {
            m.close();

            dogPage(
              dog.id
            );
          },
          1100
        );

      } catch (e) {
        msg.innerHTML = `
          <div class="notice bad">
            ${esc(e.message)}
          </div>
        `;


        token = '';

        submit.disabled = true;


        resetTurnstile(false);

      } finally {
        submit.disabled =
          !(token && gps);
      }
    }
  );
}


/* =========================================================
   ADMIN
========================================================= */

async function admin() {
  clearMap();
  resetTurnstile(true);


  shell(`
    <main>

      <div class="wrap adminshell">

        <div class="card">

          <div class="muted">
            Checking admin session…
          </div>

        </div>

      </div>

    </main>
  `);


  try {
    const result =
      await api(
        '/api/admin/me'
      );


    me =
      result.admin;


    return adminDashboard();

  } catch {
    me = null;

    return adminLogin();
  }
}


/* =========================================================
   ADMIN LOGIN
========================================================= */

async function adminLogin() {
  resetTurnstile(true);


  shell(`
    <main>

      <div
        class="wrap adminshell"
        style="max-width:560px"
      >

        <div class="card">

          <span class="badge">
            Protected administration
          </span>


          <h1 style="margin-top:0">
            Admin login
          </h1>


          <p class="muted">
            Multiple admins are supported.
            Password hashes are stored in D1;
            the browser never receives them.
          </p>


          <form
            id="loginForm"
            class="formgrid"
          >

            <div class="field full">

              <label>
                Username
              </label>


              <input
                id="username"
                autocomplete="username"
                required
              >

            </div>


            <div class="field full">

              <label>
                Password
              </label>


              <input
                id="password"
                type="password"
                autocomplete="current-password"
                minlength="16"
                required
              >

            </div>


            <div class="field full">

              <div
                id="loginTs"
                class="turnstile-slot"
              ></div>

            </div>


            <div class="field full">

              <button
                id="loginBtn"
                class="btn"
                disabled
              >
                Login
              </button>


              <div id="loginMsg"></div>

            </div>

          </form>

        </div>

      </div>

    </main>
  `);


  let token = '';


  const btn =
    document.querySelector('#loginBtn');

  const message =
    document.querySelector('#loginMsg');


  await renderTurnstile(
    document.querySelector('#loginTs'),

    t => {
      token = t;

      btn.disabled =
        !token;
    },

    'admin_login'
  );


  document
    .querySelector('#loginForm')
    .addEventListener(
      'submit',
      async e => {
        e.preventDefault();


        if (!token) {
          return;
        }


        btn.disabled = true;


        message.innerHTML = `
          <div class="notice">
            Verifying…
          </div>
        `;


        try {
          const result =
            await api(
              '/api/admin/login',
              {
                method: 'POST',

                body:
                  JSON.stringify({
                    username:
                      document
                        .querySelector('#username')
                        .value
                        .trim(),

                    password:
                      document
                        .querySelector('#password')
                        .value,

                    turnstileToken:
                      token
                  })
              }
            );


          me =
            result.admin;


          return adminDashboard();

        } catch (err) {
          message.innerHTML = `
            <div class="notice bad">
              ${esc(err.message)}
            </div>
          `;


          token = '';

          btn.disabled = true;


          resetTurnstile(false);

        } finally {
          btn.disabled =
            !token;
        }
      }
    );
}


/* =========================================================
   ADMIN DASHBOARD
========================================================= */

async function adminDashboard() {
  resetTurnstile(true);


  shell(`
    <main>

      <div class="wrap adminshell">


        <div class="admintop">

          <div>

            <span class="badge">
              ${esc(me?.role || 'admin')}
              ·
              ${esc(me?.username || '')}
            </span>


            <h1 style="margin:0 0 6px">
              Doges dashboard
            </h1>


            <div class="muted">
              Create permanent dog IDs,
              print QR codes,
              review sightings
              ${
                me?.role === 'owner'
                  ? ' and manage admins'
                  : ''
              }.
            </div>

          </div>


          <button
            id="logout"
            class="btn secondary"
          >
            Logout
          </button>

        </div>


        <section
          class="section admincols"
        >

          <div class="card">

            <h2>
              Add street dog
            </h2>


            <form
              id="addDog"
              class="formgrid"
            >

              <div class="field">

                <label>
                  Name / nickname
                </label>

                <input
                  id="dname"
                  maxlength="60"
                  required
                >

              </div>


              <div class="field">

                <label>
                  Area
                </label>

                <input
                  id="darea"
                  maxlength="100"
                >

              </div>


              <div class="field">

                <label>
                  Sex
                </label>

                <select id="dsex">

                  <option value="unknown">
                    Unknown
                  </option>

                  <option value="male">
                    Male
                  </option>

                  <option value="female">
                    Female
                  </option>

                </select>

              </div>


              <div class="field">

                <label>
                  Color / marks
                </label>

                <input
                  id="dcolor"
                  maxlength="60"
                >

              </div>


              <div class="field">

                <label>
                  Vaccinated
                </label>

                <select id="dvax">

                  <option value="unknown">
                    Unknown
                  </option>

                  <option value="yes">
                    Yes
                  </option>

                  <option value="no">
                    No
                  </option>

                </select>

              </div>


              <div class="field">

                <label>
                  Sterilized
                </label>

                <select id="dster">

                  <option value="unknown">
                    Unknown
                  </option>

                  <option value="yes">
                    Yes
                  </option>

                  <option value="no">
                    No
                  </option>

                </select>

              </div>


              <div class="field full">

                <label>
                  Description
                </label>


                <textarea
                  id="ddesc"
                  maxlength="500"
                ></textarea>

              </div>


              <div class="field full">

                <label>
                  Photo
                  <span class="muted">
                    (optional)
                  </span>
                </label>


                <input
                  id="dphoto"
                  type="file"
                  accept="image/*"
                >


                <div class="hint">
                  Compressed in your browser
                  to WebP before upload.
                </div>

              </div>


              <div class="field full">

                <button
                  class="btn"
                  id="addBtn"
                >
                  Create dog + permanent QR
                </button>


                <div id="addMsg"></div>

              </div>

            </form>

          </div>


          <div class="card">

            <h2>
              Safety model
            </h2>


            <div class="notice good">
              ✓ Permanent QR URL;
              dog details can change
              without reprinting.
            </div>


            <div
              class="notice"
              style="margin-top:9px"
            >
              ✓ First public sighting is
              held for admin review.
            </div>


            <div
              class="notice"
              style="margin-top:9px"
            >
              ✓ Suspicious location jumps
              do not overwrite public Last Seen.
            </div>


            <div
              class="notice"
              style="margin-top:9px"
            >
              ✓ Multiple admins use
              separate accounts and
              revocable sessions.
            </div>

          </div>

        </section>


        <section class="section">

          <div class="sectionhead">

            <div>

              <h2>
                Dogs
              </h2>


              <div class="muted">
                Generate/reprint
                the same QR at any time
              </div>

            </div>

          </div>


          <div class="card tablewrap">

            <table class="table">

              <thead>

                <tr>
                  <th>Dog</th>
                  <th>Area</th>
                  <th>ID</th>
                  <th>QR</th>
                </tr>

              </thead>


              <tbody id="adminDogs">

                <tr>
                  <td colspan="4">
                    Loading…
                  </td>
                </tr>

              </tbody>

            </table>

          </div>

        </section>


        <section class="section">

          <div class="sectionhead">

            <div>

              <h2>
                Sighting moderation
              </h2>


              <div class="muted">
                Review held reports
                before they affect public history
              </div>

            </div>

          </div>


          <div class="card tablewrap">

            <table class="table">

              <thead>

                <tr>
                  <th>Dog / time</th>
                  <th>Report</th>
                  <th>Risk</th>
                  <th>Action</th>
                </tr>

              </thead>


              <tbody id="adminSightings">

                <tr>
                  <td colspan="4">
                    Loading…
                  </td>
                </tr>

              </tbody>

            </table>

          </div>

        </section>


        ${
          me?.role === 'owner'
            ? `
                <section class="section">

                  <div class="sectionhead">

                    <div>

                      <h2>
                        Admins
                      </h2>


                      <div class="muted">
                        Owner-only account management
                      </div>

                    </div>

                  </div>


                  <div class="admincols">

                    <div class="card">

                      <h2>
                        Add admin
                      </h2>


                      <form
                        id="addAdmin"
                        class="formgrid"
                      >

                        <div class="field full">

                          <label>
                            Username
                          </label>


                          <input
                            id="auser"
                            minlength="3"
                            maxlength="32"
                            placeholder="volunteer-admin"
                            required
                          >

                        </div>


                        <div class="field full">

                          <label>
                            Password
                          </label>


                          <input
                            id="apass"
                            type="password"
                            minlength="16"
                            maxlength="128"
                            required
                          >


                          <div class="hint">
                            Use a unique
                            16+ character password.
                          </div>

                        </div>


                        <div class="field full">

                          <label>
                            Role
                          </label>


                          <select id="arole">

                            <option value="admin">
                              Admin
                            </option>

                            <option value="owner">
                              Owner
                            </option>

                          </select>

                        </div>


                        <div class="field full">

                          <button
                            class="btn"
                            id="addAdminBtn"
                          >
                            Create admin
                          </button>


                          <div id="addAdminMsg"></div>

                        </div>

                      </form>

                    </div>


                    <div class="card tablewrap">

                      <table class="table">

                        <thead>

                          <tr>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Last login</th>
                            <th>Action</th>
                          </tr>

                        </thead>


                        <tbody id="adminsList">

                          <tr>
                            <td colspan="5">
                              Loading…
                            </td>
                          </tr>

                        </tbody>

                      </table>

                    </div>

                  </div>

                </section>
              `
            : ''
        }


      </div>
    </main>
  `);


  document
    .querySelector('#logout')
    .addEventListener(
      'click',
      async () => {
        await api(
          '/api/admin/logout',
          {
            method: 'POST',
            body: '{}'
          }
        );


        me = null;


        adminLogin();
      }
    );


  document
    .querySelector('#addDog')
    .addEventListener(
      'submit',
      addDog
    );


  if (me?.role === 'owner') {
    document
      .querySelector('#addAdmin')
      .addEventListener(
        'submit',
        addAdmin
      );
  }


  await refreshAdmin();
}


/* =========================================================
   IMAGE COMPRESSION
========================================================= */

async function compressImage(file) {
  if (!file) {
    return '';
  }


  const bitmap =
    await createImageBitmap(file);


  let w =
    bitmap.width;

  let h =
    bitmap.height;


  const max =
    720;


  if (Math.max(w, h) > max) {
    const ratio =
      max /
      Math.max(w, h);


    w =
      Math.round(w * ratio);


    h =
      Math.round(h * ratio);
  }


  const canvas =
    document.createElement('canvas');


  canvas.width = w;
  canvas.height = h;


  const ctx =
    canvas.getContext('2d');


  ctx.drawImage(
    bitmap,
    0,
    0,
    w,
    h
  );


  bitmap.close();


  let q = .76;


  let data =
    canvas.toDataURL(
      'image/webp',
      q
    );


  while (
    data.length > 200000 &&
    q > .35
  ) {
    q -= .08;


    data =
      canvas.toDataURL(
        'image/webp',
        q
      );
  }


  if (data.length > 220000) {
    throw new Error(
      'Photo is still too large after compression. Try a smaller image.'
    );
  }


  return data;
}


/* =========================================================
   ADD DOG
========================================================= */

async function addDog(e) {
  e.preventDefault();


  const btn =
    document.querySelector('#addBtn');


  const msg =
    document.querySelector('#addMsg');


  btn.disabled = true;


  msg.innerHTML = `
    <div class="notice">
      Preparing dog profile…
    </div>
  `;


  try {
    const photoData =
      await compressImage(
        document
          .querySelector('#dphoto')
          .files[0]
      );


    const result =
      await api(
        '/api/admin/dogs',
        {
          method: 'POST',

          body:
            JSON.stringify({
              name:
                document
                  .querySelector('#dname')
                  .value,

              area:
                document
                  .querySelector('#darea')
                  .value,

              sex:
                document
                  .querySelector('#dsex')
                  .value,

              color:
                document
                  .querySelector('#dcolor')
                  .value,

              vaccinationStatus:
                document
                  .querySelector('#dvax')
                  .value,

              sterilizedStatus:
                document
                  .querySelector('#dster')
                  .value,

              description:
                document
                  .querySelector('#ddesc')
                  .value,

              photoData
            })
        }
      );


    e.target.reset();


    await showQr(
      result.dog.id,
      result.dog.name
    );


    await refreshAdmin();


    msg.innerHTML = `
      <div class="notice good">
        Dog created.
        This QR URL is permanent.
      </div>
    `;

  } catch (err) {
    msg.innerHTML = `
      <div class="notice bad">
        ${esc(err.message)}
      </div>
    `;

  } finally {
    btn.disabled = false;
  }
}


/* =========================================================
   ADD ADMIN
========================================================= */

async function addAdmin(e) {
  e.preventDefault();


  const btn =
    document.querySelector('#addAdminBtn');


  const msg =
    document.querySelector('#addAdminMsg');


  btn.disabled = true;


  msg.innerHTML = `
    <div class="notice">
      Creating admin…
    </div>
  `;


  try {
    await api(
      '/api/admin/admins',
      {
        method: 'POST',

        body:
          JSON.stringify({
            username:
              document
                .querySelector('#auser')
                .value,

            password:
              document
                .querySelector('#apass')
                .value,

            role:
              document
                .querySelector('#arole')
                .value
          })
      }
    );


    e.target.reset();


    msg.innerHTML = `
      <div class="notice good">
        Admin created.
      </div>
    `;


    await refreshAdmins();

  } catch (err) {
    msg.innerHTML = `
      <div class="notice bad">
        ${esc(err.message)}
      </div>
    `;

  } finally {
    btn.disabled = false;
  }
}


/* =========================================================
   ADMIN DOGS + SIGHTINGS
========================================================= */

async function refreshAdmin() {
  try {
    const [
      { dogs },
      { sightings }
    ] =
      await Promise.all([
        api('/api/admin/dogs'),
        api('/api/admin/sightings')
      ]);


    document
      .querySelector('#adminDogs')
      .innerHTML =

        dogs.length

          ? dogs.map(
              d => `
                <tr>

                  <td>
                    <strong>
                      ${esc(d.name)}
                    </strong>
                  </td>


                  <td>
                    ${esc(
                      d.area ||
                      '—'
                    )}
                  </td>


                  <td>
                    <code>
                      ${esc(d.id)}
                    </code>
                  </td>


                  <td>

                    <button
                      class="btn secondary qrbtn"
                      data-id="${esc(d.id)}"
                      data-name="${esc(d.name)}"
                    >
                      QR
                    </button>

                  </td>

                </tr>
              `
            ).join('')

          : `
              <tr>
                <td colspan="4">
                  No dogs yet.
                </td>
              </tr>
            `;


    document
      .querySelectorAll('.qrbtn')
      .forEach(
        b =>
          b.addEventListener(
            'click',
            () =>
              showQr(
                b.dataset.id,
                b.dataset.name
              )
          )
      );


    document
      .querySelector('#adminSightings')
      .innerHTML =

        sightings.length

          ? sightings.map(
              s => `
                <tr>

                  <td>

                    <strong>
                      ${esc(s.dog_name)}
                    </strong>

                    <br>

                    <span class="muted">
                      ${esc(
                        fmtTime(s.created_at)
                      )}
                    </span>

                  </td>


                  <td>

                    ${esc(
                      nice(s.condition)
                    )}

                    <br>

                    <span class="muted">
                      GPS ±${Math.round(
                        Number(s.accuracy_m) || 0
                      )}m
                    </span>


                    ${
                      s.note
                        ? `
                            <br>
                            📝 ${esc(s.note)}
                          `
                        : ''
                    }


                    <div style="margin-top:8px">

                      ${navigationButton(
                        s.latitude,
                        s.longitude,
                        '🧭 Navigate'
                      )}

                    </div>

                  </td>


                  <td>

                    <span
                      class="confidence ${esc(
                        s.confidence
                      )}"
                    >

                      ${esc(
                        String(
                          s.moderation_status
                        ).toUpperCase()
                      )}

                    </span>

                    <br>

                    <span class="muted">

                      ${esc(
                        s.risk_reason ||
                        'No automated risk flag'
                      )}

                    </span>

                  </td>


                  <td>

                    ${
                      s.moderation_status ===
                      'review'

                        ? `
                            <button
                              class="btn secondary mod"
                              data-id="${esc(s.id)}"
                              data-status="accepted"
                            >
                              Accept
                            </button>

                            <button
                              class="btn danger mod"
                              data-id="${esc(s.id)}"
                              data-status="rejected"
                            >
                              Reject
                            </button>
                          `

                        : '—'
                    }

                  </td>

                </tr>
              `
            ).join('')

          : `
              <tr>
                <td colspan="4">
                  No sightings yet.
                </td>
              </tr>
            `;


    document
      .querySelectorAll('.mod')
      .forEach(
        b =>
          b.addEventListener(
            'click',
            async () => {
              b.disabled = true;


              try {
                await api(
                  `/api/admin/sighting/${encodeURIComponent(
                    b.dataset.id
                  )}`,
                  {
                    method: 'PATCH',

                    body:
                      JSON.stringify({
                        status:
                          b.dataset.status,

                        confidence:
                          b.dataset.status ===
                          'accepted'
                            ? 'medium'
                            : 'low'
                      })
                  }
                );


                await refreshAdmin();

              } catch (e) {
                alert(
                  e.message
                );


                b.disabled = false;
              }
            }
          )
      );


    if (me?.role === 'owner') {
      await refreshAdmins();
    }

  } catch (e) {
    if (
      e.message ===
      'Unauthorized'
    ) {
      me = null;

      adminLogin();
    } else {
      alert(
        e.message
      );
    }
  }
}


/* =========================================================
   ADMIN MANAGEMENT
========================================================= */

async function refreshAdmins() {
  if (me?.role !== 'owner') {
    return;
  }


  const {
    admins,
    currentAdminId
  } =
    await api(
      '/api/admin/admins'
    );


  const box =
    document.querySelector(
      '#adminsList'
    );


  if (!box) {
    return;
  }


  box.innerHTML =
    admins.length

      ? admins.map(
          a => `
            <tr>

              <td>

                <strong>
                  ${esc(a.username)}
                </strong>


                ${
                  a.id === currentAdminId
                    ? `
                        <br>

                        <span class="muted">
                          You
                        </span>
                      `
                    : ''
                }

              </td>


              <td>
                ${esc(a.role)}
              </td>


              <td>

                ${
                  Number(a.active) === 1

                    ? `
                        <span class="confidence high">
                          ACTIVE
                        </span>
                      `

                    : `
                        <span class="confidence low">
                          DISABLED
                        </span>
                      `
                }

              </td>


              <td>
                ${
                  a.last_login_at
                    ? esc(
                        fmtTime(
                          a.last_login_at
                        )
                      )
                    : 'Never'
                }
              </td>


              <td>

                ${
                  a.id === currentAdminId

                    ? '—'

                    : `
                        <button
                          class="btn ${
                            Number(a.active) === 1
                              ? 'danger'
                              : 'secondary'
                          } admin-toggle"
                          data-id="${esc(a.id)}"
                          data-active="${
                            Number(a.active) === 1
                              ? '0'
                              : '1'
                          }"
                        >
                          ${
                            Number(a.active) === 1
                              ? 'Disable'
                              : 'Enable'
                          }
                        </button>
                      `
                }

              </td>

            </tr>
          `
        ).join('')

      : `
          <tr>
            <td colspan="5">
              No admins.
            </td>
          </tr>
        `;


  document
    .querySelectorAll(
      '.admin-toggle'
    )
    .forEach(
      b =>
        b.addEventListener(
          'click',
          async () => {
            b.disabled = true;


            try {
              await api(
                `/api/admin/admin/${encodeURIComponent(
                  b.dataset.id
                )}`,
                {
                  method: 'PATCH',

                  body:
                    JSON.stringify({
                      active:
                        b.dataset.active ===
                        '1'
                    })
                }
              );


              await refreshAdmins();

            } catch (e) {
              alert(
                e.message
              );


              b.disabled = false;
            }
          }
        )
    );
}


/* =========================================================
   QR
========================================================= */

async function showQr(
  id,
  name
) {
  const url =
    `${location.origin}/dog/${encodeURIComponent(id)}`;


  const m = modal(`
    <div class="modalhead">

      <div>

        <h2>
          Permanent QR
        </h2>


        <div class="muted">
          ${esc(name)}
        </div>

      </div>


      <button
        class="iconbtn"
        data-close
        aria-label="Close"
      >
        ×
      </button>

    </div>


    <div class="qrcard">

      <canvas id="qr"></canvas>


      <p>
        <code>
          ${esc(url)}
        </code>
      </p>


      <div class="notice good">
        Dog details and location history
        can change;
        this QR URL does not.
      </div>


      <div style="margin-top:13px">

        <button
          class="btn"
          id="downloadQr"
        >
          Download QR PNG
        </button>

      </div>

    </div>
  `);


  const canvas =
    m.back.querySelector('#qr');


  await QRCode.toCanvas(
    canvas,
    url,
    {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'H'
    }
  );


  m.back
    .querySelector('#downloadQr')
    .addEventListener(
      'click',
      () => {
        const a =
          document.createElement(
            'a'
          );


        a.download =
          `${name.replace(
            /[^a-z0-9_-]+/gi,
            '-'
          )}-${id.slice(
            0,
            12
          )}-QR.png`;


        a.href =
          canvas.toDataURL(
            'image/png'
          );


        a.click();
      }
    );
}


/* =========================================================
   ROUTER
========================================================= */

async function route() {
  clearMap();
  resetTurnstile(true);


  const path =
    location.pathname;


  if (path === '/') {
    return home();
  }


  if (path === '/admin') {
    return admin();
  }


  const match =
    path.match(
      /^\/dog\/([^/]+)$/
    );


  if (match) {
    return dogPage(
      decodeURIComponent(
        match[1]
      )
    );
  }


  shell(`
    <main>

      <div class="wrap section">

        <div class="card empty">

          <h2>
            Page not found
          </h2>


          <a
            class="btn"
            href="/"
            data-link
          >
            Go home
          </a>

        </div>

      </div>

    </main>
  `);
}


/* =========================================================
   START
========================================================= */

window.addEventListener(
  'popstate',
  route
);


(async () => {
  try {
    config =
      await api(
        '/api/config'
      );
  } catch {}


  route();
})();