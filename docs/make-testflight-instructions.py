from pathlib import Path

import qrcode
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    Image,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).with_name("Candle-Garden-TestFlight-Instructions.pdf")
GREEN = HexColor("#103831")
CREAM = HexColor("#F7F3EC")
INK = HexColor("#1F2A28")
MUTED = HexColor("#5A6B66")
TESTFLIGHT_URL = "https://apps.apple.com/app/testflight/id899247664"


def testflight_qr_path():
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(TESTFLIGHT_URL)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#103831", back_color="#FFFFFF").convert("RGB")
    path = Path(__file__).with_name("testflight-qr.png")
    img.save(path)
    return path


def make():
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=0.85 * inch,
        rightMargin=0.85 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title="How to open The Candle Garden App in TestFlight",
        author="The Candle Garden",
    )

    title = ParagraphStyle(
        "title",
        fontName="Times-Bold",
        fontSize=22,
        leading=26,
        textColor=GREEN,
        alignment=TA_CENTER,
        spaceAfter=6,
    )
    sub = ParagraphStyle(
        "sub",
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceAfter=16,
    )
    heading = ParagraphStyle(
        "heading",
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=GREEN,
        spaceBefore=12,
        spaceAfter=8,
    )
    body = ParagraphStyle(
        "body",
        fontName="Helvetica",
        fontSize=11,
        leading=16,
        textColor=INK,
        alignment=TA_LEFT,
        spaceAfter=6,
    )
    step = ParagraphStyle(
        "step",
        fontName="Helvetica",
        fontSize=11,
        leading=16,
        textColor=INK,
        leftIndent=4,
    )
    caption = ParagraphStyle(
        "caption",
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=MUTED,
        alignment=TA_CENTER,
    )
    note = ParagraphStyle(
        "note",
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=MUTED,
        spaceBefore=8,
    )
    footer = ParagraphStyle(
        "footer",
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceBefore=14,
    )

    steps = [
        "On your iPhone, open the TestFlight <b>email invite</b>.",
        "Tap <b>View in TestFlight</b> or <b>Start Testing</b>. (No need to scan anything if you do this on the phone.)",
        "If your phone asks you to install TestFlight, you can tap <b>Install</b> — or open Camera and scan the code on this page.",
        "When TestFlight opens, tap <b>Accept</b>, then tap <b>Install</b> next to <b>The Candle Garden App</b>.",
        "When it finishes, tap <b>Open</b>. You can also open it from your Home Screen.",
        "The first time you try the refill camera, tap <b>Allow</b> if asked.",
    ]

    qr = Image(str(testflight_qr_path()), width=1.45 * inch, height=1.45 * inch)
    qr_block = Table(
        [
            [qr],
            [Paragraph("<b>Scan to install TestFlight</b>", caption)],
            [Paragraph("Then open your invite email to get The Candle Garden App.", caption)],
        ],
        colWidths=[1.85 * inch],
    )
    qr_block.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (0, 0), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 6),
                ("TOPPADDING", (0, 1), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 2),
            ]
        )
    )

    step_list = ListFlowable(
        [ListItem(Paragraph(item, step), leftIndent=12, value=i) for i, item in enumerate(steps, start=1)],
        bulletType="1",
        start=1,
        leftIndent=16,
        bulletFontName="Helvetica-Bold",
        bulletFontSize=11,
        bulletColor=GREEN,
    )

    row = Table(
        [[step_list, qr_block]],
        colWidths=[4.55 * inch, 1.85 * inch],
    )
    row.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    story = [
        Paragraph("The Candle Garden App", title),
        Paragraph("Simple steps to open the test version on your iPhone", sub),
        Paragraph("Before you start", heading),
        Paragraph(
            "You need an <b>iPhone</b> and the email that received the TestFlight invite. "
            "This is a private test copy — it is not in the public App Store yet.",
            body,
        ),
        Paragraph(
            "If you open that email <b>on your iPhone</b>, just tap the button. You do not have to scan a code. "
            "Scan the code only if you still need to install TestFlight.",
            body,
        ),
        Paragraph("How to open the app", heading),
        row,
        Paragraph("If you get stuck", heading),
        Paragraph(
            "• Use the <b>same Apple ID</b> that received the invite.<br/>"
            "• Open the TestFlight app and look for <b>The Candle Garden App</b>. Tap <b>Install</b> or <b>Open</b>.<br/>"
            "• If the invite expired, ask us to send a new one.<br/>"
            "• After a new test update, close the app completely (swipe it away) and open it again.",
            body,
        ),
        Paragraph("Questions or problems", heading),
        Paragraph(
            "Contact <b>Mike Walsh</b> by text at <b>904-305-5670</b> or email <b>michaeljameswalshiii@gmail.com</b>. "
            "If something is not working, please include <b>screenshots</b> if you can.",
            body,
        ),
        Paragraph("The Candle Garden  ·  Atlantic Beach, Florida", footer),
    ]

    def decorate(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(GREEN)
        canvas.rect(0, letter[1] - 18, letter[0], 18, fill=1, stroke=0)
        canvas.setFillColor(CREAM)
        canvas.rect(0, 0, letter[0], 28, fill=1, stroke=0)
        canvas.setFillColor(GREEN)
        canvas.rect(0, 28, letter[0], 3, fill=1, stroke=0)
        canvas.restoreState()

    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    print(OUT)


if __name__ == "__main__":
    make()
