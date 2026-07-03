from rest_framework.parsers import BaseParser


class PlainTextParser(BaseParser):
    """
    Lets the view accept a raw `text/plain` body -- the same "paste raw text,
    no JSON envelope required" ergonomics as the Node API
    (`--data-binary 'your text'`). DRF has no built-in parser for this; it
    only ships JSONParser/FormParser/MultiPartParser out of the box.

    Deliberately does no size check of its own: it hands back the raw string
    and relies entirely on DeslopRequestSerializer's max_length running
    afterward in the view. That ordering is correct today (views.py always
    validates through the serializer before touching the text) but is a
    dependency on view-level discipline, not something this parser enforces
    -- worth keeping in mind if a future code path ever reads request.data
    before validating it.
    """

    media_type = "text/plain"

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read().decode("utf-8", errors="replace")
