from app.services.contest_sync import decode_entities, strip_tags


def test_decodes_named_numeric_and_nested_entities():
    assert decode_entities('교보 &lt;책갈피&gt; KT&amp;amp;G') == '교보 <책갈피> KT&G'
    assert decode_entities('&#39;제목&#x27; &mdash; &copy;') == "'제목' — ©"


def test_strips_invisible_markers_but_preserves_encoded_title_brackets():
    assert strip_tags('<b>\ufeff공모전 &lt;책갈피&gt;\u200b</b>') == '공모전 <책갈피>'
