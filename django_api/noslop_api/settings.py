"""
Minimal Django settings for the No Slop DRF port.

Mirrors the Node/Vite server's posture on purpose: no database beyond an
in-memory one for the test runner, no auth store -- de-slop is a stateless
text transform, so there is nothing to persist and nothing to log in about.

Two defenses replace the Node server's manual Origin-header CSRF guard (see
vite.config.js's noslopApi() handler), split by the shape of the threat:
  - django-cors-headers, scoped to localhost origins only, so a real React/
    Next.js dev server (a different port = a different origin) can call this
    API from the browser -- the thing the Node server's guard explicitly
    allowed for its own same-origin app but Django needs an explicit opt-in
    for, since it's a separate process on a separate port.
  - DRF's AnonRateThrottle, so no single client (browser or otherwise) can
    hammer the endpoint -- the Node server didn't need this because a
    same-machine curl/script has no Origin header and was allowed through
    unconditionally; DRF's throttle applies to everyone equally instead.
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Local proof-of-fit project, not a deployed service: DEBUG=True and a
# hardcoded SECRET_KEY are appropriate here and would not be if this ever
# ran anywhere but a developer's own machine.
SECRET_KEY = "dev-only-not-for-production-this-app-has-no-database-or-auth"
DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

INSTALLED_APPS = [
    # contenttypes/auth are NOT used for anything in this app (no accounts,
    # no models, DEFAULT_AUTHENTICATION_CLASSES is empty below) but can't be
    # dropped: DRF's own internals import django.contrib.auth.models at
    # import time regardless of which authentication classes are configured,
    # and that import fails immediately if contenttypes/auth aren't
    # installed (confirmed by actually removing them and watching
    # `manage.py test` fail with "ContentType doesn't declare an explicit
    # app_label" -- this isn't a guess, it's the real error).
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "corsheaders",
    "deslop",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

# Same posture as vite.config.js's noslopApi(): only ever trust localhost.
CORS_ALLOWED_ORIGIN_REGEXES = [r"^http://localhost:\d+$", r"^http://127\.0\.0\.1:\d+$"]

ROOT_URLCONF = "noslop_api.urls"
WSGI_APPLICATION = "noslop_api.wsgi.application"

# The engine is a pure function over request text -- nothing about a
# de-slop request is ever stored. But Django's test runner (and DRF's
# APITestCase) wrap every test in a DB transaction regardless of whether
# the app defines models, and the auth/contenttypes apps above (needed only
# because DRF's internals import them, see INSTALLED_APPS) carry real
# migrations. A file-based SQLite DB -- created once via `manage.py migrate`
# -- lets those migrations actually apply and persist, so `runserver`
# doesn't nag about 14 unapplied migrations on every run. It's still
# functionally unused: nothing in this app ever queries it. (The test
# runner ignores this file regardless -- Django creates its own isolated
# SQLite test database per run, in memory, for speed.)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

REST_FRAMEWORK = {
    # No accounts exist in this app -- explicit, not just DRF's default,
    # since the default authentication classes (Session/Basic) only work
    # because django.contrib.auth happens to be installed, which it isn't
    # here. AllowAny is also DRF's actual default, stated explicitly so a
    # reader doesn't have to know that to know this endpoint is open.
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "120/min"},
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "deslop.parsers.PlainTextParser",
    ],
}

USE_TZ = True
