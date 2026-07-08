import json
from unittest import mock

from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.throttling import AnonRateThrottle

from .engine import deslop, flags_for, slop_score
from .serializers import MAX_TEXT_BYTES

SLOPPY = (
    "It is not just a tool, it is a revolution. 🚀 Furthermore, our seamless "
    "platform delves into a myriad of features."
)
CLEAN = "The team shipped the feature on time. Tests pass. Users are happy."

# The throttle in settings.py is 120/min for anon users -- fine for real
# traffic, but it would make a fast test loop flaky if two tests landed in
# the same minute. Tests that don't care about throttling disable it.
NO_THROTTLE = {"DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class DeslopEndpointTests(APITestCase):
    url = "/api/deslop/"

    def test_post_json_returns_full_report_shape(self):
        # Checks the exact nested shape documented in ../../API.md, field by
        # field and type by type -- this is what actually stands in for a
        # response serializer here (a prior version tried to also document
        # this shape with an unused DeslopResponseSerializer; it drifted out
        # of sync with nothing catching it, which is exactly what a real
        # assertion against a live response prevents).
        res = self.client.post(self.url, {"text": SLOPPY}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()

        self.assertIsInstance(body["clean"], str)
        self.assertNotIn("🚀", body["clean"])
        self.assertNotIn("—", body["clean"])

        self.assertIsInstance(body["slop"]["score"], int)
        self.assertIsInstance(body["slop"]["label"], str)
        self.assertIsInstance(body["slop"]["per100"], (int, float))
        for key in ("flips", "dashes", "emoji", "openers", "transitions", "hype", "words", "hedges", "vague", "ruleOfThree"):
            self.assertIsInstance(body["slop"]["signals"][key], int)
        self.assertGreater(body["slop"]["score"], 50)

        self.assertIsInstance(body["fixes"]["total"], int)
        for cat in body["fixes"]["byCategory"]:
            self.assertIsInstance(cat["label"], str)
            self.assertIsInstance(cat["count"], int)

        for flag in body["flags"]:
            for key in ("type", "label", "fix", "count", "samples"):
                self.assertIn(key, flag)
            self.assertIsInstance(flag["samples"], list)

        self.assertEqual(body["words"]["in"], len(SLOPPY.split()))
        self.assertIsInstance(body["words"]["out"], int)

    def test_post_raw_text_plain_body_is_accepted(self):
        # Mirrors `curl --data-binary 'text'` against the Node API -- no JSON
        # envelope required, just Content-Type: text/plain.
        res = self.client.post(self.url, data=SLOPPY, content_type="text/plain")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("clean", res.json())

    def test_clean_param_returns_plain_text_not_json(self):
        res = self.client.post(f"{self.url}?clean=1", data=SLOPPY, content_type="text/plain")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res["Content-Type"].startswith("text/plain"))
        # Body IS the clean text directly, not a JSON envelope around it.
        with self.assertRaises(json.JSONDecodeError):
            json.loads(res.content)
        self.assertNotIn("🚀", res.content.decode())

    def test_get_with_query_param(self):
        res = self.client.get(self.url, {"text": "delve into leverage"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["clean"], "Look at use")

    def test_get_also_enforces_the_size_cap(self):
        # GET went through a separate, unvalidated code path until this test
        # was added -- POST enforced the 4MB cap via the serializer, GET did
        # not. Routed through the same serializer now; this pins it down.
        res = self.client.get(self.url, {"text": "a" * (MAX_TEXT_BYTES + 1)})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_text_is_a_no_op_not_an_error(self):
        res = self.client.post(self.url, {"text": ""}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["clean"], "")
        self.assertEqual(res.json()["slop"]["score"], 0)

    def test_clean_text_scores_low_and_is_unchanged(self):
        res = self.client.post(self.url, {"text": CLEAN}, format="json")
        body = res.json()
        self.assertEqual(body["clean"], CLEAN)
        self.assertEqual(body["fixes"]["total"], 0)
        self.assertLess(body["slop"]["score"], 15)

    def test_antithesis_pattern_is_flagged_not_auto_rewritten(self):
        res = self.client.post(self.url, {"text": SLOPPY}, format="json")
        body = res.json()
        flag_types = {f["type"] for f in body["flags"]}
        self.assertIn("antithesis", flag_types)
        # The flagged clause survives in `clean` -- flags are for a human to
        # rewrite by hand, the engine won't touch them automatically.
        self.assertIn("not", body["clean"].lower())

    def test_oversized_text_is_rejected(self):
        huge = "a" * (MAX_TEXT_BYTES + 1)  # one character past the serializer's cap
        res = self.client.post(self.url, {"text": huge}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_text_at_exactly_the_size_cap_is_accepted(self):
        exactly_max = "a" * MAX_TEXT_BYTES
        res = self.client.post(self.url, {"text": exactly_max}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class ThrottleTests(APITestCase):
    """Throttling is the DRF-native stand-in for the Node server's Origin
    CSRF guard (see deslop/views.py docstring)."""

    def setUp(self):
        # Throttle counters are cache-backed (Django's default in-process
        # cache) and persist across tests/requests sharing the same client
        # IP + scope key -- clear it so each test starts from zero.
        cache.clear()

    def test_requests_within_rate_limit_succeed(self):
        for _ in range(5):
            res = self.client.post("/api/deslop/", {"text": "hi"}, format="json")
            self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_requests_past_the_rate_limit_are_blocked(self):
        # The previous version of this test only proved requests *within*
        # the limit succeed -- it would have passed identically even if
        # AnonRateThrottle were misconfigured or silently doing nothing.
        # This drives the count past a (deliberately low) limit and checks
        # for the 429 that's the entire point of throttling existing.
        #
        # @override_settings(REST_FRAMEWORK=...) does NOT work for this --
        # confirmed by trying it first and watching it silently fail (still
        # 200 past the "override"). DRF's SimpleRateThrottle sets
        # `THROTTLE_RATES = api_settings.DEFAULT_THROTTLE_RATES` as a plain
        # class-body attribute, snapshotted once when rest_framework.throttling
        # is first imported -- Django's setting_changed signal that makes
        # override_settings work elsewhere never touches this already-frozen
        # class attribute. Patching the class attribute directly is the actual
        # fix.
        with mock.patch.object(AnonRateThrottle, "THROTTLE_RATES", {"anon": "3/min"}):
            for _ in range(3):
                res = self.client.post("/api/deslop/", {"text": "hi"}, format="json")
                self.assertEqual(res.status_code, status.HTTP_200_OK)
            res = self.client.post("/api/deslop/", {"text": "hi"}, format="json")
            self.assertEqual(res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class EngineParityTests(APITestCase):
    """
    Pins the Python engine's output for known inputs. These exact values were
    cross-checked against the Node engine (../../src/deslop.js) on the same
    inputs, once, manually, before this port was wired into Django -- see the
    project README's "Engine parity" section.

    Honest limitation: this only guards the Python side. It fails loudly if
    engine.py's output for this fixture changes -- that's real regression
    protection. It does NOT run the Node engine and compare live (no Node
    runtime in this test environment), so if src/deslop.js's regex rules
    change without a matching change here, the two engines can drift apart
    silently and nothing in this suite will catch it. There is no automated
    "Node twin" of this test today.
    """

    def test_known_sample_matches_recorded_node_output(self):
        d = deslop(SLOPPY)
        s = slop_score(SLOPPY)
        f = flags_for(SLOPPY)
        # Node reference values for this exact string (npm run in ../.., then
        # `import { deslop, slopScore, flagsFor } from './src/deslop.js'`):
        # total=5 (1 emoji, 1 transition, 3 inflated words), score=100, 1 flag.
        self.assertEqual(d["total"], 5)
        self.assertEqual(s["score"], 100)
        self.assertEqual(len(f), 1)
        self.assertEqual(f[0]["type"], "antithesis")

    def test_arrows_and_check_marks_survive_emoji_stripping(self):
        # Regression: the emoji character class used to include the Arrows block
        # (U+2190-21FF) and the check/cross marks (U+2713-2718), so "5% -> 10%"
        # lost its arrow and "passed check" lost its tick. Those are meaningful
        # in prose, not decorative emoji. Real emoji must still go.
        self.assertEqual(deslop("revenue rose 5% → 10%")["text"], "Revenue rose 5% → 10%")
        self.assertEqual(deslop("passed ✓ shipped 🚀")["text"], "Passed ✓ shipped")
        self.assertNotIn("🚀", deslop("ship it 🚀")["text"])  # emoji still stripped

    def test_lowercase_initial_brand_names_are_not_recapitalized(self):
        # Regression: sentence-start re-capitalization used to uppercase the
        # first letter of the next word blindly, turning "iPhone" into "IPhone".
        # A brand whose second letter is a capital is intentional -- leave it.
        self.assertEqual(deslop("It works. iPhone sales rose.")["text"],
                         "It works. iPhone sales rose.")
        self.assertEqual(deslop("iOS and eBay lead.")["text"], "iOS and eBay lead.")
        # A genuinely lowercase sentence start is still capitalized.
        self.assertEqual(deslop("done. the next step.")["text"], "Done. The next step.")

    def test_lowercase_abbreviations_do_not_trigger_recapitalization(self):
        # "e.g. the point" must not become "e.g. The point".
        self.assertEqual(deslop("shipped it, e.g. the login flow")["text"],
                         "Shipped it, e.g. the login flow")

    def test_all_caps_word_swaps_stay_all_caps(self):
        # Regression: match_case only checked the first character, so an all-caps
        # inflated word ("LEVERAGE") swapped to a title-case plain word ("Use").
        # It should stay all-caps ("USE").
        self.assertEqual(deslop("LEVERAGE the synergy")["text"], "USE the teamwork")

    def test_rounding_matches_js_math_round_not_python_banker_rounding(self):
        # Caught in review: Python's builtin round() is banker's rounding
        # (round-half-to-even -- round(2.5) == 2), but JS's Math.round()
        # always rounds .5 up (Math.round(2.5) === 3). They silently
        # disagree at exact half-integer boundaries. _js_round() exists
        # specifically to match JS; this pins that down directly rather
        # than hoping some slop_score() input happens to land on one.
        from .engine import _js_round
        for x, expected in [(0.5, 1), (2.5, 3), (4.5, 5), (1.4, 1), (1.5, 2), (2.4, 2)]:
            self.assertEqual(_js_round(x), expected, f"_js_round({x}) should be {expected}")
        # The bug this replaced would have failed the first three cases:
        self.assertNotEqual(round(2.5), 3)  # Python's round(): banker's rounding gives 2
        self.assertEqual(_js_round(2.5), 3)  # JS Math.round() semantics: always 3
