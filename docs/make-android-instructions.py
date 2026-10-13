from pathlib import Path

import qrcode
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Table,
    TableStyle,
)

OUT = Path(__file__).with_name("Candle-Garden-Android-Instructions.pdf")
GREEN = HexColor("#103831")
CREAM = HexColor("#F7F3EC")
INK = HexColor("#1F2A28")
MUTED = HexColor("#5A6B66")

# Filled in after the EAS preview APK finishes.
INSTALL_URL = "https://expo.dev/artifacts/eas/UQWSkg95mvHF7r3Gq9aNtSop7PMWrAFXmLZmyTthFCQ.apk"


def qr_path():
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(INSTALL_URL)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#103831", back_color="#FFFFFF").convert("RGB")
    path = Path(__file__).with_name("android-install-qr.png")
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
        title="How to open The Candle Garden App on Android",
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
        "On your Android phone, open the Camera app and point it at the code on this page. Or open the install link we sent you.",
        "Tap the banner or link. It opens a page to install <b>The Candle Garden App</b>.",
        "Tap <b>Install</b> or <b>Download</b>. If the phone says the file is from an unknown source, tap <b>Allow</b> or <b>Install anyway</b>.",
        "When it finishes, tap <b>Open</b>. You can also find it in your app list.",
        "The first time you try the refill camera, tap <b>Allow</b> if asked.",
    ]

    qr = Image(str(qr_path()), width=1.45 * inch, height=1.45 * inch)
    qr_block = Table(
        [
            [qr],
            [Paragraph("<b>Scan to install<br/>The Candle Garden App</b>", caption)],
            [Paragraph("Android test copy<br/>(not the Play Store)", caption)],
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

    row = Table([[step_list, qr_block]], colWidths=[4.55 * inch, 1.85 * inch])
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
        Paragraph("Simple steps to open the test version on your Android phone", sub),
        Paragraph("Before you start", heading),
        Paragraph(
            "You need an <b>Android phone</b> and this page (or the install link). "
            "This is a private test copy. It is not in the Google Play Store yet, and it is not TestFlight (that is iPhone only).",
            body,
        ),
        Paragraph("How to open the app", heading),
        row,
        Paragraph("If you get stuck", heading),
        Paragraph(
            "• Use Chrome or the phone’s browser if the link does not open.<br/>"
            "• If Android blocks the install, open <b>Settings → Security</b> (or the browser’s prompt) and allow installs from that source, then tap the link again.<br/>"
            "• Look in your downloads or app list for <b>The Candle Garden App</b>.<br/>"
            "• After a new test update, uninstall the old copy and install again from this page.",
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
