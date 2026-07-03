from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from .engine import deslop, flags_for, slop_score, word_count
from .serializers import DeslopRequestSerializer


def _report(text):
    """Builds the exact response shape documented in ../../API.md, so this
    endpoint is a drop-in replacement for the Node one at POST /api/deslop."""
    d = deslop(text)
    s = slop_score(text)
    f = flags_for(text)
    return {
        "clean": d["text"],
        "slop": {"score": s["score"], "label": s["label"], "per100": s["per100"], "signals": s["signals"]},
        "fixes": {"total": d["total"], "byCategory": d["groups"]},
        "flags": f,
        "words": {"in": word_count(text), "out": word_count(d["text"])},
    }


class DeslopView(APIView):
    """
    POST /api/deslop/   body: JSON {"text": "..."} or raw text/plain
    GET  /api/deslop/?text=...   (quick one-liners; use POST for anything long)

    Add ?clean=1 to either verb to get just the cleaned text back as
    text/plain instead of the full JSON report -- convenient for piping.

    No permission_classes override: this mirrors the Node server's posture
    (open to anyone who can reach it, since it holds no state and no PHI-
    equivalent data) but every request is still throttled -- see
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] in settings.py -- which is the
    DRF-native equivalent of the Node server's Origin-header CSRF guard.
    """

    def get(self, request):
        # Routed through the same serializer as POST so the 4MB cap applies
        # here too -- query-string length is bounded elsewhere (browsers/web
        # servers cap URLs around 8KB) but nothing stops a direct HTTP client
        # from sending a huge one, so don't rely on that as the only guard.
        serializer = DeslopRequestSerializer(data={"text": request.query_params.get("text", "")})
        serializer.is_valid(raise_exception=True)
        return self._respond(request, serializer.validated_data["text"])

    def post(self, request):
        # Body arrives as a plain string when Content-Type is text/plain
        # (see parsers.PlainTextParser), or as a parsed dict for JSON.
        if isinstance(request.data, str):
            serializer = DeslopRequestSerializer(data={"text": request.data})
        else:
            serializer = DeslopRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._respond(request, serializer.validated_data["text"])

    def _respond(self, request, text):
        report = _report(text)
        if request.query_params.get("clean") == "1" or request.query_params.get("format") == "text":
            return HttpResponse(report["clean"], content_type="text/plain; charset=utf-8")
        return Response(report)
