import importlib.util
from pathlib import Path

def test_branded_card_keeps_same_code_and_escapes_recipient_text():
    path = Path(__file__).resolve().parents[1] / 'lambda_functions/payment_processor/gift_cards.py'
    spec = importlib.util.spec_from_file_location('gift_card_email', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    card = dict(amountCents=50000, live=True, code='ABCD-EFGH-1234', delivery=dict(recipientName='<script>bad</script>', senderName='Mom & Dad', message='Enjoy <3'))
    markup = module.gift_card_html(card, 'Same redemption code: ABCD-EFGH-1234')
    assert '$500.00' in markup
    assert markup.count('ABCD-EFGH-1234') == 2
    assert '<script>' not in markup
    assert '&lt;script&gt;' in markup
    assert 'Mom &amp; Dad' in markup
    assert 'The Candle Garden logo' in markup
    assert 'NO CASH VALUE' not in markup
    card['live'] = False
    assert 'NO CASH VALUE' in module.gift_card_html(card, '')
