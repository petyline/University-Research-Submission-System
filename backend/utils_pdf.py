from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from io import BytesIO


def generate_pdf(sub):
    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=30,
        leftMargin=30,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()

    # Custom Styles
    title_style = ParagraphStyle(
        "TitleStyle", parent=styles["Heading1"], alignment=TA_CENTER, spaceAfter=12
    )

    header_style = ParagraphStyle(
        "HeaderStyle", parent=styles["Normal"], alignment=TA_CENTER, fontSize=12, spaceAfter=10, leading=14
    )

    section_title = ParagraphStyle(
        "SectionTitle", parent=styles["Heading2"], spaceBefore=15, spaceAfter=6
    )

    justified = ParagraphStyle(
        "Justified", parent=styles["Normal"], alignment=TA_JUSTIFY, leading=15
    )

    elements = []

    # University Header
    elements.append(Paragraph("<b>Michael Okpara University of Agriculture, Umudike</b>", header_style))
    elements.append(Paragraph("<b>College of Natural and Applied Sciences (COLPAS)</b>", header_style))
    elements.append(Paragraph("<b>Department of Computer Science</b>", header_style))
    elements.append(Spacer(1, 12))

    # Proposal Title
    elements.append(Paragraph(f"<b>{sub.proposed_title.upper()}</b>", title_style))
    elements.append(Spacer(1, 20))

    # Student and Supervisor Info
    student_name = sub.student.name if sub.student else "Unknown"
    student_reg = sub.student.reg_number if sub.student else "N/A"

    supervisor_name = sub.supervisor.name if sub.supervisor else "Not Assigned"

    elements.append(Paragraph(f"<b>Student:</b> {student_name} ({student_reg})", justified))
    elements.append(Paragraph(f"<b>Supervisor:</b> {supervisor_name}", justified))
    elements.append(Paragraph(f"<b>Proposal Type:</b> {sub.proposal_type}", justified))
    elements.append(Spacer(1, 15))

    # Sections
    def add_section(title, content):
        if content:
            elements.append(Paragraph(title, section_title))
            elements.append(Paragraph(content.replace("\n", "<br/>"), justified))
            elements.append(Spacer(1, 10))

    add_section("1. Background", sub.background)
    add_section("2. Aim", sub.aim)
    add_section("3. Objectives", sub.objectives)
    add_section("4. Methods", sub.methods)
    add_section("5. Expected Results", sub.expected_results)
    add_section("6. Literature Review", sub.literature_review)

    doc.build(elements)
    buffer.seek(0)
    return buffer
