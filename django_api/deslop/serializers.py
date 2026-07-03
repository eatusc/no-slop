from rest_framework import serializers

# Same cap as the Node server's MAX_BODY (vite.config.js) -- a request this
# large is almost certainly a mistake or abuse, not a real de-slop job.
# Named (and inherited from the Node side) as if it were a byte count, but
# CharField.max_length actually counts Python str *characters*; for text
# with many multi-byte UTF-8 characters, the wire size could exceed 4MB
# even though this passes. Same imprecision exists in the Node original
# (MAX_BODY there counts JS string .length, i.e. UTF-16 code units, against
# a byte-oriented request stream) -- not fixed here to keep the two engines'
# effective caps aligned rather than introducing a new discrepancy between
# them.
MAX_TEXT_BYTES = 4 * 1024 * 1024


class DeslopRequestSerializer(serializers.Serializer):
    text = serializers.CharField(
        allow_blank=True,
        trim_whitespace=False,  # leading/trailing whitespace can be meaningful in prose
        max_length=MAX_TEXT_BYTES,
        error_messages={"max_length": "Text is too large (4MB limit)."},
    )

# A response-shape serializer tree (SlopSerializer, FixesSerializer, etc.)
# used to live here, documenting the exact response shape from ../../API.md.
# It was removed: nothing ever imported it (views.py returns a plain dict
# straight into Response()), its docstring claimed tests verified it when
# none did, and its `words` field (`in_ = IntegerField(source="in")`) would
# have silently failed validation if ever pointed at real response data --
# `source` remaps an object *attribute* for serialization, not the input
# dict *key* for deserialization, so `DeslopResponseSerializer(data=...)`
# would have looked for a "in_" key that the actual API never sends. The
# response shape is verified for real in tests.py instead (see
# test_post_json_returns_full_report_shape).
